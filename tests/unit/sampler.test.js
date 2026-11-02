import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSample, sampleIntervalFor, SampleHistory } from '../../src/simulation/sampler.js';
import { OBSERVATORY, LIMITS } from '../../src/config.js';

const base = { available: true, busy: false, gpuBound: false, generation: 10, lastGeneration: 5, nowMs: 1000, lastSampleMs: 0, intervalMs: 250 };

test('a sample is taken when readback is free, the GPU is not behind, the state changed and the interval passed', () => {
  assert.equal(shouldSample(base), true);
});

test('no sample: readback unavailable, already in flight, or GPU-bound (back-off)', () => {
  assert.equal(shouldSample({ ...base, available: false }), false);
  assert.equal(shouldSample({ ...base, busy: true }), false);
  assert.equal(shouldSample({ ...base, gpuBound: true }), false);
});

test('no sample when nothing changed (paused); a single Step makes one due', () => {
  assert.equal(shouldSample({ ...base, generation: 5, lastGeneration: 5 }), false);
  assert.equal(shouldSample({ ...base, generation: 6, lastGeneration: 5 }), true);
});

test('rate limit: not before the interval has passed', () => {
  assert.equal(shouldSample({ ...base, nowMs: 249, lastSampleMs: 0 }), false);
  assert.equal(shouldSample({ ...base, nowMs: 250, lastSampleMs: 0 }), true);
});

test('interval by grid size: larger grids sample less often; bytes per second stay bounded', () => {
  assert.equal(sampleIntervalFor(64), OBSERVATORY.sampleIntervalMs);
  assert.equal(sampleIntervalFor(256), OBSERVATORY.sampleIntervalMs);
  assert.equal(sampleIntervalFor(512), OBSERVATORY.sampleIntervalLargeMs);
  // worst case: RGBA/FLOAT readback (16 bytes per cell) at the largest grid
  for (const n of LIMITS.gridSizes) {
    const bytesPerSecond = (n * n * 16 * 1000) / sampleIntervalFor(n);
    assert.ok(bytesPerSecond <= 8 * 1024 * 1024, `grid ${n}: ${bytesPerSecond} B/s`);
  }
});

test('history: bounded ring buffer, oldest first, version changes, clear empties', () => {
  const h = new SampleHistory(3);
  const v0 = h.version;
  for (let g = 1; g <= 5; g++) h.push(g, g * 10);
  assert.equal(h.length, 3);
  assert.deepEqual([0, 1, 2].map((k) => h.at(k).generation), [3, 4, 5]);
  assert.deepEqual(h.summary(), { count: 3, min: 30, max: 50, latest: 50, from: 3, to: 5 });
  assert.ok(h.version > v0);
  const v1 = h.version;
  h.clear();
  assert.equal(h.length, 0);
  assert.equal(h.summary(), null);
  assert.ok(h.version > v1);
  assert.equal(new SampleHistory().capacity, OBSERVATORY.historyLength);
  assert.throws(() => new SampleHistory(1), RangeError);
});
