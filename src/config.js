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
  /**
   * Frames of GPU work allowed in flight; beyond this the loop skips submitting. 3, not 2 (owner decision, 9 Nov 2026): on a
   * 144 Hz display a frame fence signals 1 to 2 frames after submission even when the GPU is nearly idle, so with 2 the loop
   * held back up to 64 % of frames and reported itself GPU-limited while the GPU worked about 1 ms of each 7 ms frame
   * (DECISIONS.md 7, docs/reports/2026-11-08-m1.md). Still a bound: at 60 Hz, 3 frames is 50 ms of queued work.
   */
  maxFramesInFlight: 3,
  /**
   * GPU-limited flag (owner decision, 9 Nov 2026; nextGpuBound in src/simulation/scheduler.js; DECISIONS.md 7): ON when the
   * simulation achieved fewer than gpuBoundOnRatio of the requested steps over the last ~gpuBoundWindowMs and the frame fence held
   * a frame back in that window; OFF once the fence has held nothing back for gpuBoundRecoveryMs, whatever the step rate.
   */
  gpuBoundWindowMs: 1000,
  gpuBoundOnRatio: 0.9,
  gpuBoundRecoveryMs: 1000,
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
  /** The tour runs on this library pattern: it selects it when it opens and leaves it selected. */
  patternId: 'O2u',
  param: 'sigma',
  targetValue: 0.011,
  observeSteps: 60,
  watchSteps: 60,
});

/**
 * Observatory: read-only measurements of the simulation state (src/simulation/observables.js), sampled from the GPU
 * asynchronously (src/gl/readback.js). The values below were approved by the owner on 3 Nov 2026; their evidence is in
 * DECISIONS.md 25-26.
 */
export const OBSERVATORY = Object.freeze({
  /** A cell counts towards "active area" when its value is strictly greater than this. */
  activeThreshold: 0.01,
  /** Below this total, the field has no mass to locate: the centroid is undefined. */
  minMass: 1e-3,
  /** Circular concentration (0..1, per axis) below which the centroid is reported as not meaningful. */
  minConcentration: 0.5,
  /** Minimum time between readback submissions; larger grids sample less often (more bytes, more CPU per sample). */
  sampleIntervalMs: 250,
  sampleIntervalLargeMs: 500,
  largeGridFrom: 512,
  /** Samples kept for the chart (a ring buffer; older samples are dropped). */
  historyLength: 240,
});

/** World View (display only; src/render/view-math.js). Zoom 1 shows the whole world; the view never changes the simulation. */
export const VIEW = Object.freeze({
  /** Largest magnification over the default fit (at grid 128 on a 600 px square, one cell is then about 75 px). */
  maxZoom: 16,
  /** Zoom factor of one button press or + / - key. */
  stepFactor: 1.5,
  /** Wheel: zoom factor per wheel pixel (exp(-deltaY * k)), and the most one wheel event may change the zoom. */
  wheelPerPixel: 0.002,
  wheelMaxFactor: 2,
  /** Arrow keys pan by this fraction of the visible square. */
  keyPanFraction: 0.1,
  /** A pointer that moves less than this (CSS px) between press and release is a click, not a drag. */
  clickSlopPx: 4,
});

/**
 * Visualization aids (display only; src/gl/overlay.js). Off is the default and allocates nothing. The decay is applied once
 * per simulation step; its half-life in steps is ln(0.5) / ln(decay) (0.95: about 14 steps; 0.999: about 690 steps).
 */
export const VISUAL = Object.freeze({
  modes: Object.freeze(['off', 'trails', 'activity']),
  decay: Object.freeze({ min: 0.8, max: 0.999, step: 0.001, default: 0.95 }),
});

/** Phase 4b: organisms added to a running world (copies of the selected one). Reset removes them; the cap bounds the
 *  Observatory markers, the label and test time. */
export const ADDITIONS = Object.freeze({ max: 8 });

/**
 * Periodic surround (display only; decision 35): outside the main square (one world period) the view shows the wrapped
 * continuation of the world at `dim` brightness, with a faint 1 px line at every period boundary (`line` = how far the line
 * colour is mixed towards white). Off: the old background bars. The main square itself is drawn exactly as without it.
 */
export const SURROUND = Object.freeze({ default: true, dim: 0.45, line: 0.25 });

/** Floating panels: translucent "glass" or opaque "solid" (also used when blur is unsupported or reduced transparency is asked). */
export const PANEL_STYLES = Object.freeze(['glass', 'solid']);

export const PALETTES = Object.freeze(['observatory', 'viridis']);
export const TOUR_STORAGE_KEY = 'lenia.tour.v1';
