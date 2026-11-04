import test from 'node:test';
import assert from 'node:assert/strict';
import { placePatternAt, placePatternCentred, stampMax } from '../../src/simulation/seed.js';
import { PATTERN_LIBRARY, ORBIUM_O2U } from '../../src/simulation/patterns.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { buildKernel } from '../../src/simulation/kernel.js';
import { stepReference } from '../../src/simulation/reference.js';
import { SampleHistory } from '../../src/simulation/sampler.js';
import { ADDITIONS } from '../../src/config.js';
import { mulberry32 } from '../../src/simulation/seed.js';

const o2u = decodeRle(ORBIUM_O2U.rle);
const sum = (a) => a.reduce((s, v) => s + v, 0);
const randomField = (n, seed) => { const r = mulberry32(seed); return Float32Array.from({ length: n * n }, () => r()); };

test('stampMax on an empty world is exactly the placed pattern (every library pattern, edges and corner)', () => {
  for (const p of PATTERN_LIBRARY) {
    const pat = decodeRle(p.rle);
    for (const [x, y] of [[32, 32], [0, 0], [63, 0], [5, 62]]) {
      assert.deepEqual(stampMax(new Float32Array(64 * 64), 64, pat, x, y), placePatternAt(64, pat, x, y), `${p.id} at (${x},${y})`);
    }
  }
});

test('stampMax keeps the larger value inside the pattern box, leaves every other cell unchanged, and does not modify its input', () => {
  const n = 64, base = randomField(n, 9), copy = new Float32Array(base);
  const out = stampMax(base, n, o2u, 1, 62); // the box wraps across both edges
  const placed = placePatternAt(n, o2u, 1, 62);
  const inBox = (gx, gy) => (((gx - (1 - 10)) % n + n) % n) < 20 && (((gy - (62 - 10)) % n + n) % n) < 20;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const i = gy * n + gx;
      assert.equal(out[i], inBox(gx, gy) ? Math.max(base[i], placed[i]) : base[i], `cell (${gx},${gy})`);
    }
  }
  assert.deepEqual(base, copy, 'input untouched');
});

test('stampMax is idempotent, keeps values in [0, 1] and rejects bad input', () => {
  const n = 64, base = randomField(n, 4);
  const once = stampMax(base, n, o2u, 40, 9);
  assert.deepEqual(stampMax(once, n, o2u, 40, 9), once);
  assert.ok(once.every((v) => v >= 0 && v <= 1));
  assert.throws(() => stampMax(base, n, o2u, 64, 0), RangeError);
  assert.throws(() => stampMax(base, n, o2u, 1.5, 0), RangeError);
  assert.throws(() => stampMax(new Float32Array(10), n, o2u, 1, 1), RangeError);
  assert.throws(() => stampMax(Array.from(base), n, o2u, 1, 1), RangeError);
});

test('history samples carry the number of additions, so states that share a generation are told apart', () => {
  const h = new SampleHistory(4);
  h.push(10, 76.8);
  h.push(10, 153.6, 1); // the same generation after an addition
  assert.deepEqual(h.at(0), { generation: 10, mass: 76.8, adds: 0 });
  assert.deepEqual(h.at(1), { generation: 10, mass: 153.6, adds: 1 });
  h.clear();
  assert.equal(h.length, 0);
});

test('the number of additions is capped by a config constant', () => {
  assert.ok(Number.isInteger(ADDITIONS.max) && ADDITIONS.max >= 1 && ADDITIONS.max <= 16);
});

test('CPU reference: two O2u copies far apart evolve as two independent copies (grid 128, 30 steps)', () => {
  // The copies sit half a world apart on both axes, far beyond twice the kernel radius, so as long as they stay apart every cell
  // sees at most one of them: the two-copy world equals the superposition of two shifted one-copy worlds.
  const n = 128, params = { ...ORBIUM_O2U.params, gridSize: n }, kernel = buildKernel(params.radius);
  let one = placePatternCentred(n, o2u);
  let two = stampMax(placePatternCentred(n, o2u), n, o2u, 0, 0);
  for (let t = 0; t < 30; t++) { one = stepReference(one, n, kernel, params); two = stepReference(two, n, kernel, params); }
  const half = n / 2, shifted = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) shifted[((y + half) % n) * n + ((x + half) % n)] = one[y * n + x];
  let worst = 0;
  for (let i = 0; i < two.length; i++) worst = Math.max(worst, Math.abs(two[i] - Math.max(one[i], shifted[i])));
  assert.ok(worst === 0, `difference from two independent copies ${worst}`);
  assert.ok(Math.abs(sum(two) - 2 * sum(one)) < 1e-9 && sum(one) > 60, 'both persist; mass is twice one copy');
});
