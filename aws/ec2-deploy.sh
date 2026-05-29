#!/bin/bash
# ═══════════════════════════════════════════════════════════
# CloudMorph Air Hockey — AWS Academy EC2 Deployment
# ECR/ECS yerine EC2 + Docker Compose kullanır.
# Learner Lab kısıtlamalarıyla uyumlu.
# ═══════════════════════════════════════════════════════════

set -euo pipefail

REGION="us-east-1"
KEY_NAME="air-hockey-key"
SG_NAME="air-hockey-sg"
INSTANCE_TYPE="t2.micro"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   CloudMorph — AWS Academy EC2 Deploy                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Pre-check ──
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || {
  echo "  ✗ AWS credentials not configured"; exit 1
}
echo "  Account: ${ACCOUNT_ID} | Region: ${REGION}"
echo ""

# ── Step 1: Create Key Pair ──
echo "▸ Step 1: Creating key pair..."
KEY_FILE="${PROJECT_DIR}/aws/${KEY_NAME}.pem"
if [ -f "$KEY_FILE" ]; then
  echo "  Key file already exists, skipping..."
else
  aws ec2 delete-key-pair --key-name "$KEY_NAME" --region "$REGION" 2>/dev/null || true
  aws ec2 create-key-pair --key-name "$KEY_NAME" --region "$REGION" \
    --query "KeyMaterial" --output text > "$KEY_FILE"
  chmod 400 "$KEY_FILE"
  echo "  ✓ Key pair created: ${KEY_FILE}"
fi

# ── Step 2: Security Group ──
echo "▸ Step 2: Setting up security group..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text --region "$REGION")

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=${SG_NAME}" "Name=vpc-id,Values=${VPC_ID}" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group --group-name "$SG_NAME" \
    --description "Air Hockey EC2" --vpc-id "$VPC_ID" \
    --query "GroupId" --output text --region "$REGION")
  # SSH
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr 0.0.0.0/0 --region "$REGION" 2>/dev/null || true
  # Frontend
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 8081 --cidr 0.0.0.0/0 --region "$REGION" 2>/dev/null || true
  # Backend API
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region "$REGION" 2>/dev/null || true
fi
echo "  ✓ Security group: ${SG_ID}"

# ── Step 3: Find Amazon Linux 2023 AMI ──
echo "▸ Step 3: Finding AMI..."
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-2023*-x86_64" "Name=state,Values=available" \
  --query "sort_by(Images, &CreationDate)[-1].ImageId" \
  --output text --region "$REGION")
echo "  ✓ AMI: ${AMI_ID}"

# ── Step 4: User data script (runs on boot) ──
echo "▸ Step 4: Preparing startup script..."

USER_DATA=$(cat << 'USERDATA'
#!/bin/bash
set -e

# Install Docker
yum update -y
yum install -y docker git
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# Install Docker Compose
DOCKER_COMPOSE_VERSION="v2.29.1"
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Install Node.js (for standalone benchmark)
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# Create project directory (files will be uploaded via SCP)
mkdir -p /home/ec2-user/project
chown -R ec2-user:ec2-user /home/ec2-user/project

# Signal that setup is complete
touch /home/ec2-user/.setup-complete
USERDATA
)

USER_DATA_B64=$(echo "$USER_DATA" | base64 -w 0 2>/dev/null || echo "$USER_DATA" | base64)

# ── Step 5: Launch EC2 instance ──
echo "▸ Step 5: Launching EC2 instance (${INSTANCE_TYPE})..."
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --user-data "$USER_DATA_B64" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=air-hockey-server}]" \
  --query "Instances[0].InstanceId" \
  --output text \
  --region "$REGION")
echo "  ✓ Instance: ${INSTANCE_ID}"

# ── Step 6: Wait for running ──
echo "▸ Step 6: Waiting for instance to start..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text --region "$REGION")
echo "  ✓ Public IP: ${PUBLIC_IP}"

# ── Step 7: Wait for setup to complete ──
echo "▸ Step 7: Waiting for Docker setup to finish (2-3 minutes)..."
echo "  (The instance is installing Docker and cloning the repo)"

# Save connection info
cat > "${PROJECT_DIR}/aws/connection-info.txt" << EOF
═══════════════════════════════════════════
  Air Hockey AWS Deployment Info
═══════════════════════════════════════════
Instance ID:  ${INSTANCE_ID}
Public IP:    ${PUBLIC_IP}
Region:       ${REGION}
Key File:     ${KEY_FILE}

SSH Command:
  ssh -i "${KEY_FILE}" ec2-user@${PUBLIC_IP}

Frontend:  http://${PUBLIC_IP}:8081
Backend:   http://${PUBLIC_IP}:3000/api/health
Benchmark: http://${PUBLIC_IP}:3000/api/benchmark

Cleanup:
  aws ec2 terminate-instances --instance-ids ${INSTANCE_ID} --region ${REGION}
═══════════════════════════════════════════
EOF

sleep 90
echo "  Uploading project files via SCP..."
SCP_OPTS="-i ${KEY_FILE} -o StrictHostKeyChecking=no -o ConnectTimeout=10"

# Retry SCP until instance is ready
for attempt in $(seq 1 10); do
  if scp $SCP_OPTS -r "${PROJECT_DIR}/backend" "${PROJECT_DIR}/frontend" "${PROJECT_DIR}/docker-compose.yml" \
    ec2-user@${PUBLIC_IP}:/home/ec2-user/project/ 2>/dev/null; then
    echo "  ✓ Files uploaded"
    break
  fi
  echo "  Waiting for SSH... (${attempt}/10)"
  sleep 15
done

# Build and start containers
echo "▸ Step 8: Building and starting containers on EC2..."
ssh $SCP_OPTS ec2-user@${PUBLIC_IP} << 'SSHEOF'
  cd /home/ec2-user/project
  sudo docker compose up --build -d
  sleep 5
  sudo docker ps
SSHEOF

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Deployment Complete!                     ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "  Frontend:  http://${PUBLIC_IP}:8081"
echo "  API:       http://${PUBLIC_IP}:3000/api/health"
echo "  Metrics:   http://${PUBLIC_IP}:3000/api/metrics"
echo ""
echo "  SSH:  ssh -i \"${KEY_FILE}\" ec2-user@${PUBLIC_IP}"
echo ""
echo "  Run benchmark on AWS:"
echo "    curl -s -X POST http://${PUBLIC_IP}:3000/api/benchmark \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"sizes\": [4, 10, 20, 50, 100]}'"
echo ""
echo "  ⚠ CLEANUP when done:"
echo "    aws ec2 terminate-instances --instance-ids ${INSTANCE_ID} --region ${REGION}"
echo "╚══════════════════════════════════════════════════════╝"
