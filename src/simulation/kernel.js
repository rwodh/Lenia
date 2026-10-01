/** Pure Lenia math (no WebGL): kernel construction and growth mapping. */

/** Exponential kernel core, peaking at 1 for r = 0.5 and zero outside (0, 1). */
export function kernelCore(r) {
  if (!(r > 0 && r < 1)) return 0;
  return Math.exp(4 - 1 / (r * (1 - r)));
}

/**
 * Build a normalised single-ring Lenia kernel of radius R.
 * Returns row-major data of size (2R+1)^2 that sums to 1; index = j * size + i,
 * where (i - R, j - R) is the (dx, dy) offset.
 */
export function buildKernel(radius) {
  if (!Number.isInteger(radius) || radius < 1) {
    throw new RangeError(`kernel radius must be a positive integer, got ${radius}`);
  }
  const size = 2 * radius + 1;
  const data = new Float32Array(size * size);
  let sum = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const w = kernelCore(Math.hypot(i - radius, j - radius) / radius);
      data[j * size + i] = w;
      sum += w;
    }
  }
  for (let k = 0; k < data.length; k++) data[k] /= sum;
  return { data, size, radius };
}

/** Lenia growth mapping: Gaussian bump in [-1, 1] centred on mu. */
export function growth(u, mu, sigma) {
  const d = u - mu;
  return 2 * Math.exp(-(d * d) / (2 * sigma * sigma)) - 1;
}
