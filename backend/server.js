const express = require("express");
const MetricsCollector = require("./metrics");
const TournamentOrchestrator = require("./tournament");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Metrics & Tournament setup ──
const metrics = new MetricsCollector();
metrics.startCpuSampling(2000);

const orchestrator = new TournamentOrchestrator(metrics);

// Latency tracking middleware (applies to all routes)
app.use(metrics.latencyMiddleware());

// ══════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "air-hockey-backend",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ══════════════════════════════════════
// ORIGINAL SCORE ENDPOINTS (preserved)
// ══════════════════════════════════════
const scores = [];
let tournamentData = null;

app.get("/api/scores", (req, res) => {
  res.json(scores);
});

app.post("/api/scores", (req, res) => {
  const { winner, playerA, playerB, scoreA, scoreB, playedAt } = req.body;

  if (!winner) {
    return res.status(400).json({ error: "winner is required" });
  }

  const entry = {
    id: Date.now().toString(),
    winner,
    playerA: playerA || "Unknown",
    playerB: playerB || "Unknown",
    scoreA: Number(scoreA) || 0,
    scoreB: Number(scoreB) || 0,
    playedAt: playedAt || new Date().toISOString()
  };

  scores.unshift(entry);
  res.status(201).json(entry);
});

app.get("/api/tournament", (req, res) => {
  if (!tournamentData) {
    return res.json({ message: "No tournament data yet" });
  }
  res.json(tournamentData);
});

app.post("/api/tournament", (req, res) => {
  const { champion, standings, results, completedAt } = req.body;

  if (!champion) {
    return res.status(400).json({ error: "champion is required" });
  }

  tournamentData = {
    id: Date.now().toString(),
    champion,
    standings: standings || [],
    results: results || [],
    completedAt: completedAt || new Date().toISOString()
  };

  res.status(201).json(tournamentData);
});

// ══════════════════════════════════════
// SERVER-SIDE TOURNAMENT ORCHESTRATION
// ══════════════════════════════════════

/**
 * POST /api/tournament/run
 * Body: { botCount: number (2-200) }
 * Runs a full round-robin tournament server-side and returns results.
 */
app.post("/api/tournament/run", async (req, res) => {
  const botCount = parseInt(req.body.botCount, 10);
  const parallel = req.body.parallel === true;
  const workers = req.body.workers ? parseInt(req.body.workers, 10) : null;

  if (!botCount || botCount < 2 || botCount > 10000) {
    return res.status(400).json({
      error: "botCount must be an integer between 2 and 10000",
      formula: "M = n*(n-1)/2",
      example: "botCount=10 → 45 matches",
      parallelMode: "Pass parallel:true to use worker threads"
    });
  }

  try {
    const result = parallel
      ? await orchestrator.runTournamentParallel(botCount, workers)
      : orchestrator.runTournament(botCount);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tournament/status
 * Returns current tournament status (running/idle).
 */
app.get("/api/tournament/status", (req, res) => {
  res.json(orchestrator.getStatus());
});

/**
 * GET /api/tournament/history
 * Returns summary of all past tournaments.
 */
app.get("/api/tournament/history", (req, res) => {
  res.json(orchestrator.getHistory());
});

/**
 * GET /api/tournament/:id
 * Returns full details of a specific tournament.
 */
app.get("/api/tournament/:id", (req, res) => {
  const t = orchestrator.getTournament(req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found" });
  res.json(t);
});

// ══════════════════════════════════════
// METRICS ENDPOINTS
// ══════════════════════════════════════

/**
 * GET /api/metrics
 * Returns system metrics: CPU, latency, tournament timings, system info.
 */
app.get("/api/metrics", (req, res) => {
  res.json(metrics.getSummary());
});

/**
 * POST /api/metrics/reset
 * Clears all collected metrics.
 */
app.post("/api/metrics/reset", (req, res) => {
  metrics.reset();
  res.json({ message: "Metrics reset" });
});

// ══════════════════════════════════════
// SCALING BENCHMARK
// ══════════════════════════════════════

/**
 * POST /api/benchmark
 * Body: { sizes: [4, 10, 20, 50, 100] }
 * Runs tournaments at each size and returns comparative timing data.
 */
app.post("/api/benchmark", (req, res) => {
  const sizes = req.body.sizes || [4, 10, 20, 50];

  if (!Array.isArray(sizes) || sizes.some(s => s < 2 || s > 10000)) {
    return res.status(400).json({ error: "sizes must be an array of integers 2-10000" });
  }

  const results = [];
  for (const n of sizes) {
    const t = orchestrator.runTournament(n);
    results.push({
      botCount: n,
      matchCount: t.matchCount,
      totalMs: t.timing.totalMs,
      avgMatchMs: t.timing.avgMatchMs,
      champion: t.champion.name
    });
  }

  res.json({
    benchmark: results,
    system: {
      cpus: require("os").cpus().length,
      platform: require("os").platform(),
      totalMemoryMB: Math.round(require("os").totalmem() / 1048576)
    },
    timestamp: new Date().toISOString()
  });
});

// ══════════════════════════════════════
// START SERVER
// ══════════════════════════════════════
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`  Health:     http://localhost:${PORT}/api/health`);
  console.log(`  Metrics:    http://localhost:${PORT}/api/metrics`);
  console.log(`  Tournament: POST http://localhost:${PORT}/api/tournament/run`);
  console.log(`  Benchmark:  POST http://localhost:${PORT}/api/benchmark`);
});
