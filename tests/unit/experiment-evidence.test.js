import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKernel } from '../../src/simulation/kernel.js';
import { stepReference } from '../../src/simulation/reference.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { placePatternCentred } from '../../src/simulation/seed.js';
import { ORBIUM_O2U } from '../../src/simulation/patterns.js';
import { EXPERIMENT } from '../../src/config.js';

// The guided experiment claims something about the organism. This test is the evidence for that claim, using the same
// scenario as the tour: let Orbium settle at its own sigma for EXPERIMENT.observeSteps, then lower sigma.
const n = 64;
const kernel = buildKernel(ORBIUM_O2U.params.radius);
const mass = (a) => { let s = 0; for (const v of a) s += v; return s; };
function settled() {
  let s = placePatternCentred(n, decodeRle(ORBIUM_O2U.rle));
  for (let t = 0; t < EXPERIMENT.observeSteps; t++) s = stepReference(s, n, kernel, ORBIUM_O2U.params);
  return s;
}
function runAt(state, sigma, steps) {
  let s = state;
  for (let t = 0; t < steps; t++) s = stepReference(s, n, kernel, { ...ORBIUM_O2U.params, sigma });
  return s;
}

test('tour scenario: a settled Orbium fades away when sigma is lowered to the experiment target', () => {
  const s = settled();
  const m0 = mass(s);
  assert.ok(m0 > 60, `settled organism is alive (mass ${m0})`);
  const end = mass(runAt(s, EXPERIMENT.targetValue, EXPERIMENT.watchSteps));
  assert.ok(end / m0 < 1e-3, `mass ratio after ${EXPERIMENT.watchSteps} steps = ${end / m0}`);
});

test('tour scenario: a smaller nudge (sigma 0.014) does NOT kill a settled organism, so the target must not be 0.014', () => {
  const s = settled();
  const ratio = mass(runAt(s, 0.014, 100)) / mass(s);
  assert.ok(ratio > 0.8, `ratio ${ratio}`);
});

test('control: unchanged sigma keeps the organism alive over the same watch window', () => {
  const s = settled();
  const ratio = mass(runAt(s, ORBIUM_O2U.params.sigma, EXPERIMENT.watchSteps)) / mass(s);
  assert.ok(ratio > 0.8 && ratio < 1.1, `ratio ${ratio}`);
});
