import { OBSERVATORY } from '../config.js';

/** Minimum milliseconds between Observatory samples for a grid of `gridSize` cells per side. */
export const sampleIntervalFor = (gridSize) =>
  (gridSize >= OBSERVATORY.largeGridFrom ? OBSERVATORY.sampleIntervalLargeMs : OBSERVATORY.sampleIntervalMs);

/**
 * Whether the app should queue a new readback now. Pure (unit-tested). A sample is taken only when it can tell
 * something new and costs the GPU nothing it cannot spare:
 *  - readback is available (not failed, no request already in flight),
 *  - the GPU is not behind (gpuBound: the loop is already throttling itself),
 *  - the state has changed since the last sample (paused: only a Step produces a new sample),
 *  - at least the sampling interval has passed.
 */
export function shouldSample({ available, busy, gpuBound, generation, lastGeneration, nowMs, lastSampleMs, intervalMs }) {
  if (!available || busy || gpuBound) return false;
  if (generation === lastGeneration) return false;
  return nowMs - lastSampleMs >= intervalMs;
}

/** Fixed-capacity history of { generation, mass } samples, oldest first; older samples are dropped. */
export class SampleHistory {
  constructor(capacity = OBSERVATORY.historyLength) {
    if (!Number.isInteger(capacity) || capacity < 2) throw new RangeError('history capacity must be an integer >= 2');
    this.capacity = capacity;
    this.generations = new Float64Array(capacity);
    this.masses = new Float64Array(capacity);
    this.start = 0;
    this.length = 0;
    this.version = 0; // changes on every push/clear, so a view can redraw only when needed
  }

  push(generation, mass) {
    const i = (this.start + this.length) % this.capacity;
    this.generations[i] = generation;
    this.masses[i] = mass;
    if (this.length < this.capacity) this.length++;
    else this.start = (this.start + 1) % this.capacity;
    this.version++;
  }

  clear() {
    this.start = 0;
    this.length = 0;
    this.version++;
  }

  /** k-th sample, oldest first. */
  at(k) {
    const i = (this.start + k) % this.capacity;
    return { generation: this.generations[i], mass: this.masses[i] };
  }

  /** min/max mass and generation range of the samples held; null when empty. */
  summary() {
    if (!this.length) return null;
    let min = Infinity, max = -Infinity;
    for (let k = 0; k < this.length; k++) { const m = this.at(k).mass; if (m < min) min = m; if (m > max) max = m; }
    return { count: this.length, min, max, latest: this.at(this.length - 1).mass, from: this.at(0).generation, to: this.at(this.length - 1).generation };
  }
}
