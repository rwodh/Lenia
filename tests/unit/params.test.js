import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParams, parseQueryParams } from '../../src/simulation/params.js';
import { DEFAULT_PARAMS, LIMITS } from '../../src/config.js';

test('defaults pass through unchanged with no adjustments', () => {
  const { params, adjustments } = normalizeParams();
  assert.deepEqual(params, DEFAULT_PARAMS);
  assert.deepEqual(adjustments, []);
});

test('out-of-range numbers are clamped and reported', () => {
  const { params, adjustments } = normalizeParams({ radius: 999, mu: -3, sigma: 50, timeSteps: 0 });
  assert.equal(params.radius <= LIMITS.radius.max, true);
  assert.equal(params.mu, LIMITS.mu.min);
  assert.equal(params.sigma, LIMITS.sigma.max);
  assert.equal(params.timeSteps, LIMITS.timeSteps.min);
  assert.ok(adjustments.length >= 4);
});

test('non-finite and non-number values fall back to defaults', () => {
  for (const bad of [NaN, Infinity, -Infinity, '12', null, undefined, {}, []]) {
    const { params } = normalizeParams({ radius: bad, gridSize: bad, mu: bad });
    assert.equal(params.radius, DEFAULT_PARAMS.radius);
    assert.equal(params.gridSize, DEFAULT_PARAMS.gridSize);
    assert.equal(params.mu, DEFAULT_PARAMS.mu);
  }
});

test('non-object input is tolerated', () => {
  for (const bad of [null, undefined, 5, 'x', true]) {
    assert.deepEqual(normalizeParams(bad).params, DEFAULT_PARAMS);
  }
});

test('gridSize snaps to the nearest supported size', () => {
  assert.equal(normalizeParams({ gridSize: 100 }).params.gridSize, 128);
  assert.equal(normalizeParams({ gridSize: 1e9 }).params.gridSize, 512);
  assert.equal(normalizeParams({ gridSize: -5 }).params.gridSize, 64);
  assert.equal(normalizeParams({ gridSize: 256 }).adjustments.length, 0);
});

test('workload cap lowers the radius; result is always within budget and kernel fits the grid', () => {
  for (const gridSize of LIMITS.gridSizes) {
    for (const radius of [3, 13, 24]) {
      const { params } = normalizeParams({ gridSize, radius });
      assert.ok(params.gridSize ** 2 * (2 * params.radius + 1) ** 2 <= LIMITS.maxTapsPerStep);
      assert.ok(2 * params.radius + 1 <= params.gridSize);
    }
  }
  const { params, adjustments } = normalizeParams({ gridSize: 512, radius: 24 });
  assert.ok(params.radius < 24);
  assert.ok(adjustments.some((a) => a.startsWith('radius:')));
});

test('parseQueryParams accepts digits only, ignores unknown keys', () => {
  assert.deepEqual(parseQueryParams('?grid=128&radius=10&seed=7'), { gridSize: 128, radius: 10, seed: 7 });
  assert.deepEqual(parseQueryParams('?grid=abc&radius=-4&seed=1e9&seed2=3'), {});
  assert.deepEqual(parseQueryParams('?grid=99999999999&radius=1.5'), {});
  assert.deepEqual(parseQueryParams('?__proto__=1&constructor=2&evil=<script>'), {});
  assert.deepEqual(parseQueryParams(''), {});
  assert.equal(Object.getPrototypeOf(parseQueryParams('?grid=64')), Object.prototype);
});

test('hostile query values still produce safe params after normalisation', () => {
  const { params } = normalizeParams(parseQueryParams('?grid=4294967295&radius=4294967295&seed=4294967295'));
  assert.equal(params.gridSize, 512);
  assert.ok(params.radius <= LIMITS.radius.max);
  assert.equal(params.seed, 4294967295);
});
