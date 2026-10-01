import { LIMITS, DEFAULT_PARAMS } from '../config.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const taps = (grid, radius) => grid * grid * (2 * radius + 1) ** 2;

/**
 * Validate and sanitise simulation parameters. Never throws: invalid input falls
 * back to defaults / is clamped, and every change is reported in `adjustments`.
 */
export function normalizeParams(raw = {}) {
  const adjustments = [];
  const out = { ...DEFAULT_PARAMS };
  const src = raw && typeof raw === 'object' ? raw : {};

  const number = (key, { min, max, integer = false }) => {
    if (!(key in src)) return;
    let v = src[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      adjustments.push(`${key}: invalid value, using default ${DEFAULT_PARAMS[key]}`);
      return;
    }
    if (integer) v = Math.round(v);
    const c = clamp(v, min, max);
    if (c !== v) adjustments.push(`${key}: ${v} clamped to ${c}`);
    out[key] = c;
  };

  number('radius', { ...LIMITS.radius, integer: true });
  number('timeSteps', LIMITS.timeSteps);
  number('mu', LIMITS.mu);
  number('sigma', LIMITS.sigma);
  number('seed', { min: 0, max: 0xffffffff, integer: true });

  if ('gridSize' in src) {
    const v = src.gridSize;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      adjustments.push(`gridSize: invalid value, using default ${DEFAULT_PARAMS.gridSize}`);
    } else {
      const nearest = LIMITS.gridSizes.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
      if (nearest !== v) adjustments.push(`gridSize: ${v} is not supported, using ${nearest}`);
      out.gridSize = nearest;
    }
  }

  // Resource-exhaustion guard: lower the kernel radius until the per-step workload fits.
  const requested = out.radius;
  while (out.radius > LIMITS.radius.min && taps(out.gridSize, out.radius) > LIMITS.maxTapsPerStep) {
    out.radius -= 1;
  }
  if (out.radius !== requested) {
    adjustments.push(`radius: ${requested} too expensive for a ${out.gridSize}x${out.gridSize} grid, using ${out.radius}`);
  }

  return { params: out, adjustments };
}

/**
 * Extract known simulation parameters from a URL query string ("?grid=128&radius=10&seed=7").
 * Unknown keys and non-numeric values are ignored; range checking is normalizeParams' job.
 */
export function parseQueryParams(search) {
  const map = { grid: 'gridSize', radius: 'radius', seed: 'seed' };
  const query = new URLSearchParams(search);
  const raw = {};
  for (const [qk, key] of Object.entries(map)) {
    const text = query.get(qk);
    if (text === null || !/^\d{1,10}$/.test(text)) continue;
    raw[key] = Number(text);
  }
  return raw;
}
