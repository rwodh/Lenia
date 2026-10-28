import test from 'node:test';
import assert from 'node:assert/strict';
import { planFrameSteps, MAX_PENDING_STEPS } from '../../src/simulation/scheduler.js';

const base = { paused: false, accumulatorMs: 0, stepMs: 1000 / 60, cap: 4, pendingSteps: 0 };

test('playing: runs whole steps for the accumulated time and keeps the remainder', () => {
  const r = planFrameSteps({ ...base, accumulatorMs: 40 });
  assert.equal(r.steps, 2);
  assert.ok(Math.abs(r.accumulatorMs - (40 - 2 * (1000 / 60))) < 1e-9);
});

test('playing: caps steps per frame and drops the backlog', () => {
  const r = planFrameSteps({ ...base, accumulatorMs: 500 });
  assert.equal(r.steps, 4);
  assert.equal(r.accumulatorMs, 0);
});

test('paused: never advances on its own, however much time accumulated', () => {
  const r = planFrameSteps({ ...base, paused: true, accumulatorMs: 10_000 });
  assert.deepEqual(r, { steps: 0, accumulatorMs: 0, pendingSteps: 0 });
});

test('paused: one queued single-step request runs exactly one step, then nothing', () => {
  const first = planFrameSteps({ ...base, paused: true, pendingSteps: 1 });
  assert.equal(first.steps, 1);
  assert.equal(first.pendingSteps, 0);
  assert.equal(planFrameSteps({ ...base, paused: true, pendingSteps: first.pendingSteps }).steps, 0);
});

test('resuming after a pause does not burst (accumulator was discarded)', () => {
  const paused = planFrameSteps({ ...base, paused: true, accumulatorMs: 5000 });
  assert.equal(planFrameSteps({ ...base, accumulatorMs: paused.accumulatorMs + 16 }).steps, 0);
});

test('pending requests are bounded', () => {
  assert.ok(MAX_PENDING_STEPS >= 1 && MAX_PENDING_STEPS <= 8);
});
