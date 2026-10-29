import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, DEFAULT_PARAMS, UI_RANGES, SPEEDS, DEFAULT_SPEED_ID, EXPERIMENT, LOOP } from '../../src/config.js';
import { ORBIUM_O2U } from '../../src/simulation/patterns.js';
import { normalizeParams } from '../../src/simulation/params.js';
import { observeProgress, atTarget, watchProgress } from '../../src/ui/experiment.js';
import { hasCompletedTour, markTourCompleted, safeLocalStorage } from '../../src/ui/storage.js';

test('slider ranges lie inside the validated LIMITS and contain the Orbium values', () => {
  for (const [key, r] of Object.entries(UI_RANGES)) {
    assert.ok(r.min >= LIMITS[key].min && r.max <= LIMITS[key].max, key);
    assert.ok(r.min < r.max && r.step > 0, key);
    assert.ok(ORBIUM_O2U.params[key] >= r.min && ORBIUM_O2U.params[key] <= r.max, `${key} start value reachable`);
    const stepsFromMin = (ORBIUM_O2U.params[key] - r.min) / r.step;
    assert.ok(Math.abs(stepsFromMin - Math.round(stepsFromMin)) < 1e-9, `${key} start value is on a slider step`);
  }
});

test('every slider value normalises without adjustment', () => {
  for (const [key, r] of Object.entries(UI_RANGES)) {
    for (let v = r.min; v <= r.max + 1e-9; v += r.step) {
      assert.deepEqual(normalizeParams({ ...DEFAULT_PARAMS, [key]: Number(v.toFixed(6)) }).adjustments, [], `${key}=${v}`);
    }
  }
});

test('the experiment target is reachable and differs from the start', () => {
  const r = UI_RANGES[EXPERIMENT.param];
  const steps = (EXPERIMENT.targetValue - r.min) / r.step;
  assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9);
  assert.notEqual(EXPERIMENT.targetValue, ORBIUM_O2U.params[EXPERIMENT.param]);
});

test('speeds: unique ids, default exists, and the fastest fits the per-frame step cap at 60 Hz', () => {
  assert.equal(new Set(SPEEDS.map((s) => s.id)).size, SPEEDS.length);
  assert.ok(SPEEDS.some((s) => s.id === DEFAULT_SPEED_ID && s.stepsPerSecond === 60));
  const fastest = Math.max(...SPEEDS.map((s) => s.stepsPerSecond));
  assert.ok(Math.ceil(fastest / 60) <= LOOP.maxStepsPerFrame);
});

test('experiment progress functions', () => {
  assert.equal(observeProgress({ generation: 10 }, 0).complete, false);
  assert.equal(observeProgress({ generation: EXPERIMENT.observeSteps + 5 }, 0).complete, true);
  assert.equal(observeProgress({ generation: 5 }, 20).value, 0);
  assert.equal(atTarget({ params: { sigma: EXPERIMENT.targetValue } }), true);
  assert.equal(atTarget({ params: { sigma: ORBIUM_O2U.params.sigma } }), false);
  assert.equal(atTarget({ params: { sigma: EXPERIMENT.targetValue - 0.001 } }), false, 'only the target itself counts');
  assert.equal(watchProgress({ generation: EXPERIMENT.watchSteps }, 0).complete, true);
});

test('tour storage helpers tolerate blocked or throwing storage', () => {
  const store = new Map();
  const ok = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(hasCompletedTour(ok, 'k'), false);
  assert.equal(markTourCompleted(ok, 'k'), true);
  assert.equal(hasCompletedTour(ok, 'k'), true);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(hasCompletedTour(broken, 'k'), false);
  assert.equal(markTourCompleted(broken, 'k'), false);
  assert.equal(hasCompletedTour(null, 'k'), false);
  assert.equal(markTourCompleted(null, 'k'), false);
  assert.equal(safeLocalStorage({ get localStorage() { throw new Error('blocked'); } }), null);
});
