/**
 * match-worker.js — Worker thread that simulates a single match
 *
 * Bu dosya bir worker thread olarak çalışır. Ana thread'den mesaj alır
 * (iki bot tanımı), maçı simüle eder, sonucu geri gönderir.
 *
 * Birden fazla worker = paralel maçlar.
 */

const { parentPort } = require("worker_threads");
const { simulateMatch } = require("./simulation");

parentPort.on("message", (task) => {
  try {
    const { matchIndex, botA, botB } = task;
    const result = simulateMatch(botA, botB);
    parentPort.postMessage({ matchIndex, result, error: null });
  } catch (err) {
    parentPort.postMessage({
      matchIndex: task.matchIndex,
      result: null,
      error: err.message
    });
  }
});
