import test from 'node:test';
import assert from 'node:assert/strict';
import { planFrameSteps, MAX_PENDING_STEPS, nextGpuBound, GPU_BOUND_START } from '../../src/simulation/scheduler.js';
import { LOOP } from '../../src/config.js';

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

// ---- the GPU-limited flag (decision 7): step deficit with fence hold-backs, hysteresis ----
const RULE = { windowMs: LOOP.gpuBoundWindowMs, onRatio: LOOP.gpuBoundOnRatio, recoveryMs: LOOP.gpuBoundRecoveryMs };

/**
 * A small model of the animation loop, for synthetic traces: one frame every `frameMs`; a frame fence that allows 3 frames in
 * flight and signals when the GPU has finished that frame's work; GPU work per submitted frame = displayMs + steps * stepMs;
 * steps planned by planFrameSteps with the back-off (1 step per frame while the flag is on) unless `backoff` is false.
 * Segments run one after the other on the same loop. Returns per-frame records { t, held, steps, requested, flag }.
 */
function simulate(segments, { backoff = true } = {}) {
  let t = 0, gpuFree = 0, acc = 0, state = GPU_BOUND_START;
  const pending = [], frames = [];
  for (const seg of segments) {
    const { seconds, frameMs, sps, displayMs, stepMs, paused = false, forceHeld = () => false } = seg;
    const end = t + seconds * 1000;
    for (let k = 0; t < end; k++, t += frameMs) {
      while (pending.length && pending[0] <= t) pending.shift();
      const held = pending.length >= 3 || forceHeld(k);
      if (!paused) acc += frameMs;
      let steps = 0;
      if (!held) {
        const plan = planFrameSteps({ paused, accumulatorMs: acc, stepMs: 1000 / sps, cap: backoff && state.gpuBound ? 1 : 4, pendingSteps: 0 });
        steps = plan.steps; acc = plan.accumulatorMs;
        gpuFree = Math.max(t, gpuFree) + displayMs + steps * stepMs;
        pending.push(gpuFree);
      }
      state = nextGpuBound(state, { now: t, playMs: paused ? 0 : frameMs, steps, stepsPerSecond: sps, held }, RULE);
      frames.push({ t, held, steps, requested: paused ? 0 : (frameMs * sps) / 1000, flag: state.gpuBound });
    }
  }
  return frames;
}
const HZ144 = 1000 / 144, HZ60 = 1000 / 60;
// GPU costs of the model (ms): a small grid; "grid 512" sized so that 1x keeps up with fence hold-backs and 2x cannot
const SMALL = { displayMs: 1, stepMs: 0.3 }, G512 = { displayMs: 5, stepMs: 9 }, HEAVY = { displayMs: 5, stepMs: 15 };
const between = (frames, fromMs, toMs) => frames.filter((f) => f.t >= fromMs && f.t < toMs);
const share = (frames, key) => frames.filter((f) => f[key]).length / frames.length;
const rate = (frames) => frames.reduce((a, f) => a + f.steps, 0) / frames.reduce((a, f) => a + f.requested, 0);

test('GPU-limited: grid 128 steady, with the short hold-backs of presentation latency, stays off', () => {
  // held-back runs of 1 to 7 frames (the measured range) every 100 frames; the loop catches up (4 steps per frame)
  const runs = [1, 2, 3, 7];
  const frames = simulate([{ seconds: 20, frameMs: HZ144, sps: 60, ...SMALL, forceHeld: (k) => k % 100 < runs[Math.floor(k / 100) % 4] }]);
  assert.ok(share(frames, 'held') > 0.02, 'the trace does hold frames back');
  assert.equal(share(frames, 'flag'), 0);
});

test('GPU-limited: grid 512 at 1x, the fence holding back a share of the frames, stays off (the simulation keeps up)', () => {
  const frames = simulate([{ seconds: 20, frameMs: HZ144, sps: 60, ...G512 }]);
  const late = between(frames, 2000, 20000);
  assert.ok(share(late, 'held') > 0.15, `held ${share(late, 'held')}`);
  assert.ok(rate(late) > 0.98, `achieved/requested ${rate(late)}`);
  assert.equal(share(frames, 'flag'), 0);
});

test('GPU-limited: grid 512 at 2x (the simulation falls behind while the fence holds frames back) turns on, with or without the back-off', () => {
  for (const backoff of [true, false]) {
    const frames = simulate([{ seconds: 10, frameMs: HZ144, sps: 120, ...G512 }], { backoff });
    const late = between(frames, 2000, 10000);
    assert.ok(rate(late) < LOOP.gpuBoundOnRatio, `backoff ${backoff}: achieved/requested ${rate(late)}`);
    assert.ok(share(late, 'flag') > 0.99, `backoff ${backoff}: flag ${share(late, 'flag')}`);
    assert.ok(frames.findIndex((f) => f.flag) * HZ144 <= LOOP.gpuBoundWindowMs * 1.5, 'turns on soon after the window has filled');
  }
});

test('GPU-limited: when the load goes away the flag clears after the recovery window and stays off', () => {
  const frames = simulate([{ seconds: 5, frameMs: HZ144, sps: 120, ...G512 }, { seconds: 5, frameMs: HZ144, sps: 120, ...SMALL }]);
  assert.equal(between(frames, 4500, 5000).every((f) => f.flag), true, 'on under load');
  const lastHeld = frames.filter((f) => f.held).at(-1).t;
  assert.ok(lastHeld < 5100, 'the queue drains within a few frames');
  assert.ok(between(frames, 5000, lastHeld + LOOP.gpuBoundRecoveryMs - 20).every((f) => f.flag), 'stays on through the recovery window');
  assert.ok(between(frames, lastHeld + LOOP.gpuBoundRecoveryMs + 20, 10000).every((f) => !f.flag), 'then off');
});

test('GPU-limited: 60 Hz display at 2x with the back-off active, then the GPU recovers: the flag clears (no latch on the deficit the back-off causes)', () => {
  const frames = simulate([{ seconds: 5, frameMs: HZ60, sps: 120, ...HEAVY }, { seconds: 6, frameMs: HZ60, sps: 120, ...SMALL }]);
  assert.equal(between(frames, 4000, 5000).every((f) => f.flag), true, 'on under load');
  // right after recovery the back-off still runs 1 step per frame: 60 of 120 steps/s, a deficit, but no hold-backs
  const lastHeld = frames.filter((f) => f.held).at(-1).t;
  const recovering = between(frames, lastHeld + 50, lastHeld + LOOP.gpuBoundRecoveryMs - 50);
  assert.ok(recovering.every((f) => f.steps <= 1 && !f.held) && rate(recovering) < 0.6, 'the back-off itself causes a deficit');
  assert.ok(between(frames, lastHeld + LOOP.gpuBoundRecoveryMs + 20, 11000).every((f) => !f.flag), 'off, and stays off');
  assert.ok(rate(between(frames, 9000, 11000)) > 0.98, 'full rate again once the flag is off');
});

test('GPU-limited: a low frame rate with no fence hold-backs (display- or tab-limited) never turns it on', () => {
  for (const frameMs of [50, 200]) { // 20 Hz and 5 Hz: at most 4 steps per frame, so 2x (120 steps/s) cannot be reached
    const frames = simulate([{ seconds: 20, frameMs, sps: 120, ...SMALL }]);
    assert.ok(rate(between(frames, 2000, 20000)) < 0.7, 'a real step deficit');
    assert.equal(share(frames, 'held'), 0);
    assert.equal(share(frames, 'flag'), 0, `frame ${frameMs} ms`);
  }
});

test('GPU-limited: paused, hold-backs never turn it on; a gap longer than the window starts the window again', () => {
  const paused = simulate([{ seconds: 10, frameMs: HZ144, sps: 60, displayMs: 12, stepMs: 15, paused: true }]);
  assert.ok(share(paused, 'held') > 0.2);
  assert.equal(share(paused, 'flag'), 0);
  let s = GPU_BOUND_START;
  s = nextGpuBound(s, { now: 0, playMs: 7, steps: 1, stepsPerSecond: 60, held: false }, RULE);
  s = nextGpuBound(s, { now: 5000, playMs: 250, steps: 0, stepsPerSecond: 60, held: true }, RULE); // hidden tab, then a hold
  assert.equal(s.gpuBound, false);
  assert.equal(s.warmMs, 0);
});

test('GPU-limited: a non-finite time leaves the state unchanged', () => {
  assert.equal(nextGpuBound(GPU_BOUND_START, { now: NaN, playMs: 7, steps: 0, stepsPerSecond: 60, held: true }, RULE), GPU_BOUND_START);
});
