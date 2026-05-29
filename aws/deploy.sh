#!/bin/bash

# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh                    # uses defaults
#   ./deploy.sh us-east-1 my-cluster


set -euo pipefail

# ── Configuration ──
REGION="${1:-us-east-1}"
CLUSTER_NAME="${2:-air-hockey-cluster}"
SERVICE_NAME="air-hockey-service"
TASK_FAMILY="air-hockey-tournament"
BACKEND_REPO="air-hockey-backend"
FRONTEND_REPO="air-hockey-frontend"
LOG_GROUP="/ecs/air-hockey"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "╔══════════════════════════════════════════════════════╗"
echo "║     CloudMorph Air Hockey — AWS ECS Deployment       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Account:  ${ACCOUNT_ID}"
echo "  Region:   ${REGION}"
echo "  Cluster:  ${CLUSTER_NAME}"
echo ""

# ── Step 1: Create ECR repositories ──
echo "▸ Step 1: Creating ECR repositories..."
for REPO in $BACKEND_REPO $FRONTEND_REPO; do
  aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" 2>/dev/null || \
    aws ecr create-repository --repository-name "$REPO" --region "$REGION" --image-scanning-configuration scanOnPush=true
done
echo "  ✓ ECR repositories ready"

# ── Step 2: Login to ECR ──
echo "▸ Step 2: Logging in to ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_BASE"
echo "  ✓ ECR login successful"

# ── Step 3: Build & push Docker images ──
echo "▸ Step 3: Building and pushing images..."

echo "  Building backend..."
docker build -t "${BACKEND_REPO}:latest" "${PROJECT_DIR}/backend"
docker tag "${BACKEND_REPO}:latest" "${ECR_BASE}/${BACKEND_REPO}:latest"
docker push "${ECR_BASE}/${BACKEND_REPO}:latest"
echo "  ✓ Backend image pushed"

echo "  Building frontend..."
docker build -t "${FRONTEND_REPO}:latest" "${PROJECT_DIR}/frontend"
docker tag "${FRONTEND_REPO}:latest" "${ECR_BASE}/${FRONTEND_REPO}:latest"
docker push "${ECR_BASE}/${FRONTEND_REPO}:latest"
echo "  ✓ Frontend image pushed"

# ── Step 4: Create CloudWatch log group ──
echo "▸ Step 4: Creating CloudWatch log group..."
aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION" 2>/dev/null || true
echo "  ✓ Log group ready"

# ── Step 5: Create ECS cluster ──
echo "▸ Step 5: Creating ECS cluster..."
aws ecs create-cluster --cluster-name "$CLUSTER_NAME" --region "$REGION" \
  --capacity-providers FARGATE --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
  2>/dev/null || true
echo "  ✓ ECS cluster ready"

# ── Step 6: Register task definition ──
echo "▸ Step 6: Registering task definition..."

# Replace placeholders in task definition
TASK_DEF=$(cat "${PROJECT_DIR}/aws/task-definition.json" \
  | sed "s/ACCOUNT_ID/${ACCOUNT_ID}/g" \
  | sed "s/REGION/${REGION}/g")

echo "$TASK_DEF" > /tmp/task-def-resolved.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-def-resolved.json --region "$REGION"
echo "  ✓ Task definition registered"

# ── Step 7: Get default VPC and subnets ──
echo "▸ Step 7: Fetching VPC configuration..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region "$REGION")
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" --query "Subnets[*].SubnetId" --output text --region "$REGION" | tr '\t' ',')

# Create security group allowing HTTP
SG_NAME="air-hockey-sg"
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${SG_NAME}" "Name=vpc-id,Values=${VPC_ID}" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group --group-name "$SG_NAME" --description "Air Hockey ECS" \
    --vpc-id "$VPC_ID" --query "GroupId" --output text --region "$REGION")
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION"
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region "$REGION"
fi
echo "  ✓ VPC: ${VPC_ID}, SG: ${SG_ID}"

# ── Step 8: Create or update ECS service ──
echo "▸ Step 8: Creating ECS service..."
EXISTING=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" \
  --query "services[0].status" --output text --region "$REGION" 2>/dev/null || echo "MISSING")

if [ "$EXISTING" = "ACTIVE" ]; then
  echo "  Service exists, updating..."
  aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
    --task-definition "$TASK_FAMILY" --force-new-deployment --region "$REGION" > /dev/null
else
  aws ecs create-service --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" \
    --task-definition "$TASK_FAMILY" --desired-count 1 --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG_ID}],assignPublicIp=ENABLED}" \
    --region "$REGION" > /dev/null
fi
echo "  ✓ ECS service deployed"

# ── Step 9: Wait for service to stabilize ──
echo "▸ Step 9: Waiting for service to stabilize..."
aws ecs wait services-stable --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$REGION"
echo "  ✓ Service is stable"

# ── Step 10: Get public IP ──
echo "▸ Step 10: Fetching public endpoint..."
TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" \
  --query "taskArns[0]" --output text --region "$REGION")
ENI_ID=$(aws ecs describe-tasks --cluster "$CLUSTER_NAME" --tasks "$TASK_ARN" \
  --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text --region "$REGION")
PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "$ENI_ID" \
  --query "NetworkInterfaces[0].Association.PublicIp" --output text --region "$REGION")

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                 Deployment Complete!                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "  Frontend:  http://${PUBLIC_IP}"
echo "  Backend:   http://${PUBLIC_IP}:3000/api/health"
echo "  Metrics:   http://${PUBLIC_IP}:3000/api/metrics"
echo "  Benchmark: curl -X POST http://${PUBLIC_IP}:3000/api/benchmark"
echo "╚══════════════════════════════════════════════════════╝"
