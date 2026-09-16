# CloudMorph Air Hockey

CloudMorph Air Hockey is a small cloud-computing project built around an Air Hockey game and a server-side tournament simulator.

The project was mainly used to compare how the same workload behaves in a local Docker environment and on AWS. Instead of only looking at raw speed, the focus was on finding the point where the local setup starts to become impractical as the number of simulated matches grows.

## What the project includes

- Browser-based Air Hockey frontend
- Node.js / Express backend
- Server-side round-robin tournament simulation
- Sequential and parallel execution
- Worker Threads for multi-core processing
- CPU, memory and API latency measurements
- Stress-test and benchmark scripts
- Docker and Docker Compose setup
- AWS deployment scripts
- JSON and CSV benchmark results

## Structure

```text
frontend/
  game UI and benchmark controls

backend/
  Express API
  tournament simulation
  metrics and benchmark tools

aws/
  deployment and cleanup scripts

results/
  benchmark outputs
```

## Running locally

Build and start the containers:

```bash
docker compose up --build
```

Frontend:

```text
http://localhost:8081
```

Backend health check:

```text
http://localhost:3000/api/health
```

## Benchmarking

Run the default benchmark:

```bash
node backend/benchmark.js
```

A constrained Docker configuration is also included for testing the application with limited CPU and memory:

```bash
docker compose -f docker-compose.constrained.yml up --build
```

The collected metrics include:

- tournament completion time
- CPU usage
- memory usage
- average and p95 API latency

For a round-robin tournament with `n` bots, the number of matches is:

```text
n(n - 1) / 2
```

This makes the workload grow quickly as the number of bots increases, which is useful for stress testing.

## AWS

The repository includes scripts for deploying the application to AWS and running the same benchmarks remotely.

More detailed commands and setup notes are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Project notes

The reasoning behind the local-vs-cloud comparison is documented in [PROJECT_NARRATIVE.md](PROJECT_NARRATIVE.md).
