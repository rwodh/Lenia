import test from 'node:test';
import assert from 'node:assert/strict';
import { kernelCore, buildKernel, growth } from '../../src/simulation/kernel.js';

test('kernelCore peaks at 1 for r=0.5 and is zero outside (0,1)', () => {
  assert.ok(Math.abs(kernelCore(0.5) - 1) < 1e-12);
  for (const r of [0, 1, -0.2, 1.5, NaN]) assert.equal(kernelCore(r), 0);
  assert.ok(kernelCore(0.25) < 1 && kernelCore(0.75) < 1);
  assert.ok(Math.abs(kernelCore(0.25) - kernelCore(0.75)) < 1e-12);
});

test('buildKernel is normalised, symmetric, and confined to radius R', () => {
  const R = 13;
  const { data, size } = buildKernel(R);
  assert.equal(size, 2 * R + 1);
  assert.equal(data.length, size * size);
  let sum = 0;
  for (const w of data) sum += w;
  assert.ok(Math.abs(sum - 1) < 1e-5, `sum=${sum}`);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const w = data[j * size + i];
      assert.ok(w >= 0);
      assert.equal(w, data[i * size + j], 'transpose symmetry');
      assert.equal(w, data[(size - 1 - j) * size + (size - 1 - i)], 'point symmetry');
      if (Math.hypot(i - R, j - R) >= R) assert.equal(w, 0);
    }
  }
  assert.equal(data[R * size + R], 0, 'centre cell has zero weight (r=0 is outside the core)');
  assert.ok(data[R * size + R + Math.round(R / 2)] > data[R * size + R], 'ring peaks away from centre');
});

test('buildKernel rejects invalid radii', () => {
  for (const r of [0, -1, 2.5, NaN, '3']) assert.throws(() => buildKernel(r), RangeError);
});

test('growth is 1 at mu, symmetric about mu, and tends to -1 far away', () => {
  assert.ok(Math.abs(growth(0.15, 0.15, 0.015) - 1) < 1e-12);
  assert.ok(Math.abs(growth(0.16, 0.15, 0.015) - growth(0.14, 0.15, 0.015)) < 1e-12);
  assert.ok(Math.abs(growth(0, 0.15, 0.015) + 1) < 1e-9);
  assert.ok(growth(0.3, 0.15, 0.015) < -0.999);
});
