# Progress

## Phase 1 - Foundation: DONE (v0.1.0)
Static WebGL2 app: context/capability probing, shader pipeline, ping-pong GPU Lenia step (real kernel +
growth), display pass with colour map, HUD, error handling, context-loss recovery, GPU back-pressure.
Initial state = seeded random noise in a central disc (NOT a real organism; see below).

## Verification status
- `npm test`: 19 unit tests pass.
- `tests/browser/gpu-parity.html`: GPU matches CPU reference (max abs diff ~1e-6), colour map endpoints, shader-error reporting.
- Run in headless Chromium on a SOFTWARE rasteriser (SwiftShader, 1 core). Never measured on a real GPU.
  Real-GPU frame rates are unknown; check `?grid=256` and `?grid=512` on the target hardware.

## Known limitations
- Seeds are random noise; with the default parameters they grow into an expanding labyrinth rather than gliders.
  Real organisms (e.g. Orbium) need a verified seed library (Phase 2/3).
- Parameters are fixed at start (URL only); no runtime controls, pause/step/reset, zoom/pan yet.
- `maxTapsPerStep` (200M) is an estimate, not calibrated against real hardware.
- Convolution is direct (O(R^2) per cell); fine for R <= 24, an FFT or separable approach is not planned.

## Next
Phase 2: verified seed organism(s) + parameter sets, pause/step/reset, then runtime parameter controls.
