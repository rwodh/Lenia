/** Deterministic initial states (pure; no WebGL). */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Uniform random noise in [0, 1) inside a centred disc of `radiusFraction * size`
 * cells, zero elsewhere. Row-major, length size*size.
 */
export function randomDiscSeed(size, { radiusFraction = 0.2, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  const data = new Float32Array(size * size);
  const c = (size - 1) / 2;
  const r = radiusFraction * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = rand(); // always draw, so the stream does not depend on the disc geometry
      if (Math.hypot(x - c, y - c) <= r) data[y * size + x] = v;
    }
  }
  return data;
}

/**
 * Place a decoded pattern ({ width, height, data }) unmodified at the centre of a size x size grid.
 * No scaling, rotation or value change: pattern row r, column c lands on grid row
 * floor((size-height)/2)+r, column floor((size-width)/2)+c. Grid row 0 is the bottom of the
 * screen (see display.frag.js), so the pattern appears vertically mirrored relative to upstream
 * images; Lenia is reflection-invariant and the placed state is what is simulated and tested.
 */
export function placePatternCentred(size, pattern) {
  const { width, height, data } = pattern;
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`grid size must be a positive integer, got ${size}`);
  if (width > size || height > size) {
    throw new RangeError(`pattern ${width}x${height} does not fit in a ${size}x${size} grid`);
  }
  const out = new Float32Array(size * size);
  const ox = Math.floor((size - width) / 2);
  const oy = Math.floor((size - height) / 2);
  for (let r = 0; r < height; r++) out.set(data.subarray(r * width, (r + 1) * width), (oy + r) * size + ox);
  return out;
}
