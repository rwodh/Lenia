import { normalizeParams } from './params.js';
import { ORBIUM_O2U } from './patterns.js';
import { decodeRle } from './rle.js';
import { placePatternCentred, randomDiscSeed } from './seed.js';

const PATTERN_PARAM_KEYS = ['radius', 'timeSteps', 'mu', 'sigma'];

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
 * mu 0.15, sigma 0.015). The organism only exists at that kernel radius and growth setting, and
 * patterns are never rescaled, so if the request would change any of them (for example ?radius=10)
 * Orbium is NOT shown; the previous random-noise start is used instead and `notes` says why.
 *
 * Returns { kind: 'orbium' | 'noise', params, initialState, notes }.
 */
export function planStartup(raw = {}) {
  const orbium = normalizeParams({ ...ORBIUM_O2U.params, ...raw });
  const mismatches = patternMismatches(orbium.params, ORBIUM_O2U);

  if (mismatches.length === 0) {
    const pattern = decodeRle(ORBIUM_O2U.rle);
    return {
      kind: 'orbium',
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
    params,
    initialState: randomDiscSeed(params.gridSize, { radiusFraction: 0.2, seed: params.seed }),
    notes: [...adjustments, `Orbium needs ${need} but this URL gives ${have}: showing random noise instead.`],
  };
}
