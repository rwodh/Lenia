import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ORBIUM_O2U, ORBIUM_O2B, PATTERN_LIBRARY, getPattern } from '../../src/simulation/patterns.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { placePatternCentred } from '../../src/simulation/seed.js';
import { normalizeParams } from '../../src/simulation/params.js';
import { buildKernel } from '../../src/simulation/kernel.js';
import { stepReference } from '../../src/simulation/reference.js';
import { LIMITS, UI_RANGES } from '../../src/config.js';
import { computeObservables, torusDistance } from '../../src/simulation/observables.js';

const reference = JSON.parse(readFileSync(new URL('../fixtures/orbium-o2u-reference.json', import.meta.url), 'utf8'));
const referenceO2b = JSON.parse(readFileSync(new URL('../fixtures/orbium-o2b-reference.json', import.meta.url), 'utf8'));

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
// Mass and the circular centroid come from the shared observables module (its consistency with the earlier per-cell
// formula is checked in tests/unit/observables.test.js).
const circularCentroid = (state, n) => { const o = computeObservables(state, n); return { mass: o.mass, x: o.centroid.x, y: o.centroid.y }; };
const torusDist = torusDistance;

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

// ---- the pattern library (O2u + O2b) ----

test('library: exactly O2u and O2b, frozen, unique ids, static lookup only', () => {
  assert.deepEqual(PATTERN_LIBRARY.map((p) => p.id), ['O2u', 'O2b']);
  assert.ok(Object.isFrozen(PATTERN_LIBRARY));
  assert.equal(PATTERN_LIBRARY[0], ORBIUM_O2U, 'the existing O2u export is the library entry, unchanged');
  assert.equal(getPattern('O2u'), ORBIUM_O2U);
  assert.equal(getPattern('O2b'), ORBIUM_O2B);
  for (const bad of ['', 'o2u', 'O2g', 'constructor', '__proto__', null, undefined, 7]) {
    assert.throws(() => getPattern(bad), RangeError, String(bad));
  }
});

test('library: every entry carries name, description and full provenance, all frozen', () => {
  for (const p of PATTERN_LIBRARY) {
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.params) && Object.isFrozen(p.source), p.id);
    assert.ok(typeof p.name === 'string' && p.name.length > 0, p.id);
    assert.ok(typeof p.description === 'string' && p.description.length > 0 && p.description.length < 160, p.id);
    assert.equal(p.source.repository, 'https://github.com/Chakazul/Lenia');
    assert.equal(p.source.commit, 'adfc542939266de7f4bb7ebb552e8499701ee107');
    assert.equal(p.source.file, 'Python/animals.json');
    assert.equal(p.source.code, p.id);
    assert.equal(p.source.license, 'MIT');
    assert.equal(p.source.copyright, 'Copyright (c) 2018 Bert Chan');
  }
});

test('library: parameters are valid for this app unchanged, at R=13, inside LIMITS and UI_RANGES and on slider steps', () => {
  for (const p of PATTERN_LIBRARY) {
    const { params, adjustments } = normalizeParams({ gridSize: 64, ...p.params });
    assert.deepEqual(adjustments, [], p.id);
    assert.equal(p.params.radius, 13, p.id);
    assert.ok(p.params.radius >= LIMITS.radius.min && p.params.radius <= LIMITS.radius.max, p.id);
    for (const key of ['mu', 'sigma', 'timeSteps']) {
      const r = UI_RANGES[key], v = p.params[key];
      assert.equal(params[key], v, `${p.id} ${key}`);
      assert.ok(v >= r.min && v <= r.max, `${p.id} ${key}=${v} outside the slider range`);
      const steps = (v - r.min) / r.step;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, `${p.id} ${key}=${v} is not on a slider step`);
    }
  }
});

test('O2b provenance: RLE byte-identical to upstream (sha256 from Chakazul/Lenia at the pinned commit) and the upstream parameter record', () => {
  assert.equal(createHash('sha256').update(ORBIUM_O2B.rle, 'utf8').digest('hex'),
    '382578f5a58d05c5eae95bf6e44306e8b5eade02e20d8ca416657c389b2660e5');
  assert.equal(ORBIUM_O2B.rle.length, 462);
  assert.equal(ORBIUM_O2B.id, 'O2b');
  assert.equal(ORBIUM_O2B.name, 'Orbium bicaudatus');
  // Upstream record: R=13, T=10, b="1", m=0.15, s=0.014, kn=1, gn=1.
  assert.deepEqual({ ...ORBIUM_O2B.params }, { radius: 13, timeSteps: 10, mu: 0.15, sigma: 0.014 });
  assert.deepEqual(referenceO2b.upstream, {
    repo: ORBIUM_O2B.source.repository, commit: ORBIUM_O2B.source.commit, file: ORBIUM_O2B.source.file, code: ORBIUM_O2B.id,
  });
});

test('O2b decodes to the reference produced by the literal upstream decoder, cell for cell', () => {
  const d = decodeRle(ORBIUM_O2B.rle);
  assert.equal(d.width, 20);
  assert.equal(d.height, 20);
  assert.equal(referenceO2b.width, 20);
  assert.equal(referenceO2b.height, 20);
  let nonzero = 0, levelSum = 0, mass = 0;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const level = referenceO2b.levels[y][x];
      assert.equal(d.data[y * 20 + x], Math.fround(level / 255), `cell (${x},${y})`);
      if (level > 0) nonzero++;
      levelSum += level;
      mass += d.data[y * 20 + x];
    }
  }
  assert.equal(nonzero, 207);
  assert.equal(nonzero, referenceO2b.nonzero);
  assert.equal(levelSum, 18222);
  assert.equal(levelSum, referenceO2b.levelSum);
  assert.ok(Math.abs(mass - 18222 / 255) < 1e-4, `mass=${mass}`); // 71.458823...
  assert.ok(d.data.every((v) => v >= 0 && v <= 1));
  assert.equal(Math.max(...d.data), 1);
});

test('O2b centred placement is an exact, unscaled copy and zero elsewhere, at every supported grid size', () => {
  const d = decodeRle(ORBIUM_O2B.rle);
  for (const size of LIMITS.gridSizes) {
    const grid = placePatternCentred(size, d);
    const o = (size - 20) / 2;
    let outside = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inside = x >= o && x < o + 20 && y >= o && y < o + 20;
        if (inside) assert.equal(grid[y * size + x], d.data[(y - o) * 20 + (x - o)]);
        else outside += grid[y * size + x];
      }
    }
    assert.equal(outside, 0, `size ${size}`);
  }
});

test('O2b at its own sigma 0.014 persists and translates (CPU reference)', () => {
  const n = 64;
  const kernel = buildKernel(ORBIUM_O2B.params.radius);
  const seed = placePatternCentred(n, decodeRle(ORBIUM_O2B.rle));
  const start = circularCentroid(seed, n);
  let s = seed, at30 = null;
  for (let t = 1; t <= 100; t++) {
    s = stepReference(s, n, kernel, ORBIUM_O2B.params);
    if (t === 30) at30 = circularCentroid(s, n);
  }
  const end = circularCentroid(s, n);
  assert.ok(end.mass > 60 && end.mass < 80, `O2b mass at 100 steps = ${end.mass}`); // measured about 69.2 from a seed mass of 71.46
  const moved = torusDist(start, at30, n);
  assert.ok(moved > 10 && moved < 30, `O2b should move ~17 cells in 30 steps, moved ${moved}`);
});
