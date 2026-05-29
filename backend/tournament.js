const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");
const { generateBots, simulateMatch } = require("./simulation");

class TournamentOrchestrator {
  constructor(metricsCollector) {
    this.metrics = metricsCollector;
    this.activeTournament = null;
    this.history = [];
  }

  runTournament(botCount) {
    if (botCount < 2 || botCount > 10000) throw new Error("botCount must be between 2 and 10000");
    const tournamentId = `T-${Date.now()}`;
    const bots = generateBots(botCount);
    const matchCount = (botCount * (botCount - 1)) / 2;
    const standings = bots.map(b => ({ id: b.id, name: b.name, played: 0, wins: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }));
    const pairings = [];
    for (let i = 0; i < botCount; i++) for (let j = i + 1; j < botCount; j++) pairings.push({ a: i, b: j });
    for (let i = pairings.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pairings[i], pairings[j]] = [pairings[j], pairings[i]]; }
    this.activeTournament = { id: tournamentId, botCount, matchCount, mode: "sequential", status: "running", completedMatches: 0, startTime: Date.now() };
    const results = [];
    const matchTimings = [];
    const tournamentStart = process.hrtime.bigint();
    for (let m = 0; m < pairings.length; m++) {
      const { a, b } = pairings[m];
      const matchStart = process.hrtime.bigint();
      const result = simulateMatch(bots[a], bots[b]);
      matchTimings.push(Number(process.hrtime.bigint() - matchStart) / 1e6);
      results.push(result);
      const sa = standings[a]; const sb = standings[b];
      sa.played++; sb.played++;
      sa.goalsFor += result.scoreA; sa.goalsAgainst += result.scoreB;
      sb.goalsFor += result.scoreB; sb.goalsAgainst += result.scoreA;
      sa.goalDiff = sa.goalsFor - sa.goalsAgainst; sb.goalDiff = sb.goalsFor - sb.goalsAgainst;
      if (result.scoreA > result.scoreB) { sa.wins++; sb.losses++; sa.points += 3; } else { sb.wins++; sa.losses++; sb.points += 3; }
      this.activeTournament.completedMatches = m + 1;
    }
    const totalMs = Number(process.hrtime.bigint() - tournamentStart) / 1e6;
    const avgMatchMs = totalMs / pairings.length;
    standings.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name));
    const champion = standings[0];
    const tournamentResult = {
      id: tournamentId, botCount, matchCount, mode: "sequential",
      champion: { id: champion.id, name: champion.name, points: champion.points, wins: champion.wins },
      standings, results,
      timing: { totalMs: Math.round(totalMs), avgMatchMs: Math.round(avgMatchMs * 100) / 100, minMatchMs: Math.round(matchTimings.reduce((m, t) => t < m ? t : m, Infinity) * 100) / 100, maxMatchMs: Math.round(matchTimings.reduce((m, t) => t > m ? t : m, -Infinity) * 100) / 100 },
      completedAt: new Date().toISOString()
    };
    if (this.metrics) this.metrics.recordTournament(tournamentId, botCount, matchCount, totalMs, avgMatchMs);
    this.activeTournament.status = "completed"; this.activeTournament = null;
    this.history.push(tournamentResult);
    if (this.history.length > 50) this.history.shift();
    return tournamentResult;
  }

  async runTournamentParallel(botCount, workerCount = null) {
    if (botCount < 2 || botCount > 10000) throw new Error("botCount must be between 2 and 10000");
    const tournamentId = `T-${Date.now()}-P`;
    const bots = generateBots(botCount);
    const matchCount = (botCount * (botCount - 1)) / 2;
    const numWorkers = Math.min(workerCount || os.cpus().length, matchCount, 32);
    const standings = bots.map(b => ({ id: b.id, name: b.name, played: 0, wins: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }));
    const pairings = [];
    for (let i = 0; i < botCount; i++) for (let j = i + 1; j < botCount; j++) pairings.push({ a: i, b: j });
    for (let i = pairings.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pairings[i], pairings[j]] = [pairings[j], pairings[i]]; }
    this.activeTournament = { id: tournamentId, botCount, matchCount, mode: "parallel", workers: numWorkers, status: "running", completedMatches: 0, startTime: Date.now() };
    const workerPath = path.join(__dirname, "match-worker.js");
    const results = new Array(pairings.length);
    const matchTimings = new Array(pairings.length);
    const tournamentStart = process.hrtime.bigint();
    const workers = [];
    for (let w = 0; w < numWorkers; w++) workers.push(new Worker(workerPath));
    let nextPairing = 0; let completed = 0;
    await new Promise((resolveAll, rejectAll) => {
      const dispatchToWorker = (worker) => {
        if (nextPairing >= pairings.length) return;
        const matchIndex = nextPairing++;
        const { a, b } = pairings[matchIndex];
        const matchStart = process.hrtime.bigint();
        worker.once("message", (msg) => {
          matchTimings[matchIndex] = Number(process.hrtime.bigint() - matchStart) / 1e6;
          if (msg.error) return rejectAll(new Error("Worker error: " + msg.error));
          results[matchIndex] = msg.result;
          completed++;
          this.activeTournament.completedMatches = completed;
          if (completed === pairings.length) resolveAll();
          else dispatchToWorker(worker);
        });
        worker.postMessage({ matchIndex, botA: bots[a], botB: bots[b] });
      };
      workers.forEach(dispatchToWorker);
    });
    await Promise.all(workers.map(w => w.terminate()));
    const totalMs = Number(process.hrtime.bigint() - tournamentStart) / 1e6;
    const avgMatchMs = totalMs / pairings.length;
    for (let m = 0; m < pairings.length; m++) {
      const { a, b } = pairings[m];
      const result = results[m];
      const sa = standings[a]; const sb = standings[b];
      sa.played++; sb.played++;
      sa.goalsFor += result.scoreA; sa.goalsAgainst += result.scoreB;
      sb.goalsFor += result.scoreB; sb.goalsAgainst += result.scoreA;
      sa.goalDiff = sa.goalsFor - sa.goalsAgainst; sb.goalDiff = sb.goalsFor - sb.goalsAgainst;
      if (result.scoreA > result.scoreB) { sa.wins++; sb.losses++; sa.points += 3; } else { sb.wins++; sa.losses++; sb.points += 3; }
    }
    standings.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name));
    const champion = standings[0];
    const tournamentResult = {
      id: tournamentId, botCount, matchCount, mode: "parallel", workers: numWorkers,
      champion: { id: champion.id, name: champion.name, points: champion.points, wins: champion.wins },
      standings, results,
      timing: { totalMs: Math.round(totalMs), avgMatchMs: Math.round(avgMatchMs * 100) / 100, minMatchMs: Math.round(matchTimings.reduce((m, t) => t < m ? t : m, Infinity) * 100) / 100, maxMatchMs: Math.round(matchTimings.reduce((m, t) => t > m ? t : m, -Infinity) * 100) / 100 },
      completedAt: new Date().toISOString()
    };
    if (this.metrics) this.metrics.recordTournament(tournamentId, botCount, matchCount, totalMs, avgMatchMs);
    this.activeTournament.status = "completed"; this.activeTournament = null;
    this.history.push(tournamentResult);
    if (this.history.length > 50) this.history.shift();
    return tournamentResult;
  }

  getStatus() {
    if (this.activeTournament) return { ...this.activeTournament };
    return { status: "idle", lastTournament: this.history.length > 0 ? this.history[this.history.length - 1].id : null };
  }

  getHistory() {
    return this.history.map(t => ({ id: t.id, botCount: t.botCount, matchCount: t.matchCount, mode: t.mode, workers: t.workers, champion: t.champion, timing: t.timing, completedAt: t.completedAt }));
  }

  getTournament(id) { return this.history.find(t => t.id === id) || null; }
}

module.exports = TournamentOrchestrator;
