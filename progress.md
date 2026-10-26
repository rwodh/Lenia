# Progress

## Phase 1 - Foundation: DONE (v0.1.0)

Static WebGL2 app: context/capability probing, shader pipeline, ping-pong GPU Lenia step (real kernel +
growth), display pass with colour map, HUD, error handling, context-loss recovery, GPU back-pressure (FrameFence).

## Phase 2, milestone 1 - Verified Orbium seed: DONE

- `src/simulation/patterns.js`: upstream `O2u` (Orbium unicaudatus), RLE verbatim, R=13 T=10 mu=0.15 sigma=0.015.
  Source: github.com/Chakazul/Lenia @ adfc542939266de7f4bb7ebb552e8499701ee107, `Python/animals.json` (MIT).
- `src/simulation/rle.js`: strict, bounded decoder. `seed.js`: `placePatternCentred` (exact copy, no rescale).
- `THIRD_PARTY_NOTICES.md`: verbatim MIT text, attribution, re-verification command.
- Decoded 20x20, 222 non-zero cells, level sum 19600 (mass 76.8627), checked against a reference produced by executing
  the literal upstream decoder source.

### Phase 2, milestone 2 - Orbium in normal startup: DONE

- `src/simulation/startup.js` (`planStartup`): Orbium + its parameter set is the default start. If the URL changes any
  required parameter (today only `?radius=` can), the old random-noise start is used instead and a HUD note says why.
  `App` now receives `initialState` (it no longer hardcodes the noise seed); `main.js` builds the plan inside its error handling.
- Verified through the real entry point (`npm start`, `index.html`): the running app's GPU state equals a CPU reference started
  from the verified seed (1.25e-6 after 6 steps at grid 256; 8.6e-5 after 153 steps at grid 64); a 500-step run through the
  app's own loop keeps mass 0.90-0.97x of the seed, shape correlation >= 0.93, ~0.61 cells/step; `?radius=10` shows the note and
  noise; context loss + restore re-seeds with Orbium; WebGL2-unavailable still shows the fatal panel.

## Verification status

- `npm test`: 45 unit tests pass.
- `tests/browser/gpu-parity.html` and `tests/browser/orbium-gpu.html`: ALL PASS in headless Chromium on a SOFTWARE
  rasteriser (SwiftShader, 1 core). Never run on a real GPU.
- Orbium on the GPU: max abs error vs CPU 6.6e-7 / 1.4e-6 / 2.9e-6 after 1 / 5 / 20 steps (tolerance 1e-3);
  1000 steps keep mass at 0.92-0.93x of the seed, shape correlation >= 0.935, no WebGL errors.
- Measured speed is ~0.61 cells/step (about 614 cells in 1000 steps). On a small periodic grid displacement wraps,
  so speed must be measured with fine-grained unwrapped tracking, not start-to-end distance.

## Known limitations

- The organism only exists at kernel radius 13; patterns are never rescaled. `?radius=` other than 13 therefore shows
  the random-noise start (with a note), not Orbium.
- Orbium is 20 cells wide, so at the default 256 grid it is small on screen (no zoom yet). The default grid was not changed.
- Pointwise GPU-vs-CPU agreement holds early (<= ~1e-4 through 200 steps) but not at long horizons: the dynamics are
  sensitive to initial conditions (1e-7 seed perturbation -> ~5e-4 after 700 steps; float32 vs float64 CPU variants differ
  ~1e-2 pointwise). Long-run comparison therefore uses observables (mass, centroid), which agree to 0.07 / 0.03 cells.
  The GPU deviates ~4x more than a CPU float32 emulation; the cause (exp precision, FMA or tap order on the software
  rasteriser) was not isolated.
- Placement copies pattern row 0 to the lowest grid row, so the organism appears vertically mirrored relative to upstream
  pictures. Lenia is reflection-invariant and the placed state is what was verified.
- Sigma for Orbium differs between sources (0.014/0.015/0.016/0.017); 0.015 is used. See `patterns.js`.
- Parameters fixed at start (URL only); no runtime controls, pause/step/reset, zoom/pan yet.
- `maxTapsPerStep` (200M) is an estimate, not calibrated against real hardware.

## Next

Pause / step / reset (reset reuses `App.initialState`), then runtime parameter controls.
