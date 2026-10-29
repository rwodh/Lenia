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
  // 128 (not 256): the 20-cell Orbium is twice as large on screen and a step costs 4x less. Grid-size
  // independence is verified (tests/browser/orbium-gpu.js check D).
  gridSize: 128,
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

/** Selectable simulation speeds (steps per second). Max steps/frame stays within LOOP.maxStepsPerFrame at 60 Hz. */
export const SPEEDS = Object.freeze([
  Object.freeze({ id: '0.25', label: '0.25x', stepsPerSecond: 15 }),
  Object.freeze({ id: '0.5', label: '0.5x', stepsPerSecond: 30 }),
  Object.freeze({ id: '1', label: '1x', stepsPerSecond: 60 }),
  Object.freeze({ id: '2', label: '2x', stepsPerSecond: 120 }),
]);
export const DEFAULT_SPEED_ID = '1';

/** Live-adjustable parameters: slider ranges (always inside LIMITS) and display precision. */
export const UI_RANGES = Object.freeze({
  mu: Object.freeze({ min: 0.05, max: 0.3, step: 0.005, digits: 3 }),
  sigma: Object.freeze({ min: 0.005, max: 0.04, step: 0.001, digits: 3 }),
  timeSteps: Object.freeze({ min: 5, max: 30, step: 1, digits: 0 }),
});

/**
 * Guided Discovery experiment. The tour lets Orbium settle for observeSteps at sigma 0.015, then lowers sigma.
 * A SETTLED Orbium survives sigma 0.014 and 0.013 but fades at 0.012 and below (0.011: gone within ~20 steps for
 * every settle time tried). Evidence: tests/unit/experiment-evidence.test.js. Note this differs from the
 * seed pattern, which already evaporates at 0.014 when started there (patterns.test.js).
 */
export const EXPERIMENT = Object.freeze({
  param: 'sigma',
  targetValue: 0.011,
  observeSteps: 60,
  watchSteps: 60,
});

export const PALETTES = Object.freeze(['observatory', 'viridis']);
export const TOUR_STORAGE_KEY = 'lenia.tour.v1';
