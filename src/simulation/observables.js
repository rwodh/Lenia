import { OBSERVATORY } from '../config.js';

/**
 * Observables of a Lenia state: pure functions of a Float32Array (row-major, n x n, values in [0,1]) on the periodic grid.
 * No WebGL; used by the app's Observatory and by the tests. Every metric is named for what it computes.
 *
 *  mass        sum of all cell values
 *  activeArea  number of cells whose value is strictly greater than OBSERVATORY.activeThreshold
 *  centroid    per-axis circular mean of the cell values on the torus (so a pattern straddling an edge is located at
 *              the edge, not at the grid centre), with its concentration R (0..1) per axis. R is the length of the mean
 *              resultant vector: 1 for mass at a single coordinate, 0 when mass is spread evenly around the axis.
 *              The centroid is reported valid only when mass >= OBSERVATORY.minMass and both R >= minConcentration.
 */

/** Circular mean position (in cells, [0, n)) and concentration R of a 1-D marginal on a ring of n cells. */
export function circularMean(marginal, n, total) {
  let c = 0, s = 0;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    c += marginal[i] * Math.cos(a);
    s += marginal[i] * Math.sin(a);
  }
  const r = total > 0 ? Math.min(1, Math.hypot(c, s) / total) : 0;
  const pos = r > 0 ? (((Math.atan2(s, c) / (2 * Math.PI)) * n) % n + n) % n : 0;
  return { pos, r };
}

/** Circular standard deviation in cells for concentration R on a ring of n cells; null when R is 0 (no direction). */
export const spreadCells = (r, n) => (r > 0 ? (n / (2 * Math.PI)) * Math.sqrt(Math.max(0, -2 * Math.log(r))) : null);

/** Shortest signed displacement from a to b on a ring of n cells, in (-n/2, n/2]. */
export const wrapDelta = (a, b, n) => ((((b - a + n / 2) % n) + n) % n) - n / 2;

/** Distance between two points on an n x n torus. */
export const torusDistance = (a, b, n) => Math.hypot(wrapDelta(a.x, b.x, n), wrapDelta(a.y, b.y, n));

/**
 * All observables of `state` (length n*n). Never throws for a well-formed state and never returns NaN: an empty field
 * gives mass 0, activeArea 0 and centroid { x: null, y: null, valid: false, reason: 'no-mass' }.
 */
export function computeObservables(state, n, options = {}) {
  const { activeThreshold, minMass, minConcentration } = { ...OBSERVATORY, ...options };
  if (!Number.isInteger(n) || n <= 0 || !state || state.length !== n * n) {
    throw new RangeError(`state must have ${n}x${n} values`);
  }
  const cols = new Float64Array(n), rows = new Float64Array(n);
  let mass = 0, activeArea = 0;
  for (let y = 0; y < n; y++) {
    let rowSum = 0;
    const base = y * n;
    for (let x = 0; x < n; x++) {
      const v = state[base + x];
      rowSum += v;
      cols[x] += v;
      if (v > activeThreshold) activeArea++;
    }
    rows[y] = rowSum;
    mass += rowSum;
  }
  if (!(mass >= minMass)) {
    return { mass, activeArea, centroid: { x: null, y: null, rx: 0, ry: 0, spreadX: null, spreadY: null, valid: false, reason: 'no-mass' } };
  }
  const cx = circularMean(cols, n, mass), cy = circularMean(rows, n, mass);
  const valid = cx.r >= minConcentration && cy.r >= minConcentration;
  return {
    mass,
    activeArea,
    centroid: {
      x: cx.pos, y: cy.pos, rx: cx.r, ry: cy.r,
      spreadX: spreadCells(cx.r, n), spreadY: spreadCells(cy.r, n),
      valid, reason: valid ? 'ok' : 'low-concentration',
    },
  };
}
