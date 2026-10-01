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
