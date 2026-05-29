/**
 * metrics.js — Performance metrics collector
 * Tracks CPU utilization, API latency, and tournament timing.
 */

const os = require("os");

class MetricsCollector {
  constructor() {
    this.latencies = [];           // { endpoint, method, durationMs, timestamp }
    this.tournamentTimings = [];   // { tournamentId, botCount, matchCount, totalMs, avgMatchMs, timestamps }
    this.cpuSnapshots = [];        // { user, system, idle, timestamp }
    this._prevCpuTimes = this._getCpuTimes();
    this._snapshotInterval = null;
  }

  /** Start periodic CPU sampling (every intervalMs). */
  startCpuSampling(intervalMs = 2000) {
    if (this._snapshotInterval) return;
    this._snapshotInterval = setInterval(() => {
      this._takeCpuSnapshot();
    }, intervalMs);
  }

  stopCpuSampling() {
    if (this._snapshotInterval) {
      clearInterval(this._snapshotInterval);
      this._snapshotInterval = null;
    }
  }

  /** Record a single API call latency. */
  recordLatency(endpoint, method, durationMs) {
    this.latencies.push({
      endpoint,
      method,
      durationMs: Math.round(durationMs * 100) / 100,
      timestamp: new Date().toISOString()
    });
    // Keep last 1000 entries
    if (this.latencies.length > 1000) this.latencies.shift();
  }

  /** Record a completed tournament's timing. */
  recordTournament(tournamentId, botCount, matchCount, totalMs, perMatchMs) {
    this.tournamentTimings.push({
      tournamentId,
      botCount,
      matchCount,
      totalMs: Math.round(totalMs),
      avgMatchMs: Math.round(perMatchMs * 100) / 100,
      timestamp: new Date().toISOString()
    });
  }

  /** Express middleware for automatic latency tracking. */
  latencyMiddleware() {
    return (req, res, next) => {
      const start = process.hrtime.bigint();
      res.on("finish", () => {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1e6;
        this.recordLatency(req.path, req.method, durationMs);
      });
      next();
    };
  }

  /** Get a summary of all collected metrics. */
  getSummary() {
    // CPU
    const recentCpu = this.cpuSnapshots.slice(-30);
    const avgCpu = recentCpu.length > 0
      ? recentCpu.reduce((s, c) => s + c.user + c.system, 0) / recentCpu.length
      : 0;

    // Latency
    const recentLatencies = this.latencies.slice(-100);
    const avgLatency = recentLatencies.length > 0
      ? recentLatencies.reduce((s, l) => s + l.durationMs, 0) / recentLatencies.length
      : 0;

    const p95Latency = this._percentile(recentLatencies.map(l => l.durationMs), 0.95);

    return {
      cpu: {
        currentUtilization: recentCpu.length > 0
          ? Math.round((recentCpu[recentCpu.length - 1].user + recentCpu[recentCpu.length - 1].system) * 10000) / 100
          : 0,
        avgUtilization: Math.round(avgCpu * 10000) / 100,
        snapshots: recentCpu.length
      },
      latency: {
        avgMs: Math.round(avgLatency * 100) / 100,
        p95Ms: Math.round(p95Latency * 100) / 100,
        totalRecorded: this.latencies.length
      },
      tournaments: this.tournamentTimings.map(t => ({
        tournamentId: t.tournamentId,
        botCount: t.botCount,
        matchCount: t.matchCount,
        totalSeconds: Math.round(t.totalMs / 10) / 100,
        avgMatchMs: t.avgMatchMs,
        timestamp: t.timestamp
      })),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemoryMB: Math.round(os.totalmem() / 1048576),
        freeMemoryMB: Math.round(os.freemem() / 1048576),
        uptime: Math.round(process.uptime())
      }
    };
  }

  /** Reset all collected data. */
  reset() {
    this.latencies = [];
    this.tournamentTimings = [];
    this.cpuSnapshots = [];
  }

  // ── Internal helpers ──

  _getCpuTimes() {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (const cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice;
      sys  += cpu.times.sys;
      idle += cpu.times.idle;
      irq  += cpu.times.irq;
    }
    return { user, nice, sys, idle, irq };
  }

  _takeCpuSnapshot() {
    const curr = this._getCpuTimes();
    const prev = this._prevCpuTimes;

    const dUser = curr.user - prev.user;
    const dSys  = curr.sys - prev.sys;
    const dIdle = curr.idle - prev.idle;
    const total = dUser + dSys + dIdle + (curr.nice - prev.nice) + (curr.irq - prev.irq);

    if (total > 0) {
      this.cpuSnapshots.push({
        user: dUser / total,
        system: dSys / total,
        idle: dIdle / total,
        timestamp: new Date().toISOString()
      });
      // Keep last 500
      if (this.cpuSnapshots.length > 500) this.cpuSnapshots.shift();
    }

    this._prevCpuTimes = curr;
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
  }
}

module.exports = MetricsCollector;
