# Decisions

Each entry: what was decided, why, and its evidence status. "Verified" means checked by a test or measurement
described in `progress.md`; "Decided" means a design choice with no measurement behind it.

| # | Decision | Why | Status |
|---|----------|-----|--------|
| 1 | Static, client-side WebGL2 app; no backend, no build step, no runtime dependencies. ES modules, so it must be served over http (`npm start`), not opened from `file://`. | Master prompt: deployable as a static site, light on an 8 GB machine. | Decided |
| 2 | Shaders are JS string modules (`src/shaders/*.js`). | No fetch, no bundler; works on any static host. | Decided |
| 3 | State in R32F, falling back to R16F; each candidate is probed by building a real framebuffer. State is read with `texelFetch` (NEAREST) and wrapped manually. | Float render targets are an extension in WebGL2; avoids needing float-linear filtering. | Decided. R16F fallback never exercised. |
| 4 | Convolution is direct (every kernel tap per cell), not FFT. | Simple and correct for R <= 24. The paper's pseudocode also uses direct convolution for small worlds. | Decided. Cost uncalibrated on real hardware. |
| 5 | Kernel: single ring, exponential core (alpha 4), normalised to sum 1. Growth: Gaussian. Update: hard clip, dt = 1/T. Periodic boundary. | Matches the paper and the upstream `bump4` / `gaus` definitions. | Verified by reading both sources; CPU and GPU agree. |
| 6 | Fixed 60 steps/s simulation rate, independent of display refresh; at most 4 steps per frame. | Same behaviour on 60 Hz and 144 Hz screens. | Decided |
| 7 | `FrameFence`: at most 2 frames of GPU work in flight, `gl.flush()` per submitted frame; when GPU-limited, 1 step per frame and the HUD says so. | An open-loop loop built a ~150 s backlog on a slow renderer and froze the page; with the fence the backlog drained in 1.3 s. | Verified on a software renderer only. No defect found in review. |
| 8 | Seed data is copied programmatically, never retyped, from upstream `Python/animals.json` entry `O2u` at a pinned commit (MIT; see `THIRD_PARTY_NOTICES.md`). The RLE's SHA-256 is checked by a unit test. | Legal, reproducible, no invented data. | Verified |
| 9 | Orbium uses sigma 0.015, the value stored with that pattern. Other sources say 0.014, 0.016, 0.017. | The stored pattern matches 0.015; 0.014 evaporates, 0.015 and 0.016 persist. | Verified (CPU reference) |
| 10 | Patterns are never rescaled. A pattern runs only with its own radius, T, mu and sigma. | Keeps seed data untouched. Unscaled, Orbium evaporated within 100 steps at R = 8, 10, 11, 12, 15, 16, 20 and persisted at R = 13 and 14. | Verified (CPU, ad hoc). The paper reports approximate scale invariance when a pattern is resampled (R > 12); resampling is not implemented. |
| 11 | Startup: Orbium with its own parameters by default. If the URL changes any required parameter (today only `?radius=`), show the old random-noise start with the requested radius and an on-screen note. | Keeps `?radius=` usable for experiments instead of forcing 13 or silently showing a dying pattern. | Decided; behaviour verified. Forcing radius 13 instead would be a small change. |
| 12 | GPU/CPU parity: strict pointwise (1e-3) for the first 200 steps; beyond that compare observables (mass, centroid) only. | The system is sensitive to initial conditions, so pointwise error is not meaningful at long horizons. | Verified (see `progress.md`) |
| 13 | Placement copies pattern row 0 to the lowest grid row, so Orbium appears vertically mirrored relative to upstream pictures. | Exact copy with no flipping. The paper reports reflection invariance (Fig. 6d), and the placed state is what is tested. | Decided |
| 14 | Browser results from a software renderer are never described as hardware-GPU results. | Honesty about what was verified. | Policy |
