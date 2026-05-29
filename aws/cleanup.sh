#!/bin/bash
# ═══════════════════════════════════════════════════════════
# CloudMorph Air Hockey — AWS Cleanup Script
# Tears down all ECS resources to avoid ongoing charges.
# ═══════════════════════════════════════════════════════════

set -euo pipefail

REGION="${1:-us-east-1}"
CLUSTER_NAME="${2:-air-hockey-cluster}"
SERVICE_NAME="air-hockey-service"

echo "Cleaning up AWS resources in ${REGION}..."

# Stop service
echo "▸ Setting desired count to 0..."
aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
  --desired-count 0 --region "$REGION" > /dev/null 2>&1 || true

# Delete service
echo "▸ Deleting ECS service..."
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
  --force --region "$REGION" > /dev/null 2>&1 || true

# Wait a moment
sleep 5

# Delete cluster
echo "▸ Deleting ECS cluster..."
aws ecs delete-cluster --cluster "$CLUSTER_NAME" --region "$REGION" > /dev/null 2>&1 || true

# Delete ECR repositories
echo "▸ Deleting ECR repositories..."
aws ecr delete-repository --repository-name air-hockey-backend --force --region "$REGION" > /dev/null 2>&1 || true
aws ecr delete-repository --repository-name air-hockey-frontend --force --region "$REGION" > /dev/null 2>&1 || true

# Delete log group
echo "▸ Deleting CloudWatch log group..."
aws logs delete-log-group --log-group-name /ecs/air-hockey --region "$REGION" > /dev/null 2>&1 || true

# Delete security group
echo "▸ Deleting security group..."
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=air-hockey-sg" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "")
if [ -n "$SG_ID" ] && [ "$SG_ID" != "None" ]; then
  aws ec2 delete-security-group --group-id "$SG_ID" --region "$REGION" 2>/dev/null || true
fi

echo ""
echo "✓ All AWS resources cleaned up."
echo "  No ongoing charges from this project."
