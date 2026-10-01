import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKernel, growth } from '../../src/simulation/kernel.js';
import { convolveReference, stepReference } from '../../src/simulation/reference.js';
import { randomDiscSeed } from '../../src/simulation/seed.js';

const P = { mu: 0.15, sigma: 0.015, timeSteps: 10 };

test('convolution wraps periodically (delta at origin reaches the opposite edge)', () => {
  const n = 16, R = 3;
  const kernel = buildKernel(R);
  const state = new Float32Array(n * n);
  state[0] = 1; // cell (0,0)
  const u = convolveReference(state, n, kernel);
  // U[p] = sum_d K[d] A[p+d]; A is nonzero only at p+d = 0, so U[(n-1, 0)] = K[d=(+1, 0)].
  const w = (dx, dy) => kernel.data[(dy + R) * kernel.size + (dx + R)];
  assert.ok(Math.abs(u[0 * n + (n - 1)] - w(1, 0)) < 1e-7);
  assert.ok(Math.abs(u[(n - 1) * n + 0] - w(0, 1)) < 1e-7);
  assert.ok(Math.abs(u[(n - 1) * n + (n - 1)] - w(1, 1)) < 1e-7);
  assert.ok(u[8 * n + 8] === 0, 'far cells see nothing');
  let total = 0;
  for (const v of u) total += v;
  assert.ok(Math.abs(total - 1) < 1e-5, 'convolution with a normalised kernel preserves total mass');
});

test('uniform field: U equals the field value', () => {
  const n = 12, kernel = buildKernel(4);
  const a = 0.37;
  const u = convolveReference(new Float32Array(n * n).fill(a), n, kernel);
  for (const v of u) assert.ok(Math.abs(v - a) < 1e-5);
});

test('empty world stays empty; values stay in [0,1]', () => {
  const n = 32, kernel = buildKernel(5);
  assert.ok(stepReference(new Float32Array(n * n), n, kernel, P).every((v) => v === 0));
  let s = randomDiscSeed(n, { radiusFraction: 0.4, seed: 9 });
  for (let t = 0; t < 5; t++) {
    s = stepReference(s, n, kernel, P);
    assert.ok(s.every((v) => v >= 0 && v <= 1 && Number.isFinite(v)));
  }
});

test('step matches the closed-form update on a uniform field', () => {
  const n = 12, kernel = buildKernel(4), a = 0.15;
  const out = stepReference(new Float32Array(n * n).fill(a), n, kernel, P);
  const expected = Math.min(1, Math.max(0, a + (1 / P.timeSteps) * growth(a, P.mu, P.sigma)));
  for (const v of out) assert.ok(Math.abs(v - expected) < 1e-5);
});
