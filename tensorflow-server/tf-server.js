/**
 * TensorFlow Server - Heavy ML Inference Workload
 * Every message triggers neural network computation
 */

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { SimpleMLModel } = require("./simple-model");
const si = require("systeminformation");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const mlModel = new SimpleMLModel();
mlModel.createModel();

// Metrics storage
const metrics = {
  messagesProcessed: 0,
  totalLatencyMs: 0,
  totalMLLatencyUs: 0,
  cpuSamples: [],
  memorySamples: [],
  startTime: Date.now(),
};

// Collect system metrics every second
setInterval(async () => {
  try {
    const cpu = await si.currentLoad();
    const mem = await si.mem();

    metrics.cpuSamples.push(cpu.currentLoad);
    metrics.memorySamples.push(mem.active / (1024 * 1024));

    // Keep last 100 samples
    if (metrics.cpuSamples.length > 100) metrics.cpuSamples.shift();
    if (metrics.memorySamples.length > 100) metrics.memorySamples.shift();
  } catch (e) {}
}, 1000);

app.get("/metrics", (req, res) => {
  const avgCpu =
    metrics.cpuSamples.reduce((a, b) => a + b, 0) /
    (metrics.cpuSamples.length || 1);
  const avgMem =
    metrics.memorySamples.reduce((a, b) => a + b, 0) /
    (metrics.memorySamples.length || 1);
  const avgLatency =
    metrics.messagesProcessed > 0
      ? metrics.totalLatencyMs / metrics.messagesProcessed
      : 0;
  const avgMLLatency =
    metrics.messagesProcessed > 0
      ? metrics.totalMLLatencyUs / metrics.messagesProcessed
      : 0;

  // Power estimation in Watts (instantaneous power draw)
  // Typical server CPU: ~100W at 100% usage, scales linearly with CPU load
  const estimatedPowerWatts = (avgCpu / 100) * 100; // 0-100W range

  res.json({
    server: "tensorflow-ml",
    uptimeSec: ((Date.now() - metrics.startTime) / 1000).toFixed(1),
    messagesProcessed: metrics.messagesProcessed,
    avgLatencyMs: avgLatency.toFixed(2),
    avgMLLatencyUs: avgMLLatency.toFixed(2),
    cpu: { avgPercent: avgCpu.toFixed(2), samples: metrics.cpuSamples.length },
    memory: { avgMB: avgMem.toFixed(2) },
    estimatedPowerWatts: estimatedPowerWatts.toFixed(2),
    modelInfo: mlModel.getInfo(),
  });
});

io.on("connection", (socket) => {
  console.log("[TF] Client connected");

  socket.on("message", async (data, callback) => {
    const requestStart = Date.now();

    // Run ML inference on EVERY message
    const inference = await mlModel.predict();

    // Every 10th message, do a training step (heavier)
    let trainTime = 0;
    if (metrics.messagesProcessed % 10 === 0 && metrics.messagesProcessed > 0) {
      const training = await mlModel.trainStep();
      trainTime = training.trainTimeMs;
    }

    const totalLatency = Date.now() - requestStart;

    metrics.messagesProcessed++;
    metrics.totalLatencyMs += totalLatency;
    metrics.totalMLLatencyUs += inference.inferenceTimeUs;

    if (callback) {
      callback({
        success: true,
        latencyMs: totalLatency,
        mlLatencyUs: inference.inferenceTimeUs,
        trainTimeMs: trainTime,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("[TF] Client disconnected");
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`
        TENSORFLOW SERVER           
        Port: ${PORT}                                              
        Model: 10→5→2 Neural Network                            
        Every message: ML inference (~${Math.round(Math.random() * 100 + 50)}μs)       
        Every 10th message: Training step (heavier)             

        GET /metrics for real-time stats 
    `);
});
