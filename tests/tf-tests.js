/**
 * TensorFlow Server Load Test
 * Measures CPU, memory, latency, and power (Watts)
 * Run this against the TensorFlow server only
 */

const io = require("socket.io-client");
const fs = require("fs");
const path = require("path");

// Ensure results directory exists
const resultsDir = path.join(__dirname, "..", "results");
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir);
}

// Configuration
const SERVER_URL = "http://localhost:3001";
const TEST_CONFIG = {
  messageCount: 100, // Number of messages to send
  delayMs: 10, // Delay between messages (ms)
  warmupMessages: 10, // Messages to discard for warmup
};

// Store test results
const testResults = {
  startTime: null,
  endTime: null,
  messages: [],
  serverMetrics: null,
  summary: {},
};

/**
 * Get metrics from TensorFlow server
 */
async function getServerMetrics() {
  try {
    const response = await fetch(`${SERVER_URL}/metrics`);
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch server metrics:", error.message);
    return null;
  }
}

/**
 * Run the load test
 */
async function runLoadTest() {
  console.log(`
      TENSORFLOW SERVER LOAD TEST
      Measuring: CPU, Memory, Latency, Energy (Watts)
    `);

  console.log(`Connecting to TensorFlow server at ${SERVER_URL}...`);

  // Get initial metrics (before test)
  const initialMetrics = await getServerMetrics();
  console.log(`\nInitial server state:`);
  console.log(
    `Messages processed so far: ${initialMetrics?.messagesProcessed || 0}`,
  );
  console.log(`Current CPU: ${initialMetrics?.cpu?.avgPercent || "N/A"}%`);
  console.log(`Current Memory: ${initialMetrics?.memory?.avgMB || "N/A"} MB`);
  console.log(
    `Current Power: ${initialMetrics?.estimatedPowerWatts || "N/A"} W`,
  );

  const socket = io(SERVER_URL);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Connection timeout"));
    }, 10000);

    socket.on("connect", async () => {
      clearTimeout(timeout);
      console.log("\nConnected to server");
      console.log(`\nStarting load test...`);
      console.log(`   Sending ${TEST_CONFIG.messageCount} messages`);
      console.log(`   Delay between messages: ${TEST_CONFIG.delayMs}ms`);
      console.log(
        `   Warmup: ${TEST_CONFIG.warmupMessages} messages (will be discarded)\n`,
      );

      testResults.startTime = Date.now();

      let sentCount = 0;
      let warmupCount = 0;
      const latencies = [];
      const mlLatencies = [];
      const trainTimes = [];

      for (let i = 0; i < TEST_CONFIG.messageCount; i++) {
        const msgStart = Date.now();

        socket.emit(
          "message",
          {
            text: `Test message ${i + 1}`,
            sequence: i + 1,
          },
          (response) => {
            const latency = Date.now() - msgStart;

            // Skip warmup messages in results
            if (i >= TEST_CONFIG.warmupMessages) {
              latencies.push(latency);
              if (response.mlLatencyUs) mlLatencies.push(response.mlLatencyUs);
              if (response.trainTimeMs) trainTimes.push(response.trainTimeMs);

              testResults.messages.push({
                sequence: i + 1,
                latencyMs: latency,
                mlLatencyUs: response.mlLatencyUs || 0,
                trainTimeMs: response.trainTimeMs || 0,
                timestamp: Date.now(),
              });
            } else {
              warmupCount++;
            }

            sentCount++;

            // Progress indicator
            if ((i + 1) % 20 === 0) {
              console.log(
                `   Progress: ${i + 1}/${TEST_CONFIG.messageCount} messages sent`,
              );
            }
          },
        );

        // Delay between sends
        await new Promise((r) => setTimeout(r, TEST_CONFIG.delayMs));
      }

      // Wait for all responses to come back
      console.log("\nWaiting for remaining responses...");
      await new Promise((r) => setTimeout(r, 5000));

      testResults.endTime = Date.now();
      socket.disconnect();

      // Calculate summary statistics
      const successfulMessages = latencies.length;
      const totalTestTime = testResults.endTime - testResults.startTime;
      const throughput = (successfulMessages / totalTestTime) * 1000;

      const avgLatency =
        latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
      const p95Latency = calculatePercentile(latencies, 95);
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      const avgMLLatencyUs =
        mlLatencies.length > 0
          ? mlLatencies.reduce((a, b) => a + b, 0) / mlLatencies.length
          : 0;

      const avgTrainTimeMs =
        trainTimes.length > 0
          ? trainTimes.reduce((a, b) => a + b, 0) / trainTimes.length
          : 0;

      // Get final server metrics
      const finalMetrics = await getServerMetrics();
      testResults.serverMetrics = finalMetrics;

      // Calculate changes from initial to final
      const cpuChange =
        finalMetrics?.cpu?.avgPercent - (initialMetrics?.cpu?.avgPercent || 0);
      const memChange =
        finalMetrics?.memory?.avgMB - (initialMetrics?.memory?.avgMB || 0);
      const powerChange =
        finalMetrics?.estimatedPowerWatts -
        (initialMetrics?.estimatedPowerWatts || 0);

      testResults.summary = {
        testDurationMs: totalTestTime,
        messagesSent: TEST_CONFIG.messageCount,
        messagesProcessed: successfulMessages,
        warmupMessages: warmupCount,
        successRate: (
          (successfulMessages /
            (TEST_CONFIG.messageCount - TEST_CONFIG.warmupMessages)) *
          100
        ).toFixed(2),
        throughputMsgPerSec: throughput.toFixed(2),
        latency: {
          avgMs: avgLatency.toFixed(2),
          p95Ms: p95Latency.toFixed(2),
          maxMs: maxLatency.toFixed(2),
          minMs: minLatency.toFixed(2),
        },
        mlInference: {
          avgLatencyUs: avgMLLatencyUs.toFixed(2),
          trainStepsTriggered: trainTimes.length,
          avgTrainTimeMs: avgTrainTimeMs.toFixed(2),
        },
        resourceConsumption: {
          initialCpuPercent: initialMetrics?.cpu?.avgPercent || "N/A",
          finalCpuPercent: finalMetrics?.cpu?.avgPercent || "N/A",
          cpuChangePercent: cpuChange.toFixed(2),
          initialMemoryMB: initialMetrics?.memory?.avgMB || "N/A",
          finalMemoryMB: finalMetrics?.memory?.avgMB || "N/A",
          memoryChangeMB: memChange.toFixed(2),
          initialPowerWatts: initialMetrics?.estimatedPowerWatts || "N/A",
          finalPowerWatts: finalMetrics?.estimatedPowerWatts || "N/A",
          powerChangeWatts: powerChange.toFixed(2),
        },
        modelInfo: finalMetrics?.modelInfo || {},
      };

      resolve();
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Connection error: ${error.message}`));
    });
  });

  return testResults;
}

/**
 * Calculate percentile from an array of numbers
 */
function calculatePercentile(arr, percentile) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

/**
 * Print formatted results
 */
function printResults(results) {
  const s = results.summary;

  console.log(`
    TensorFlow Server Test Results:

    TEST METRICS
      Test Duration:        ${s.testDurationMs} ms (${(s.testDurationMs / 1000).toFixed(1)} sec)
      Messages Sent:         ${s.messagesSent}
      Messages Processed:    ${s.messagesProcessed}
      Success Rate:          ${s.successRate}%
      Throughput:            ${s.throughputMsgPerSec} msgs/sec

    LATENCY METRICS
      Average Latency:       ${s.latency.avgMs} ms
      95th Percentile:       ${s.latency.p95Ms} ms
      Max Latency:           ${s.latency.maxMs} ms
      Min Latency:           ${s.latency.minMs} ms

    ML INFERENCE METRICS
      Avg ML Inference:      ${s.mlInference.avgLatencyUs} μs (${(s.mlInference.avgLatencyUs / 1000).toFixed(2)} ms)
      Training Steps:        ${s.mlInference.trainStepsTriggered}
      Avg Training Time:     ${s.mlInference.avgTrainTimeMs} ms

    METRICS FOR OUR EXPERIMENT
      CPU Usage:             ${s.resourceConsumption.initialCpuPercent}% → ${s.resourceConsumption.finalCpuPercent}% (Δ ${s.resourceConsumption.cpuChangePercent}%)
      Memory Usage:          ${s.resourceConsumption.initialMemoryMB} MB → ${s.resourceConsumption.finalMemoryMB} MB (Δ ${s.resourceConsumption.memoryChangeMB} MB)
      Estimated Energy:      ${s.resourceConsumption.initialPowerWatts} W → ${s.resourceConsumption.finalPowerWatts} W (Δ ${s.resourceConsumption.powerChangeWatts} W)
    `);
}

/**
 * Save results to CSV and JSON files
 */
function saveResults(results) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Save raw message data to CSV
  const csvHeader = [
    "sequence",
    "timestamp",
    "latencyMs",
    "mlLatencyUs",
    "trainTimeMs",
  ];
  const csvRows = results.messages.map((msg) => [
    msg.sequence,
    msg.timestamp,
    msg.latencyMs,
    msg.mlLatencyUs,
    msg.trainTimeMs,
  ]);

  const csvContent = [csvHeader, ...csvRows]
    .map((row) => row.join(","))
    .join("\n");
  fs.writeFileSync(
    path.join(resultsDir, `tf_test_messages_${timestamp}.csv`),
    csvContent,
  );

  // Save summary to JSON
  const summaryToSave = {
    testTimestamp: timestamp,
    config: TEST_CONFIG,
    summary: results.summary,
    serverMetrics: results.serverMetrics,
  };
  fs.writeFileSync(
    path.join(resultsDir, `tf_test_summary_${timestamp}.json`),
    JSON.stringify(summaryToSave, null, 2),
  );

  console.log(`\nResults saved to:`);
  console.log(
    `   ${path.join(resultsDir, `tf_test_messages_${timestamp}.csv`)}`,
  );
  console.log(
    `   ${path.join(resultsDir, `tf_test_summary_${timestamp}.json`)}`,
  );
}

/**
 * Main function
 */
async function main() {
  try {
    // First, check if server is running
    console.log("Checking if TensorFlow server is running...");
    const checkResponse = await fetch(SERVER_URL).catch(() => null);

    if (!checkResponse) {
      console.error(`ERROR: Cannot connect to TensorFlow server`);
      process.exit(1);
    }

    await runLoadTest();
    printResults(testResults);
    saveResults(testResults);

    console.log(`Test complete + metrics collected!`);
  } catch (error) {
    console.error("Test failed:", error.message);
    process.exit(1);
  }
}

// Run the test
main();
