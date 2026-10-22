/** Hard limits and defaults. Everything user-controlled is validated against these. */

export const LIMITS = Object.freeze({
  gridSizes: Object.freeze([64, 128, 256, 512]),
  radius: Object.freeze({ min: 3, max: 24 }),
  timeSteps: Object.freeze({ min: 1, max: 100 }),
  mu: Object.freeze({ min: 0, max: 1 }),
  sigma: Object.freeze({ min: 0.001, max: 0.5 }),
  /** Upper bound on (grid^2 * kernelDiameter^2): kernel taps per simulation step. */
  maxTapsPerStep: 200_000_000,
  /** Cap on drawing-buffer size so very large / high-DPI screens degrade gracefully. */
  maxCanvasPixels: 4096 * 2160,
  /** Bounds for imported/decoded patterns (RLE text): untrusted input must not allocate unboundedly. */
  pattern: Object.freeze({ maxDimension: 256, maxRleLength: 100_000 }),
});

export const DEFAULT_PARAMS = Object.freeze({
  gridSize: 256,
  radius: 13,
  timeSteps: 10,
  mu: 0.15,
  sigma: 0.015,
  seed: 1337,
});

export const LOOP = Object.freeze({
  stepsPerSecond: 60,
  /** Cap on catch-up steps per frame; excess time is dropped instead of spiralling. */
  maxStepsPerFrame: 4,
  /** Frames of GPU work allowed in flight; beyond this the loop skips submitting. */
  maxFramesInFlight: 2,
  /** Consecutive un-throttled frames before the loop stops considering itself GPU-bound. */
  gpuBoundRecoveryFrames: 60,
  hudIntervalMs: 250,
});
