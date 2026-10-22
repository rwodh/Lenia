import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ORBIUM_O2U } from '../../src/simulation/patterns.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { placePatternCentred } from '../../src/simulation/seed.js';
import { normalizeParams } from '../../src/simulation/params.js';
import { buildKernel } from '../../src/simulation/kernel.js';
import { stepReference } from '../../src/simulation/reference.js';

const reference = JSON.parse(readFileSync(new URL('../fixtures/orbium-o2u-reference.json', import.meta.url), 'utf8'));

test('provenance: the RLE is byte-identical to upstream (sha256 taken from Chakazul/Lenia at the pinned commit)', () => {
  assert.equal(createHash('sha256').update(ORBIUM_O2U.rle, 'utf8').digest('hex'),
    '62abb2c511c8d0491dba11e36ab18da89f3c473fa0dbeba5b32e50f6cda67df0');
  assert.equal(ORBIUM_O2U.rle.length, 496);
  assert.equal(ORBIUM_O2U.id, 'O2u');
  assert.equal(ORBIUM_O2U.source.commit, 'adfc542939266de7f4bb7ebb552e8499701ee107');
  assert.equal(ORBIUM_O2U.source.file, 'Python/animals.json');
  assert.equal(ORBIUM_O2U.source.license, 'MIT');
  assert.deepEqual(reference.upstream, {
    repo: ORBIUM_O2U.source.repository, commit: ORBIUM_O2U.source.commit, file: ORBIUM_O2U.source.file, code: ORBIUM_O2U.id,
  });
  assert.ok(Object.isFrozen(ORBIUM_O2U) && Object.isFrozen(ORBIUM_O2U.params) && Object.isFrozen(ORBIUM_O2U.source));
});

test('parameters equal the upstream record (R=13, T=10, mu=0.15, sigma=0.015) and are valid for this app unchanged', () => {
  assert.deepEqual({ ...ORBIUM_O2U.params }, { radius: 13, timeSteps: 10, mu: 0.15, sigma: 0.015 });
  const { params, adjustments } = normalizeParams({ gridSize: 64, ...ORBIUM_O2U.params });
  assert.deepEqual(adjustments, []);
  assert.equal(params.radius, 13);
  assert.equal(params.sigma, 0.015);
});

test('decoded dimensions, values and mass match the reference produced by the literal upstream decoder', () => {
  const d = decodeRle(ORBIUM_O2U.rle);
  assert.equal(d.width, 20);
  assert.equal(d.height, 20);
  assert.equal(reference.width, 20);
  assert.equal(reference.height, 20);
  let nonzero = 0, levelSum = 0, mass = 0;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const level = reference.levels[y][x];
      assert.equal(d.data[y * 20 + x], Math.fround(level / 255), `cell (${x},${y})`);
      if (level > 0) nonzero++;
      levelSum += level;
      mass += d.data[y * 20 + x];
    }
  }
  assert.equal(nonzero, 222);
  assert.equal(nonzero, reference.nonzero);
  assert.equal(levelSum, 19600);
  assert.equal(levelSum, reference.levelSum);
  assert.ok(Math.abs(mass - 19600 / 255) < 1e-4, `mass=${mass}`); // 76.862745...
  assert.ok(d.data.every((v) => v >= 0 && v <= 1));
  assert.equal(Math.max(...d.data), 1);
});

test('centred placement is an exact, unscaled copy at the expected offset and zero elsewhere', () => {
  const d = decodeRle(ORBIUM_O2U.rle);
  for (const size of [64, 128, 256, 512]) {
    const grid = placePatternCentred(size, d);
    assert.equal(grid.length, size * size);
    const o = (size - 20) / 2; // 20 is even and every supported size is even -> exactly centred
    let outside = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inside = x >= o && x < o + 20 && y >= o && y < o + 20;
        if (inside) assert.equal(grid[y * size + x], d.data[(y - o) * 20 + (x - o)]);
        else outside += grid[y * size + x];
      }
    }
    assert.equal(outside, 0, `size ${size}: nothing outside the pattern footprint`);
  }
  assert.deepEqual(Array.from(d.data), Array.from(decodeRle(ORBIUM_O2U.rle).data), 'source pattern not modified by placement');
});

test('placement: odd leftover uses floor, and invalid or oversized requests are rejected', () => {
  const d = { width: 3, height: 2, data: new Float32Array([1, 1, 1, 1, 1, 1]) };
  const g = placePatternCentred(6, d); // ox = floor(3/2) = 1, oy = 2
  assert.equal(g[2 * 6 + 1], 1);
  assert.equal(g[1 * 6 + 1], 0);
  assert.equal(g[3 * 6 + 3], 1);
  assert.equal(g[3 * 6 + 4], 0);
  assert.throws(() => placePatternCentred(16, decodeRle(ORBIUM_O2U.rle)), RangeError);
  for (const bad of [0, -4, 2.5, NaN, '64']) assert.throws(() => placePatternCentred(bad, d), RangeError);
});

// Behavioural regression on the CPU reference (the same math the GPU shader is verified against).
function circularCentroid(state, n) {
  let m = 0, cs = 0, sn = 0, cs2 = 0, sn2 = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = state[y * n + x];
      m += v;
      cs += v * Math.cos((2 * Math.PI * x) / n); sn += v * Math.sin((2 * Math.PI * x) / n);
      cs2 += v * Math.cos((2 * Math.PI * y) / n); sn2 += v * Math.sin((2 * Math.PI * y) / n);
    }
  }
  return { mass: m, x: ((Math.atan2(sn, cs) / (2 * Math.PI)) * n + n) % n, y: ((Math.atan2(sn2, cs2) / (2 * Math.PI)) * n + n) % n };
}
const torusDist = (a, b, n) => {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return Math.hypot(Math.min(dx, n - dx), Math.min(dy, n - dy));
};

test('O2u at the verified sigma 0.015 persists and translates; sigma 0.014 (a value quoted elsewhere) evaporates', () => {
  // The organism moves ~0.6 cells/step, so on a 64-cell torus only short windows give an unambiguous displacement:
  // motion is measured at 30 steps (~18 cells, well under n/2 = 32); persistence is measured at 100 steps.
  const n = 64;
  const kernel = buildKernel(ORBIUM_O2U.params.radius);
  const seed = placePatternCentred(n, decodeRle(ORBIUM_O2U.rle));
  const start = circularCentroid(seed, n);
  const run = (sigma) => {
    let s = seed, at30 = null;
    for (let t = 1; t <= 100; t++) {
      s = stepReference(s, n, kernel, { ...ORBIUM_O2U.params, sigma });
      if (t === 30) at30 = circularCentroid(s, n);
    }
    return { at30, end: circularCentroid(s, n) };
  };
  const ok = run(0.015);
  assert.ok(ok.end.mass > 60 && ok.end.mass < 85, `sigma 0.015 mass at 100 steps = ${ok.end.mass}`);
  const moved = torusDist(start, ok.at30, n);
  assert.ok(moved > 10 && moved < 30, `sigma 0.015 should move ~18 cells in 30 steps, moved ${moved}`);
  const dead = run(0.014);
  assert.ok(dead.end.mass < 1e-3, `sigma 0.014 mass = ${dead.end.mass}`);
});
