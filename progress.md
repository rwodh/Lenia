# Progress

## Phase 1 - Foundation: DONE (v0.1.0)
Static WebGL2 app: context/capability probing, shader pipeline, ping-pong GPU Lenia step (real kernel +
growth), display pass with colour map, HUD, error handling, context-loss recovery, GPU back-pressure (FrameFence).

## Phase 2, milestone 1 - Verified Orbium seed: DONE (not yet wired into the app)
- `src/simulation/patterns.js`: upstream `O2u` (Orbium unicaudatus), RLE verbatim, R=13 T=10 mu=0.15 sigma=0.015.
  Source: github.com/Chakazul/Lenia @ adfc542939266de7f4bb7ebb552e8499701ee107, `Python/animals.json` (MIT).
- `src/simulation/rle.js`: strict, bounded decoder. `seed.js`: `placePatternCentred` (exact copy, no rescale).
- `THIRD_PARTY_NOTICES.md`: verbatim MIT text, attribution, re-verification command.
- Decoded 20x20, 222 non-zero cells, level sum 19600 (mass 76.8627), checked against a reference produced by executing
  the literal upstream decoder source.

### Verification status
- `npm test`: 36 unit tests pass.
- `tests/browser/gpu-parity.html` and `tests/browser/orbium-gpu.html`: ALL PASS in headless Chromium on a SOFTWARE
  rasteriser (SwiftShader, 1 core). Never run on a real GPU.
- Orbium on the GPU: max abs error vs CPU 6.6e-7 / 1.4e-6 / 2.9e-6 after 1 / 5 / 20 steps (tolerance 1e-3);
  1000 steps keep mass at 0.92-0.93x of the seed, shape correlation >= 0.935, no WebGL errors.
- Measured speed is ~0.61 cells/step (about 614 cells in 1000 steps). On a small periodic grid displacement wraps,
  so speed must be measured with fine-grained unwrapped tracking, not start-to-end distance.

## Known limitations
- The app (`src/app.js`) still seeds random noise. Wiring the Orbium seed in is the next step. The organism only
  exists at kernel radius 13 (`?radius=` other than 13 changes the organism); patterns are never rescaled here.
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
Wire the Orbium seed into the app (choose seed + its parameter set together), then pause/step/reset.
