# CloudMorph Air Hockey — Deployment & Benchmark Guide

## Project Structure

```
├── backend/
│   ├── server.js          # Express API server
│   ├── simulation.js      # Physics-based match simulation engine
│   ├── tournament.js      # Round-robin tournament orchestrator
│   ├── metrics.js         # CPU, latency, timing metrics collector
│   ├── benchmark.js       # Standalone benchmark runner (CLI)
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── index.html         # UI with Play / Server Tournament / Benchmark tabs
│   ├── game.js            # Client-side game engine + server API integration
│   ├── style.css
│   ├── nginx.conf         # Reverse proxy config (/api/* → backend:3000)
│   └── Dockerfile
├── aws/
│   ├── task-definition.json    # ECS Fargate task definition
│   ├── deploy.sh               # One-command AWS deployment
│   ├── cleanup.sh              # Tear down all AWS resources
│   └── run-remote-benchmark.sh # Run benchmark against AWS deployment
├── results/                    # Benchmark output (JSON + CSV)
└── docker-compose.yml          # Local multi-container setup
```

## 1. Local Docker Deployment

```bash
# Build and start both containers
docker-compose up --build

# Access the application
# Frontend: http://localhost:8081
# Backend:  http://localhost:3000/api/health
```

## 2. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/scores` | List match scores |
| POST | `/api/scores` | Record a match score |
| POST | `/api/tournament/run` | Run server-side tournament `{botCount: n}` |
| GET | `/api/tournament/status` | Current tournament status |
| GET | `/api/tournament/history` | Past tournament summaries |
| GET | `/api/metrics` | System metrics (CPU, latency, timing) |
| POST | `/api/metrics/reset` | Clear collected metrics |
| POST | `/api/benchmark` | Run scaling benchmark `{sizes: [4,10,20,50,100]}` |

## 3. Running Benchmarks

### CLI Benchmark (recommended for data collection)

```bash
# Default sizes (4, 10, 20, 50, 100 bots)
node backend/benchmark.js

# Custom sizes
node backend/benchmark.js 4 10 20 50 100 200

# Output saved to results/ as JSON + CSV
```

### API Benchmark

```bash
curl -X POST http://localhost:3000/api/benchmark \
  -H "Content-Type: application/json" \
  -d '{"sizes": [4, 10, 20, 50, 100]}'
```

### Frontend Benchmark

Open http://localhost:8081 → "Benchmark" tab → select sizes → Run.

## 4. AWS ECS Deployment (Part 2)

### Prerequisites

- AWS CLI installed and configured (`aws configure`)
- Docker installed and running
- IAM permissions: ECR, ECS, CloudWatch Logs, EC2 (VPC/SG)

### Deploy

```bash
cd aws
chmod +x deploy.sh
./deploy.sh              # defaults: us-east-1, air-hockey-cluster
./deploy.sh eu-west-1    # custom region
```

The script will:
1. Create ECR repositories
2. Build and push Docker images
3. Create CloudWatch log group
4. Create ECS Fargate cluster
5. Register task definition
6. Configure networking (VPC, security group)
7. Create and stabilize ECS service
8. Output the public IP

### Run Remote Benchmark

```bash
chmod +x run-remote-benchmark.sh
./run-remote-benchmark.sh <PUBLIC_IP>
# Results saved to results/benchmark_aws_<timestamp>.json
```

### Cleanup (avoid ongoing charges!)

```bash
chmod +x cleanup.sh
./cleanup.sh
```

## 5. Metrics Collected

| Metric | Source | Description |
|--------|--------|-------------|
| CPU Utilization | `os.cpus()` sampling | Percentage of CPU time used |
| API Latency | Express middleware | Per-request response time (avg, p95) |
| Tournament Time | `process.hrtime` | Total and per-match completion time |
| Memory Usage | `process.memoryUsage()` | Heap and RSS in MB |
| System Info | `os` module | CPU model, core count, total RAM |

## 6. Tournament Model

Round-robin formula: **M = n(n-1)/2**

| Bots (n) | Matches (M) |
|----------|-------------|
| 4 | 6 |
| 10 | 45 |
| 20 | 190 |
| 50 | 1,225 |
| 100 | 4,950 |
| 200 | 19,900 |
