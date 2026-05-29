#!/bin/bash

# Kullanım:
#   chmod +x academy-deploy.sh
#   ./academy-deploy.sh
# ═══════════════════════════════════════════════════════════

set -euo pipefail

REGION="us-east-1"
CLUSTER_NAME="air-hockey-cluster"
SERVICE_NAME="air-hockey-service"
TASK_FAMILY="air-hockey-tournament"
BACKEND_REPO="air-hockey-backend"
FRONTEND_REPO="air-hockey-frontend"
LOG_GROUP="/ecs/air-hockey"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   CloudMorph — AWS Academy Learner Lab Deploy        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Pre-check ──
echo "▸ Pre-check: AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || {
  echo "  ✗ AWS CLI not configured. Run:"
  echo "    aws configure"
  echo "  with your Learner Lab credentials."
  exit 1
}
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
echo "  ✓ Account: ${ACCOUNT_ID}"
echo "  ✓ Region:  ${REGION}"
echo ""

# ── Step 1: Find the Lab execution role ──
echo "▸ Step 1: Finding execution role..."
# Learner Lab typically has 'LabRole' or 'ecsTaskExecutionRole'
ROLE_ARN=""
for ROLE_NAME in "LabRole" "ecsTaskExecutionRole" "ecsTaskRole"; do
  ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query "Role.Arn" --output text 2>/dev/null || echo "")
  if [ -n "$ARN" ] && [ "$ARN" != "None" ]; then
    ROLE_ARN="$ARN"
    echo "  ✓ Found role: ${ROLE_NAME}"
    break
  fi
done

if [ -z "$ROLE_ARN" ]; then
  echo "  ✗ No execution role found. Trying to use LabRole ARN directly..."
  ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/LabRole"
fi

# ── Step 2: Create ECR repositories ──
echo "▸ Step 2: Creating ECR repositories..."
for REPO in $BACKEND_REPO $FRONTEND_REPO; do
  aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" > /dev/null 2>&1 || \
    aws ecr create-repository --repository-name "$REPO" --region "$REGION" > /dev/null
  echo "  ✓ ${REPO}"
done

# ── Step 3: Login to ECR ──
echo "▸ Step 3: ECR login..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_BASE"
echo "  ✓ Logged in"

# ── Step 4: Build & push images ──
echo "▸ Step 4: Building and pushing images..."

echo "  Building backend..."
docker build -t "${BACKEND_REPO}:latest" "${PROJECT_DIR}/backend"
docker tag "${BACKEND_REPO}:latest" "${ECR_BASE}/${BACKEND_REPO}:latest"
docker push "${ECR_BASE}/${BACKEND_REPO}:latest"
echo "  ✓ Backend pushed"

echo "  Building frontend..."
docker build -t "${FRONTEND_REPO}:latest" "${PROJECT_DIR}/frontend"
docker tag "${FRONTEND_REPO}:latest" "${ECR_BASE}/${FRONTEND_REPO}:latest"
docker push "${ECR_BASE}/${FRONTEND_REPO}:latest"
echo "  ✓ Frontend pushed"

# ── Step 5: CloudWatch log group ──
echo "▸ Step 5: CloudWatch log group..."
aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION" 2>/dev/null || true
echo "  ✓ Log group ready"

# ── Step 6: Create ECS cluster ──
echo "▸ Step 6: Creating ECS cluster..."
aws ecs create-cluster --cluster-name "$CLUSTER_NAME" --region "$REGION" > /dev/null 2>&1 || true
echo "  ✓ Cluster ready"

# ── Step 7: Register task definition ──
echo "▸ Step 7: Registering task definition..."

cat > /tmp/task-def.json << TASKEOF
{
  "family": "${TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${ROLE_ARN}",
  "taskRoleArn": "${ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "${ECR_BASE}/${BACKEND_REPO}:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 3000, "protocol": "tcp" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --spider -q http://localhost:3000/api/health || exit 1"],
        "interval": 15,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "backend"
        }
      },
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" }
      ]
    },
    {
      "name": "frontend",
      "image": "${ECR_BASE}/${FRONTEND_REPO}:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 80, "protocol": "tcp" }
      ],
      "dependsOn": [
        { "containerName": "backend", "condition": "HEALTHY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "frontend"
        }
      }
    }
  ]
}
TASKEOF

aws ecs register-task-definition --cli-input-json file:///tmp/task-def.json --region "$REGION" > /dev/null
echo "  ✓ Task definition registered"

# ── Step 8: Network setup ──
echo "▸ Step 8: Network configuration..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text --region "$REGION")

SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query "Subnets[*].SubnetId" --output json --region "$REGION")

# Pick first two subnets
SUBNET_LIST=$(echo "$SUBNETS" | python3 -c "import sys,json; s=json.load(sys.stdin); print(','.join(s[:2]))")

# Security group
SG_NAME="air-hockey-sg"
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=${SG_NAME}" "Name=vpc-id,Values=${VPC_ID}" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group --group-name "$SG_NAME" \
    --description "Air Hockey ECS SG" --vpc-id "$VPC_ID" \
    --query "GroupId" --output text --region "$REGION")
  # Allow HTTP (frontend) and port 3000 (backend API)
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION" 2>/dev/null || true
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region "$REGION" 2>/dev/null || true
fi
echo "  ✓ VPC: ${VPC_ID}"
echo "  ✓ SG:  ${SG_ID}"

# ── Step 9: Create / update service ──
echo "▸ Step 9: Deploying ECS service..."

EXISTING=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" \
  --query "services[?status=='ACTIVE'].status" --output text --region "$REGION" 2>/dev/null || echo "")

NETWORK_CONFIG="awsvpcConfiguration={subnets=[${SUBNET_LIST}],securityGroups=[${SG_ID}],assignPublicIp=ENABLED}"

if [ "$EXISTING" = "ACTIVE" ]; then
  echo "  Service exists, forcing new deployment..."
  aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
    --task-definition "$TASK_FAMILY" --force-new-deployment --region "$REGION" > /dev/null
else
  aws ecs create-service --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" \
    --task-definition "$TASK_FAMILY" --desired-count 1 --launch-type FARGATE \
    --network-configuration "$NETWORK_CONFIG" \
    --region "$REGION" > /dev/null
fi
echo "  ✓ Service deployed"

# ── Step 10: Wait and get IP ──
echo "▸ Step 10: Waiting for task to start (this may take 1-3 minutes)..."
sleep 15

for i in $(seq 1 20); do
  TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" \
    --desired-status RUNNING --query "taskArns[0]" --output text --region "$REGION" 2>/dev/null || echo "None")

  if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
    break
  fi
  echo "  Waiting... (${i}/20)"
  sleep 10
done

if [ "$TASK_ARN" = "None" ] || [ -z "$TASK_ARN" ]; then
  echo ""
  echo "  ⚠ Task not running yet. Check ECS console for status."
  echo "  Common issues:"
  echo "    - Image pull failed → check ECR images exist"
  echo "    - Role permission → check LabRole has ECR/CloudWatch access"
  echo ""
  echo "  To check manually:"
  echo "    aws ecs list-tasks --cluster ${CLUSTER_NAME} --region ${REGION}"
  exit 1
fi

# Get public IP
ENI_ID=$(aws ecs describe-tasks --cluster "$CLUSTER_NAME" --tasks "$TASK_ARN" \
  --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" \
  --output text --region "$REGION" 2>/dev/null || echo "")

PUBLIC_IP=""
if [ -n "$ENI_ID" ]; then
  PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "$ENI_ID" \
    --query "NetworkInterfaces[0].Association.PublicIp" --output text --region "$REGION" 2>/dev/null || echo "")
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Deployment Complete!                     ║"
echo "╠══════════════════════════════════════════════════════╣"
if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
  echo "  Frontend:   http://${PUBLIC_IP}"
  echo "  Health:     http://${PUBLIC_IP}:3000/api/health"
  echo "  Metrics:    http://${PUBLIC_IP}:3000/api/metrics"
  echo ""
  echo "  Run remote benchmark:"
  echo "    ./run-remote-benchmark.sh ${PUBLIC_IP}"
else
  echo "  ⚠ Could not get public IP yet."
  echo "  Check ECS console → Tasks → find the running task"
  echo "  Look for the public IP in the Network section"
fi
echo ""
echo "  ⚠ IMPORTANT: Run cleanup when done!"
echo "    ./academy-cleanup.sh"
echo "╚══════════════════════════════════════════════════════╝"
