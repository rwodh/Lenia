import test from 'node:test';
import assert from 'node:assert/strict';
import { randomDiscSeed, mulberry32 } from '../../src/simulation/seed.js';

test('mulberry32 is deterministic and within [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('randomDiscSeed: size, range, disc confinement, determinism', () => {
  const n = 64;
  const s = randomDiscSeed(n, { radiusFraction: 0.25, seed: 5 });
  assert.equal(s.length, n * n);
  assert.deepEqual(s, randomDiscSeed(n, { radiusFraction: 0.25, seed: 5 }));
  const c = (n - 1) / 2;
  let inside = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = s[y * n + x];
      assert.ok(v >= 0 && v < 1);
      if (Math.hypot(x - c, y - c) > 0.25 * n) assert.equal(v, 0);
      else if (v > 0) inside++;
    }
  }
  assert.ok(inside > 0.9 * Math.PI * (0.25 * n) ** 2 * 0.9, 'disc is populated');
});
