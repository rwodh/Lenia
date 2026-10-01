/**
 * CPU reference implementation of one Lenia step. Slow (O(n^2 k^2)); exists to
 * unit-test the math and to verify the GPU shader against (tests/browser).
 */
import { growth } from './kernel.js';

/** Periodic convolution: U[p] = sum_d K[d] * A[p + d]. */
export function convolveReference(state, n, kernel) {
  const { data, size, radius } = kernel;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let u = 0;
      for (let j = 0; j < size; j++) {
        const yy = (((y + j - radius) % n) + n) % n;
        for (let i = 0; i < size; i++) {
          const w = data[j * size + i];
          if (w === 0) continue;
          const xx = (((x + i - radius) % n) + n) % n;
          u += w * state[yy * n + xx];
        }
      }
      out[y * n + x] = u;
    }
  }
  return out;
}

/** A' = clamp(A + (1/T) * G(K * A), 0, 1) */
export function stepReference(state, n, kernel, { mu, sigma, timeSteps }) {
  const u = convolveReference(state, n, kernel);
  const out = new Float32Array(n * n);
  const dt = 1 / timeSteps;
  for (let k = 0; k < out.length; k++) {
    out[k] = Math.min(1, Math.max(0, state[k] + dt * growth(u[k], mu, sigma)));
  }
  return out;
}
