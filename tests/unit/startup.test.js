import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planStartup, patternMismatches } from '../../src/simulation/startup.js';
import { parseQueryParams } from '../../src/simulation/params.js';
import { ORBIUM_O2U } from '../../src/simulation/patterns.js';
import { randomDiscSeed } from '../../src/simulation/seed.js';
import { LIMITS } from '../../src/config.js';

const reference = JSON.parse(readFileSync(new URL('../fixtures/orbium-o2u-reference.json', import.meta.url), 'utf8'));
const sum = (a) => { let s = 0; for (const v of a) s += v; return s; };

test('default startup (no query) is Orbium with its own parameter set, unmodified, and no notes', () => {
  const plan = planStartup(parseQueryParams(''));
  assert.equal(plan.kind, 'orbium');
  assert.deepEqual(plan.notes, []);
  assert.equal(plan.params.gridSize, 256);
  assert.equal(plan.params.radius, 13);
  assert.equal(plan.params.timeSteps, 10);
  assert.equal(plan.params.mu, 0.15);
  assert.equal(plan.params.sigma, 0.015);
  assert.ok(plan.initialState instanceof Float32Array);
  assert.equal(plan.initialState.length, 256 * 256);
  assert.ok(Math.abs(sum(plan.initialState) - 19600 / 255) < 1e-3, 'mass of the verified pattern');
});

test('the initial state is the verified upstream pattern, cell for cell, centred and unscaled', () => {
  for (const grid of LIMITS.gridSizes) {
    const plan = planStartup({ gridSize: grid });
    assert.equal(plan.kind, 'orbium');
    const o = (grid - 20) / 2;
    let outside = 0;
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        const v = plan.initialState[y * grid + x];
        const inside = x >= o && x < o + 20 && y >= o && y < o + 20;
        if (inside) assert.equal(v, Math.fround(reference.levels[y - o][x - o] / 255), `grid ${grid} cell (${x},${y})`);
        else outside += v;
      }
    }
    assert.equal(outside, 0);
  }
});

test('explicit radius=13 keeps Orbium; ?seed does not alter the deterministic organism', () => {
  const a = planStartup(parseQueryParams('?radius=13'));
  const b = planStartup(parseQueryParams('?seed=1'));
  const c = planStartup(parseQueryParams('?seed=999999'));
  assert.equal(a.kind, 'orbium');
  assert.deepEqual(a.notes, []);
  assert.deepEqual(Array.from(b.initialState), Array.from(c.initialState));
});

test('grid size is honoured and snapped with a note, Orbium still shown', () => {
  const plan = planStartup(parseQueryParams('?grid=40'));
  assert.equal(plan.kind, 'orbium');
  assert.equal(plan.params.gridSize, 64);
  assert.ok(plan.notes.some((n) => n.startsWith('gridSize:')));
  assert.equal(planStartup(parseQueryParams('?grid=512')).params.radius, 13, 'workload cap does not touch R=13 at 512');
});

test('incompatible radius: Orbium is NOT shown, noise start is used with the requested radius, and the note says why', () => {
  const plan = planStartup(parseQueryParams('?radius=10&seed=7&grid=128'));
  assert.equal(plan.kind, 'noise');
  assert.equal(plan.params.radius, 10);
  assert.equal(plan.params.gridSize, 128);
  assert.deepEqual(Array.from(plan.initialState), Array.from(randomDiscSeed(128, { radiusFraction: 0.2, seed: 7 })), 'unchanged pre-milestone behaviour');
  assert.equal(plan.notes.length, 1);
  assert.match(plan.notes[0], /Orbium needs radius=13/);
  assert.match(plan.notes[0], /radius=10/);
  assert.match(plan.notes[0], /random noise/);
});

test('out-of-range radius is clamped, reported, then treated as incompatible', () => {
  const plan = planStartup(parseQueryParams('?radius=99'));
  assert.equal(plan.kind, 'noise');
  assert.equal(plan.params.radius, LIMITS.radius.max);
  assert.ok(plan.notes.some((n) => n.startsWith('radius: 99 clamped')));
  assert.ok(plan.notes.some((n) => /Orbium needs radius=13/.test(n)));
});

test('every required parameter is checked, not just radius (programmatic callers)', () => {
  for (const [key, value] of [['timeSteps', 12], ['mu', 0.2], ['sigma', 0.016]]) {
    const plan = planStartup({ [key]: value });
    assert.equal(plan.kind, 'noise', `${key}=${value}`);
    assert.match(plan.notes.at(-1), new RegExp(`${key}=${ORBIUM_O2U.params[key]}`));
  }
  assert.deepEqual(patternMismatches({ ...ORBIUM_O2U.params }, ORBIUM_O2U), []);
  assert.deepEqual(patternMismatches({ ...ORBIUM_O2U.params, sigma: 0.016 }, ORBIUM_O2U), [{ key: 'sigma', have: 0.016, need: 0.015 }]);
});

test('the source pattern is never modified: plans return independent copies', () => {
  const first = planStartup({});
  const snapshot = Array.from(first.initialState);
  first.initialState.fill(0.5); // a caller scribbling on its state must not leak anywhere
  const second = planStartup({});
  assert.deepEqual(Array.from(second.initialState), snapshot);
  assert.ok(Object.isFrozen(ORBIUM_O2U) && typeof ORBIUM_O2U.rle === 'string');
});

test('hostile or garbage query input still yields a safe, runnable plan', () => {
  for (const q of ['?grid=abc&radius=-5', '?grid=99999999999&radius=1e9', '?__proto__=1&evil=<script>', '?grid=4294967295&radius=4294967295&seed=4294967295']) {
    const plan = planStartup(parseQueryParams(q));
    assert.ok(plan.initialState.length === plan.params.gridSize ** 2, q);
    assert.ok(LIMITS.gridSizes.includes(plan.params.gridSize), q);
    assert.ok(plan.params.radius >= LIMITS.radius.min && plan.params.radius <= LIMITS.radius.max, q);
    assert.ok(plan.initialState.every((v) => v >= 0 && v <= 1), q);
  }
});
