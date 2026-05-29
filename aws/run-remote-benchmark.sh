#!/bin/bash

# Usage:
#   ./run-remote-benchmark.sh <PUBLIC_IP>
#   ./run-remote-benchmark.sh 54.123.45.67


set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <PUBLIC_IP_OR_HOSTNAME>"
  exit 1
fi

HOST="$1"
BASE_URL="http://${HOST}:3000"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS_DIR="${PROJECT_DIR}/results"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%S")

mkdir -p "$RESULTS_DIR"

echo "╔══════════════════════════════════════════════════════╗"
echo "║     CloudMorph — Remote Benchmark (AWS ECS)          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Target: ${BASE_URL}"
echo ""

# Health check
echo "▸ Health check..."
HEALTH=$(curl -sf "${BASE_URL}/api/health" 2>/dev/null || echo '{"status":"unreachable"}')
echo "  ${HEALTH}"
echo ""

# Reset metrics before benchmark
echo "▸ Resetting metrics..."
curl -sf -X POST "${BASE_URL}/api/metrics/reset" > /dev/null

# Run benchmark
echo "▸ Running benchmark [4, 10, 20, 50, 100]..."
RESULT=$(curl -sf -X POST "${BASE_URL}/api/benchmark" \
  -H "Content-Type: application/json" \
  -d '{"sizes": [4, 10, 20, 50, 100]}')

echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"

# Save JSON
JSON_FILE="${RESULTS_DIR}/benchmark_aws_${TIMESTAMP}.json"
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
data['environment'] = 'aws-ecs'
data['host'] = '${HOST}'
print(json.dumps(data, indent=2))
" > "$JSON_FILE"
echo ""
echo "  ✓ Saved: ${JSON_FILE}"

# Fetch metrics after benchmark
echo ""
echo "▸ Fetching post-benchmark metrics..."
METRICS=$(curl -sf "${BASE_URL}/api/metrics")
METRICS_FILE="${RESULTS_DIR}/metrics_aws_${TIMESTAMP}.json"
echo "$METRICS" > "$METRICS_FILE"
echo "  ✓ Saved: ${METRICS_FILE}"

# Print comparison-ready summary
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                  Results Summary                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  Platform: {d['system']['platform']} | CPUs: {d['system']['cpus']} | RAM: {d['system']['totalMemoryMB']}MB\")
print()
print('  Bots | Matches |    Time   | Avg/Match')
print('  -----|---------|-----------|----------')
for r in d['benchmark']:
    t = f\"{r['totalMs']}ms\" if r['totalMs'] < 1000 else f\"{r['totalMs']/1000:.2f}s\"
    print(f\"  {r['botCount']:>4} | {r['matchCount']:>7} | {t:>9} | {r['avgMatchMs']:.2f}ms\")
"

echo ""
echo "To compare: place local benchmark JSON alongside this file in results/"
