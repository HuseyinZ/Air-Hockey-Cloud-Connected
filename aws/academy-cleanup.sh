#!/bin/bash
# ═══════════════════════════════════════════════════════════
# CloudMorph — AWS Academy Cleanup
# Lab kapanmadan önce çalıştır (kredit tasarrufu)
# ═══════════════════════════════════════════════════════════

set -euo pipefail

REGION="us-east-1"
CLUSTER_NAME="air-hockey-cluster"
SERVICE_NAME="air-hockey-service"

echo "Cleaning up AWS Academy resources..."

aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
  --desired-count 0 --region "$REGION" > /dev/null 2>&1 || true
echo "  ✓ Service scaled to 0"

sleep 5

aws ecs delete-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
  --force --region "$REGION" > /dev/null 2>&1 || true
echo "  ✓ Service deleted"

aws ecs delete-cluster --cluster "$CLUSTER_NAME" --region "$REGION" > /dev/null 2>&1 || true
echo "  ✓ Cluster deleted"

aws ecr delete-repository --repository-name air-hockey-backend --force --region "$REGION" > /dev/null 2>&1 || true
aws ecr delete-repository --repository-name air-hockey-frontend --force --region "$REGION" > /dev/null 2>&1 || true
echo "  ✓ ECR repos deleted"

aws logs delete-log-group --log-group-name /ecs/air-hockey --region "$REGION" > /dev/null 2>&1 || true
echo "  ✓ Log group deleted"

SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=air-hockey-sg" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "")
if [ -n "$SG_ID" ] && [ "$SG_ID" != "None" ]; then
  aws ec2 delete-security-group --group-id "$SG_ID" --region "$REGION" 2>/dev/null || true
  echo "  ✓ Security group deleted"
fi

echo ""
echo "✓ All resources cleaned up. No ongoing charges."
