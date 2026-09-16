# Project Rationale

The first version of this project was based on a simple question: how does the application behave locally compared with running it on AWS?

For the final version, I focused on a more measurable problem: finding the workload size where a constrained local Docker setup starts to become impractical, and then running the same workload in the cloud for comparison.

## Test flow

1. Run a baseline benchmark locally.
2. Increase the number of tournament participants gradually.
3. Monitor execution time, CPU usage, memory usage and API latency.
4. Identify the point where the local environment becomes too slow or resource constrained.
5. Deploy the same application to AWS.
6. Run the same benchmark remotely and compare the results.

## Breaking-point criteria

The benchmark can be considered beyond the useful local limit when one or more of these conditions occur:

- tournament execution takes too long for interactive use
- CPU remains close to full utilization
- memory usage approaches the container limit
- API requests start timing out or responding too slowly

These limits can be adjusted depending on the Docker resource configuration.

## Stress testing

Example:

```bash
node backend/stress-test.js --max-time 20000 --start 100 --step 100
```

To test under stricter local resource limits:

```bash
docker compose -f docker-compose.constrained.yml up --build
```

## Cloud comparison

After deploying the backend, the same benchmark sizes can be sent to the remote API:

```bash
curl -X POST http://AWS_IP:3000/api/benchmark \
  -H "Content-Type: application/json" \
  -d '{"sizes":[100,200,300,500,1000]}'
```

The purpose of the comparison is not to assume that the cloud environment will always be faster. The useful result is to see how the workload behaves under different resource limits and where each setup reaches its practical limit.
