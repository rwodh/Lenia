import test from 'node:test';
import assert from 'node:assert/strict';
import { computeObservables, circularMean, spreadCells, wrapDelta, torusDistance } from '../../src/simulation/observables.js';
import { OBSERVATORY } from '../../src/config.js';
import { PATTERN_LIBRARY } from '../../src/simulation/patterns.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { placePatternCentred } from '../../src/simulation/seed.js';

const field = (n, fn) => { const s = new Float32Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) s[y * n + x] = fn(x, y); return s; };
const noNaN = (o) => JSON.stringify(o, (k, v) => { assert.ok(!(typeof v === 'number' && !Number.isFinite(v)), `${k} is ${v}`); return v; });

// The per-cell circular centroid the tests used before this module existed (tests/unit/patterns.test.js), kept verbatim
// here as an independent reference for the consistency check.
function legacyCircularCentroid(state, n) {
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

test('mass is the exact sum of cell values; active area counts cells above the threshold', () => {
  const n = 8;
  const s = field(n, (x, y) => (x === 1 && y === 2 ? 1 : x === 5 && y === 5 ? 0.5 : x === 6 && y === 0 ? 0.25 : 0));
  const o = computeObservables(s, n);
  assert.equal(o.mass, 1.75); // exactly representable values, so the sum is exact
  assert.equal(o.activeArea, 3);
});

test('active-area threshold is strict (>) and applies to the stored float32 value', () => {
  const n = 4, t = OBSERVATORY.activeThreshold;
  assert.equal(t, 0.01);
  const at = Math.fround(t); // what a Float32Array holds for 0.01 (slightly below 0.01)
  const above = Math.fround(0.0100001);
  assert.ok(at <= t && above > t);
  assert.equal(computeObservables(field(n, (x, y) => (x === 0 && y === 0 ? at : 0)), n).activeArea, 0);
  assert.equal(computeObservables(field(n, (x, y) => (x === 0 && y === 0 ? above : 0)), n).activeArea, 1);
  assert.equal(computeObservables(field(n, () => at), n, { activeThreshold: 0.001 }).activeArea, 16, 'threshold is configurable');
});

test('a blob straddling the grid seam is located at the seam, not at the grid centre', () => {
  const n = 64;
  const s = field(n, (x, y) => ([62, 63, 0, 1].includes(x) && y >= 30 && y <= 33 ? 1 : 0));
  const c = computeObservables(s, n).centroid;
  assert.ok(c.valid);
  assert.ok(Math.abs(wrapDelta(63.5, c.x, n)) < 1e-9, `x=${c.x}`);
  assert.ok(Math.abs(c.y - 31.5) < 1e-9, `y=${c.y}`);
  assert.ok(torusDistance({ x: c.x, y: c.y }, { x: 32, y: 32 }, n) > 30);
});

test('an empty field gives a defined no-mass result with no NaN', () => {
  const o = computeObservables(new Float32Array(16 * 16), 16);
  assert.equal(o.mass, 0);
  assert.equal(o.activeArea, 0);
  assert.deepEqual(o.centroid, { x: null, y: null, rx: 0, ry: 0, spreadX: null, spreadY: null, valid: false, reason: 'no-mass' });
  noNaN(o);
  // a trace of mass below minMass is treated the same way
  assert.equal(computeObservables(field(16, (x, y) => (x + y === 0 ? OBSERVATORY.minMass / 2 : 0)), 16).centroid.reason, 'no-mass');
});

test('uniform, nearly uniform and evenly split fields are flagged low-concentration (centroid not meaningful)', () => {
  const n = 64;
  for (const [name, s] of [
    ['uniform', field(n, () => 0.3)],
    ['nearly uniform', field(n, (x, y) => 0.3 + 1e-3 * (((x * 31 + y * 17) % 13) / 13))],
    ['two blobs half a grid apart', field(n, (x, y) => ((x < 4 && y < 4) || (x >= 32 && x < 36 && y >= 32 && y < 36) ? 1 : 0))],
  ]) {
    const o = computeObservables(s, n);
    assert.equal(o.centroid.valid, false, name);
    assert.equal(o.centroid.reason, 'low-concentration', name);
    assert.ok(Math.min(o.centroid.rx, o.centroid.ry) < OBSERVATORY.minConcentration, name);
    noNaN(o);
  }
});

test('consistency: equals the per-cell circular centroid used by the earlier tests, on both library seeds and grid sizes', () => {
  for (const p of PATTERN_LIBRARY) {
    for (const n of [64, 128, 256]) {
      const s = placePatternCentred(n, decodeRle(p.rle));
      const o = computeObservables(s, n), ref = legacyCircularCentroid(s, n);
      assert.ok(Math.abs(o.mass - ref.mass) < 1e-9, `${p.id} ${n} mass`);
      assert.ok(Math.abs(wrapDelta(ref.x, o.centroid.x, n)) < 1e-9 && Math.abs(wrapDelta(ref.y, o.centroid.y, n)) < 1e-9, `${p.id} ${n} centroid`);
      assert.ok(o.centroid.valid, `${p.id} ${n} valid`);
    }
  }
});

test('library seeds: masses equal the fixture level sums / 255 and active areas count the cells above 0.01', () => {
  const expected = { O2u: { mass: 19600 / 255, active: 220 }, O2b: { mass: 18222 / 255, active: 205 } };
  for (const p of PATTERN_LIBRARY) {
    const n = 64, o = computeObservables(placePatternCentred(n, decodeRle(p.rle)), n);
    assert.ok(Math.abs(o.mass - expected[p.id].mass) < 1e-4, `${p.id} mass ${o.mass}`);
    assert.equal(o.activeArea, expected[p.id].active, p.id); // O2u has 222 non-zero cells; 2 hold level 1 or 2 (< 0.01)
  }
});

test('spread in cells does not depend on grid size for the same pattern, while concentration R does', () => {
  const p = PATTERN_LIBRARY[0];
  const a = computeObservables(placePatternCentred(64, decodeRle(p.rle)), 64).centroid;
  const b = computeObservables(placePatternCentred(128, decodeRle(p.rle)), 128).centroid;
  assert.ok(Math.abs(a.spreadX - b.spreadX) < 0.05 && Math.abs(a.spreadY - b.spreadY) < 0.05, `${a.spreadX} ${b.spreadX}`);
  assert.ok(b.rx > a.rx);
});

test('helpers: circularMean, spreadCells, wrapDelta, torusDistance', () => {
  const m = new Float64Array(10); m[9] = 1; m[1] = 1;
  const c = circularMean(m, 10, 2);
  assert.ok(Math.abs(c.pos) < 1e-9 || Math.abs(c.pos - 10) < 1e-9, `pos=${c.pos}`);
  assert.equal(circularMean(new Float64Array(10), 10, 0).r, 0);
  assert.equal(spreadCells(0, 64), null);
  assert.equal(spreadCells(1, 64), 0);
  assert.equal(wrapDelta(63, 1, 64), 2);
  assert.equal(wrapDelta(1, 63, 64), -2);
  assert.equal(torusDistance({ x: 0, y: 0 }, { x: 63, y: 63 }, 64), Math.SQRT2);
});

test('malformed input is rejected rather than misread', () => {
  assert.throws(() => computeObservables(new Float32Array(10), 4), RangeError);
  assert.throws(() => computeObservables(new Float32Array(16), 0), RangeError);
  assert.throws(() => computeObservables(null, 4), RangeError);
});
