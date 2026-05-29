#!/usr/bin/env node
/**
 * benchmark.js — Standalone benchmark runner
 *
 * Usage:
 *   node benchmark.js                     # default sizes [4,10,20,50,100]
 *   node benchmark.js 4 10 20 50 100 200  # custom sizes
 *
 * Outputs:
 *   results/benchmark_<timestamp>.json
 *   results/benchmark_<timestamp>.csv
 */

const os = require("os");
const fs = require("fs");
const path = require("path");
const { generateBots, simulateMatch } = require("./simulation");
const MetricsCollector = require("./metrics");
const TournamentOrchestrator = require("./tournament");

// ── Parse CLI args ──
const defaultSizes = [4, 10, 20, 50, 100];
const sizes = process.argv.length > 2
  ? process.argv.slice(2).map(Number).filter(n => n >= 2 && n <= 200)
  : defaultSizes;

if (sizes.length === 0) {
  console.error("Usage: node benchmark.js [size1] [size2] ...");
  console.error("  Each size must be between 2 and 200.");
  process.exit(1);
}

// ── Setup ──
const metrics = new MetricsCollector();
metrics.startCpuSampling(500); // faster sampling during benchmark
const orchestrator = new TournamentOrchestrator(metrics);

const resultsDir = path.join(__dirname, "..", "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// ── Warm-up run ──
console.log("Warm-up run (4 bots)...");
orchestrator.runTournament(4);

// Wait for CPU samples to stabilize
setTimeout(() => {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║            CloudMorph Air Hockey — Scaling Benchmark        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`System: ${os.cpus()[0].model}`);
  console.log(`CPUs: ${os.cpus().length} | RAM: ${(os.totalmem() / 1073741824).toFixed(1)} GB | Platform: ${os.platform()} ${os.arch()}`);
  console.log(`Node: ${process.version}`);
  console.log("");

  const header = "Bots  | Matches  |  Total Time  | Avg/Match  | Min/Match  | Max/Match  | Champion";
  const sep =    "------|----------|--------------|------------|------------|------------|----------";
  console.log(header);
  console.log(sep);

  const rows = [];

  for (const n of sizes) {
    // Take CPU snapshot before
    const cpuBefore = process.cpuUsage();
    const memBefore = process.memoryUsage();

    const result = orchestrator.runTournament(n);

    // Take CPU snapshot after
    const cpuAfter = process.cpuUsage(cpuBefore);
    const memAfter = process.memoryUsage();

    const row = {
      botCount: n,
      matchCount: result.matchCount,
      totalMs: result.timing.totalMs,
      avgMatchMs: result.timing.avgMatchMs,
      minMatchMs: result.timing.minMatchMs,
      maxMatchMs: result.timing.maxMatchMs,
      champion: result.champion.name,
      championPoints: result.champion.points,
      championWins: result.champion.wins,
      cpuUserMs: cpuAfter.user / 1000,
      cpuSystemMs: cpuAfter.system / 1000,
      heapUsedMB: Math.round(memAfter.heapUsed / 1048576 * 10) / 10,
      rssMB: Math.round(memAfter.rss / 1048576 * 10) / 10,
      timestamp: new Date().toISOString()
    };
    rows.push(row);

    const line = [
      String(n).padStart(5),
      String(result.matchCount).padStart(8),
      (result.timing.totalMs < 1000
        ? `${result.timing.totalMs}ms`
        : `${(result.timing.totalMs / 1000).toFixed(2)}s`
      ).padStart(12),
      `${result.timing.avgMatchMs.toFixed(2)}ms`.padStart(10),
      `${result.timing.minMatchMs.toFixed(2)}ms`.padStart(10),
      `${result.timing.maxMatchMs.toFixed(2)}ms`.padStart(10),
      result.champion.name
    ].join(" | ");
    console.log(line);
  }

  console.log("");

  // ── Save JSON ──
  const jsonData = {
    meta: {
      tool: "CloudMorph Air Hockey Benchmark",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      system: {
        cpuModel: os.cpus()[0].model,
        cpuCount: os.cpus().length,
        totalMemoryGB: Math.round(os.totalmem() / 1073741824 * 10) / 10,
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname()
      }
    },
    results: rows
  };

  const jsonPath = path.join(resultsDir, `benchmark_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log(`JSON saved: ${jsonPath}`);

  // ── Save CSV ──
  const csvHeaders = [
    "botCount", "matchCount", "totalMs", "avgMatchMs", "minMatchMs", "maxMatchMs",
    "champion", "championPoints", "championWins",
    "cpuUserMs", "cpuSystemMs", "heapUsedMB", "rssMB", "timestamp"
  ];
  const csvLines = [csvHeaders.join(",")];
  for (const r of rows) {
    csvLines.push(csvHeaders.map(h => {
      const v = r[h];
      return typeof v === "string" ? `"${v}"` : v;
    }).join(","));
  }

  const csvPath = path.join(resultsDir, `benchmark_${timestamp}.csv`);
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n");
  console.log(`CSV saved:  ${csvPath}`);

  // ── Summary ──
  const metricsSummary = metrics.getSummary();
  console.log("");
  console.log(`Tournaments run: ${metricsSummary.tournaments.length}`);
  console.log(`CPU avg utilization: ${metricsSummary.cpu.avgUtilization.toFixed(1)}%`);
  console.log(`API latency (if server was running): avg ${metricsSummary.latency.avgMs.toFixed(1)}ms, p95 ${metricsSummary.latency.p95Ms.toFixed(1)}ms`);

  metrics.stopCpuSampling();
  console.log("\nBenchmark complete!");
  process.exit(0);
}, 2000);
