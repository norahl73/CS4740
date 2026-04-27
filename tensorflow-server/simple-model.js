/**
 * Minimal TensorFlow Model
 * Small neural network that creates measurable CPU load
 */

const tf = require("@tensorflow/tfjs");

class SimpleMLModel {
  constructor() {
    this.model = null;
    this.inputSize = 10;
    this.outputSize = 2;
    this.inferenceCount = 0;
  }

  createModel() {
    const model = tf.sequential();
    model.add(
      tf.layers.dense({
        inputShape: [this.inputSize],
        units: 5,
        activation: "relu",
      }),
    );

    model.add(
      tf.layers.dense({
        units: this.outputSize,
        activation: "softmax",
      }),
    );

    model.compile({
      optimizer: "adam",
      loss: "categoricalCrossentropy",
      metrics: ["accuracy"],
    });

    this.model = model;
    console.log("[ML] Model created: 10 inputs → 5 hidden → 2 outputs");
  }

  async predict() {
    if (!this.model) {
      this.createModel();
    }

    const input = tf.randomNormal([1, this.inputSize]);

    const startTime = process.hrtime.bigint();
    const output = this.model.predict(input);
    await output.data();
    const endTime = process.hrtime.bigint();

    const inferenceTimeUs = Number(endTime - startTime) / 1000;

    input.dispose();
    output.dispose();

    this.inferenceCount++;

    return { inferenceTimeUs };
  }

  async trainStep() {
    if (!this.model) {
      this.createModel();
    }

    const xs = tf.randomNormal([32, this.inputSize]);
    const ys = tf.randomUniform([32, this.outputSize]);

    const startTime = process.hrtime.bigint();
    await this.model.fit(xs, ys, { epochs: 1, batchSize: 16, verbose: false });
    const endTime = process.hrtime.bigint();

    xs.dispose();
    ys.dispose();

    return { trainTimeMs: Number(endTime - startTime) / 1e6 };
  }

  getInfo() {
    return {
      architecture: "10→5→2",
      inferenceCount: this.inferenceCount,
    };
  }
}

module.exports = { SimpleMLModel };
