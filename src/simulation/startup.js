import { normalizeParams } from './params.js';
import { ORBIUM_O2U, getPattern } from './patterns.js';
import { decodeRle } from './rle.js';
import { placePatternCentred, placePatternAt, randomDiscSeed } from './seed.js';

const PATTERN_PARAM_KEYS = ['radius', 'timeSteps', 'mu', 'sigma'];

/** Text shown for a pattern in the status panel, e.g. "Orbium unicaudatus (O2u)". */
export const patternLabel = (pattern) => `${pattern.name} (${pattern.id})`;

/** Which of the pattern's required parameters differ from `params`. Empty array = compatible. */
export function patternMismatches(params, pattern) {
  return PATTERN_PARAM_KEYS
    .filter((k) => params[k] !== pattern.params[k])
    .map((k) => ({ key: k, have: params[k], need: pattern.params[k] }));
}

/**
 * Decide what the application starts with. `raw` is the (unvalidated) parameter object from
 * parseQueryParams. Never throws for bad input; throws LeniaError only if the built-in pattern
 * itself cannot be decoded (an internal bug).
 *
 * Default: the verified Orbium organism together with its own parameter set (radius 13, T=10,
 * mu 0.15, sigma 0.015). The stored pattern is defined at that kernel radius and growth setting, and
 * this project never rescales patterns, so if the request would change any of them (for example
 * ?radius=10) Orbium is NOT shown; the previous random-noise start is used instead and `notes` says why.
 *
 * Returns { kind: 'orbium' | 'noise', patternId, label, params, initialState, notes }; patternId is null for noise.
 */
export function planStartup(raw = {}) {
  const orbium = normalizeParams({ ...ORBIUM_O2U.params, ...raw });
  const mismatches = patternMismatches(orbium.params, ORBIUM_O2U);

  if (mismatches.length === 0) {
    const pattern = decodeRle(ORBIUM_O2U.rle);
    return {
      kind: 'orbium',
      patternId: ORBIUM_O2U.id,
      label: patternLabel(ORBIUM_O2U),
      params: orbium.params,
      initialState: placePatternCentred(orbium.params.gridSize, pattern),
      notes: orbium.adjustments,
    };
  }

  const { params, adjustments } = normalizeParams(raw);
  const need = mismatches.map((m) => `${m.key}=${m.need}`).join(', ');
  const have = mismatches.map((m) => `${m.key}=${m.have}`).join(', ');
  return {
    kind: 'noise',
    patternId: null,
    label: 'Random noise (seeded)',
    params,
    initialState: randomDiscSeed(params.gridSize, { radiusFraction: 0.2, seed: params.seed }),
    notes: [...adjustments, `Orbium needs ${need} but this URL gives ${have}: showing random noise instead.`],
  };
}

/**
 * Plan loading library pattern `id` into a running app whose current base parameters are `baseParams`
 * (grid size and seed are kept). Pure, no GL. Throws RangeError for an unknown id, or when the pattern's
 * parameters (radius above all) are not usable here: the kernel is built once from the app's radius and
 * patterns are never rescaled, so a pattern whose radius differs from the running one cannot be shown.
 *
 * `placement` is null (centred, as at startup) or a cell { x, y } where the pattern's centre cell lands (placePatternAt,
 * wrap-aware). Placement moves the seed only: values, orientation and parameters are unchanged.
 *
 * Returns { pattern, params, initialState, label }; `params` is the pattern's own parameter set.
 */
export function planPattern(id, baseParams, placement = null) {
  const pattern = getPattern(id);
  const { params } = normalizeParams({ ...baseParams, ...pattern.params });
  const bad = patternMismatches(params, pattern);
  if (bad.length || baseParams.radius !== pattern.params.radius) {
    const need = pattern.params.radius;
    throw new RangeError(`pattern ${pattern.id} needs radius ${need}, but this world uses radius ${baseParams.radius}`);
  }
  const decoded = decodeRle(pattern.rle);
  return {
    pattern,
    params,
    initialState: placement === null
      ? placePatternCentred(params.gridSize, decoded)
      : placePatternAt(params.gridSize, decoded, placement.x, placement.y),
    label: patternLabel(pattern),
  };
}
