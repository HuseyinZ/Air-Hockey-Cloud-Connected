#!/usr/bin/env node
const os = require("os");
const fs = require("fs");
const path = require("path");
const MetricsCollector = require("./metrics");
const TournamentOrchestrator = require("./tournament");

function parseArg(name, defaultVal) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx > -1 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  return defaultVal;
}

const MAX_DURATION_MS = parseArg("max-time", 60000);
const MAX_HEAP_MB = parseArg("max-heap", 1000);
const START_N = parseArg("start", 50);
const STEP_N = parseArg("step", 50);
const MAX_N = parseArg("max", 3000);
const PARALLEL = process.argv.includes("--parallel");
const WORKERS = parseArg("workers", null);

const metrics = new MetricsCollector();
metrics.startCpuSampling(250);
const orchestrator = new TournamentOrchestrator(metrics);

const resultsDir = path.join(__dirname, "..", "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function bar(value, max, width = 20) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return "#".repeat(Math.min(filled, width)) + ".".repeat(Math.max(empty, 0));
}

function getSystemMemUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  return { totalMB: Math.round(total / 1048576), usedMB: Math.round((total - free) / 1048576), freeMB: Math.round(free / 1048576), usedPct: ((total - free) / total) * 100 };
}

console.log("==========================================================================");
console.log("       CloudMorph - Stress Test + Resource Tracking");
console.log("==========================================================================");
console.log("System: " + os.cpus()[0].model);
console.log("CPUs: " + os.cpus().length + " | Total RAM: " + (os.totalmem() / 1073741824).toFixed(1) + " GB");
console.log("Node: " + process.version + " | Platform: " + os.platform() + " " + os.arch());
console.log("");
console.log("Parameters:");
console.log("  Mode:           " + (PARALLEL ? "PARALLEL (" + (WORKERS || os.cpus().length) + " workers)" : "SEQUENTIAL"));
console.log("  Start n:        " + START_N);
console.log("  Step:           +" + STEP_N);
console.log("  Max n:          " + MAX_N);
console.log("  Time threshold: " + MAX_DURATION_MS + " ms (" + (MAX_DURATION_MS / 1000) + "s)");
console.log("  Heap threshold: " + MAX_HEAP_MB + " MB");
console.log("");

const initSys = getSystemMemUsage();
console.log("Initial system memory: " + initSys.usedMB + "/" + initSys.totalMB + " MB (" + initSys.usedPct.toFixed(1) + "% used)");
console.log("");
console.log("Bots  | Matches  |    Time     | Avg/Match | CPU      | Heap     | RSS      | Status");
console.log("------|----------|-------------|-----------|----------|----------|----------|--------");

const allResults = [];
let breakingPoint = null;
let breakReason = null;
let peakHeap = 0, peakRss = 0, peakCpuMs = 0;

(async () => {
  for (let n = START_N; n <= MAX_N; n += STEP_N) {
    let result, totalMs, status, statusLabel;
    try {
      const cpuBefore = process.cpuUsage();
      result = PARALLEL ? await orchestrator.runTournamentParallel(n, WORKERS) : orchestrator.runTournament(n);
      totalMs = result.timing.totalMs;
      const cpuAfter = process.cpuUsage(cpuBefore);
      const memAfter = process.memoryUsage();
      const heapMB = memAfter.heapUsed / 1048576;
      const rssMB = memAfter.rss / 1048576;
      const cpuUserMs = cpuAfter.user / 1000;
      const cpuSystemMs = cpuAfter.system / 1000;
      const cpuTotalMs = cpuUserMs + cpuSystemMs;
      const cpuPercent = (cpuTotalMs / totalMs) * 100;

      peakHeap = Math.max(peakHeap, heapMB);
      peakRss = Math.max(peakRss, rssMB);
      peakCpuMs = Math.max(peakCpuMs, cpuTotalMs);

      if (totalMs > MAX_DURATION_MS) {
        status = "FAIL"; statusLabel = "TIMEOUT";
        breakingPoint = n;
        breakReason = "Tournament time " + (totalMs / 1000).toFixed(1) + "s exceeded " + (MAX_DURATION_MS / 1000) + "s threshold";
      } else if (heapMB > MAX_HEAP_MB) {
        status = "FAIL"; statusLabel = "OOM";
        breakingPoint = n;
        breakReason = "Heap " + heapMB.toFixed(0) + "MB exceeded " + MAX_HEAP_MB + "MB threshold";
      } else {
        status = "OK"; statusLabel = "OK";
      }

      allResults.push({ botCount: n, matchCount: result.matchCount, totalMs, avgMatchMs: result.timing.avgMatchMs, maxMatchMs: result.timing.maxMatchMs, cpuUserMs: Math.round(cpuUserMs), cpuSystemMs: Math.round(cpuSystemMs), cpuPercent: Math.round(cpuPercent * 10) / 10, heapMB: Math.round(heapMB * 10) / 10, rssMB: Math.round(rssMB * 10) / 10, status, timestamp: new Date().toISOString() });

      const timeStr = totalMs < 1000 ? (totalMs + "ms") : ((totalMs / 1000).toFixed(2) + "s");
      console.log(
        String(n).padStart(5) + " | " +
        String(result.matchCount).padStart(8) + " | " +
        timeStr.padStart(11) + " | " +
        (result.timing.avgMatchMs.toFixed(2) + "ms").padStart(9) + " | " +
        (cpuPercent.toFixed(0) + "%").padStart(8) + " | " +
        (heapMB.toFixed(0) + "MB").padStart(8) + " | " +
        (rssMB.toFixed(0) + "MB").padStart(8) + " | " +
        statusLabel
      );

      if (breakingPoint !== null) break;
    } catch (err) {
      statusLabel = "EXCEPTION";
      breakingPoint = n;
      breakReason = "Exception thrown: " + err.message;
      allResults.push({ botCount: n, matchCount: (n * (n - 1)) / 2, totalMs: null, status: "EXCEPTION", error: err.message, timestamp: new Date().toISOString() });
      console.log(String(n).padStart(5) + " | EXCEPTION: " + err.message.slice(0, 50));
      break;
    }
  }

  console.log("");
  console.log("==========================================================================");
  console.log("                         RESOURCE SUMMARY");
  console.log("==========================================================================");
  console.log("");

  const finalSys = getSystemMemUsage();
  const metricsSummary = metrics.getSummary();

  console.log("CPU Usage:");
  console.log("  Peak CPU time:       " + peakCpuMs.toFixed(0) + " ms");
  console.log("  Avg system CPU:      " + metricsSummary.cpu.avgUtilization.toFixed(1) + "%");
  console.log("");

  console.log("Memory Usage:");
  console.log("  Peak heap:           " + peakHeap.toFixed(1) + " MB / " + MAX_HEAP_MB + " MB threshold");
  console.log("    " + bar(peakHeap, MAX_HEAP_MB, 40) + "  " + (peakHeap / MAX_HEAP_MB * 100).toFixed(1) + "%");
  console.log("  Peak RSS:            " + peakRss.toFixed(1) + " MB");
  console.log("  System memory delta: " + (finalSys.usedMB - initSys.usedMB) + " MB");
  console.log("");

  console.log("Timing:");
  const okResults = allResults.filter(r => r.status === "OK");
  if (okResults.length > 0) {
    const longestOk = okResults[okResults.length - 1];
    console.log("  Largest n succeeded: " + longestOk.botCount + " bots (" + longestOk.matchCount + " matches)");
    console.log("  Took:                " + (longestOk.totalMs / 1000).toFixed(2) + "s");
    console.log("  Heap used:           " + longestOk.heapMB + " MB");
  }
  console.log("");

  console.log("==========================================================================");
  if (breakingPoint !== null) {
    console.log("");
    console.log("  BREAKING POINT FOUND: n = " + breakingPoint + " bots");
    console.log("  Reason: " + breakReason);
    const mc = (breakingPoint * (breakingPoint - 1)) / 2;
    console.log("");
    console.log("  At n = " + breakingPoint + ", the system needs to play " + mc.toLocaleString() + " matches.");
    console.log("  CONCLUSION: AWS deployment needed beyond n = " + breakingPoint + " bots.");
  } else {
    console.log("");
    console.log("  No breaking point reached up to n = " + MAX_N);
  }
  console.log("");
  console.log("==========================================================================");

  const jsonData = {
    meta: {
      tool: "CloudMorph Stress Test", version: "2.1.0", timestamp: new Date().toISOString(),
      parameters: { mode: PARALLEL ? "parallel" : "sequential", workers: PARALLEL ? (WORKERS || os.cpus().length) : 1, maxDurationMs: MAX_DURATION_MS, maxHeapMB: MAX_HEAP_MB, startN: START_N, stepN: STEP_N, maxN: MAX_N },
      system: { cpuModel: os.cpus()[0].model, cpuCount: os.cpus().length, totalMemoryGB: Math.round(os.totalmem() / 1073741824 * 10) / 10, platform: os.platform(), arch: os.arch(), nodeVersion: process.version, hostname: os.hostname() },
      breakingPoint, breakReason,
      summary: { peakHeapMB: Math.round(peakHeap * 10) / 10, peakRssMB: Math.round(peakRss * 10) / 10, peakCpuMs: Math.round(peakCpuMs), avgSystemCpuPercent: metricsSummary.cpu.avgUtilization }
    },
    results: allResults
  };

  const modeTag = PARALLEL ? "_parallel" : "_sequential";
  const jsonPath = path.join(resultsDir, "stress_test" + modeTag + "_" + timestamp + ".json");
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log("\nJSON saved: " + jsonPath);

  const csvHeaders = ["botCount", "matchCount", "totalMs", "avgMatchMs", "maxMatchMs", "cpuUserMs", "cpuSystemMs", "cpuPercent", "heapMB", "rssMB", "status", "timestamp"];
  const csvLines = [csvHeaders.join(",")];
  for (const r of allResults) {
    csvLines.push(csvHeaders.map(h => {
      const v = r[h];
      if (v === undefined || v === null) return "";
      return typeof v === "string" ? ('"' + v + '"') : v;
    }).join(","));
  }
  const csvPath = path.join(resultsDir, "stress_test" + modeTag + "_" + timestamp + ".csv");
  fs.writeFileSync(csvPath, csvLines.join("\n") + "\n");
  console.log("CSV saved:  " + csvPath);

  metrics.stopCpuSampling();
  process.exit(0);
})().catch(err => { console.error("Stress test failed:", err); process.exit(1); });
