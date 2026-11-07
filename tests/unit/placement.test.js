import test from 'node:test';
import assert from 'node:assert/strict';
import { placePatternCentred, placePatternAt, centredAnchor } from '../../src/simulation/seed.js';
import { PATTERN_LIBRARY } from '../../src/simulation/patterns.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { planPattern } from '../../src/simulation/startup.js';
import { LIMITS } from '../../src/config.js';

const decoded = PATTERN_LIBRARY.map((p) => ({ id: p.id, pattern: decodeRle(p.rle), params: p.params }));
const sum = (a) => a.reduce((s, v) => s + v, 0);
const nonZero = (a) => a.reduce((k, v) => k + (v !== 0), 0);

test('placing at the centred anchor reproduces placePatternCentred exactly (every pattern, every grid size)', () => {
  for (const { id, pattern } of decoded) {
    for (const n of LIMITS.gridSizes) {
      const a = centredAnchor(n, pattern);
      assert.deepEqual(placePatternAt(n, pattern, a.x, a.y), placePatternCentred(n, pattern), `${id} at ${n}`);
    }
  }
});

test('placement moves the pattern without changing a value: each pattern cell lands at anchor + offset, wrapped', () => {
  const n = 64;
  for (const { id, pattern } of decoded) {
    const { width: w, height: h, data } = pattern;
    for (const [x, y] of [[0, 0], [63, 63], [5, 60], [62, 1], [31, 17]]) {
      const s = placePatternAt(n, pattern, x, y);
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const gx = (((x - Math.floor(w / 2) + c) % n) + n) % n, gy = (((y - Math.floor(h / 2) + r) % n) + n) % n;
          assert.equal(s[gy * n + gx], data[r * w + c], `${id} at (${x},${y}) cell (${c},${r})`);
        }
      }
      assert.equal(sum(s), sum(data), `${id} at (${x},${y}): mass unchanged`);
      assert.equal(nonZero(s), nonZero(data), `${id} at (${x},${y}): no cell lost or added across the seams`);
    }
  }
});

test('a placement across the corner is the centred seed shifted on the torus', () => {
  const n = 64, { pattern } = decoded[0], a = centredAnchor(n, pattern);
  const centred = placePatternCentred(n, pattern), corner = placePatternAt(n, pattern, 1, 2);
  const dx = 1 - a.x, dy = 2 - a.y;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      assert.equal(corner[(((y + dy) % n + n) % n) * n + (((x + dx) % n + n) % n)], centred[y * n + x]);
    }
  }
});

test('placement is deterministic and returns a fresh array', () => {
  const { pattern } = decoded[1];
  const a = placePatternAt(128, pattern, 100, 7), b = placePatternAt(128, pattern, 100, 7);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
});

test('bad placements are rejected', () => {
  const { pattern } = decoded[0];
  for (const [x, y] of [[-1, 0], [0, 64], [64, 0], [1.5, 2], [NaN, 3], [3, Infinity], ['4', 4]]) {
    assert.throws(() => placePatternAt(64, pattern, x, y), RangeError, `(${x}, ${y})`);
  }
  assert.throws(() => placePatternAt(16, pattern, 1, 1), RangeError, 'pattern larger than the grid');
});

test('planPattern: no placement is the centred startup seed; a placement uses placePatternAt; parameters are the same', () => {
  const base = { gridSize: 64, radius: 13, timeSteps: 10, mu: 0.15, sigma: 0.015, seed: 1 };
  for (const { id, pattern } of decoded) {
    const centred = planPattern(id, base), placed = planPattern(id, base, { x: 3, y: 61 });
    assert.deepEqual(centred.initialState, placePatternCentred(64, pattern));
    assert.deepEqual(placed.initialState, placePatternAt(64, pattern, 3, 61));
    assert.deepEqual(placed.params, centred.params);
    assert.throws(() => planPattern(id, base, { x: 64, y: 0 }), RangeError);
  }
});
