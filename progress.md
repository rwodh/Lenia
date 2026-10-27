# Progress

Sections: status by phase, proposal feature status, verified facts, unresolved or unverified items, planned work.
Architecture is in `README.md`; design decisions are in `DECISIONS.md`.

## Status by phase
| Phase | State |
|---|---|
| 1 Foundation | Done |
| 2 Core Lenia | Done: GPU Lenia step, and the verified Orbium seed is shown at startup (one organism only) |
| 3 Interaction | Not started |
| 4 Visualization | Partial: fixed viridis colour map and a HUD only |
| 5 Quality | Partial: unit tests, two browser GPU pages, input limits, error paths. No accessibility pass, no hardware performance calibration |
| 6 Deployment | Not started: localhost dev server only; CSP is a meta tag |
| 7 Extensions | Not started |

## Proposal feature status (`CGL_Project_Proposal.pdf`, section 4)
| Feature | Status |
|---|---|
| Real-time Lenia simulation | Implemented |
| Emergent organisms | One verified organism (Orbium); random noise otherwise |
| Seed organism library | Not implemented (one seed, chosen automatically) |
| Interactive parameter controls | Not implemented (grid, radius and seed via URL only) |
| Real-time GPU processing | Implemented (WebGL2 fragment shader, ping-pong textures) |
| Pause, step, reset, restart | Not implemented |
| Zoom and pan | Not implemented |
| Information display | Partial: generation, fps, grid, radius, float format, "GPU-limited". No running/paused status |
| Dynamic colour visualization | Partial: fixed colour map of cell state; no activity mapping |
| Live parameter experimentation | Not implemented |
| Motion trails | Not implemented |
| Density / activity heatmap | Not implemented |
| Placing seeds, controlling simulation speed (proposal objective) | Not implemented |

## Verified facts
Environment for every browser result: headless Chromium on a software renderer (ANGLE with SwiftShader, one core). No result
below comes from a hardware GPU. "In repo" means `npm test` or a page under `tests/browser/` reproduces it; "ad hoc" means a script
outside the repo produced it.

1. **Maths matches the canonical sources** (kernel core, single-ring shell, normalisation, growth, hard-clip update, dt = 1/T,
   periodic wrap). Checked by reading Chan (2019, arXiv:1812.05433) and the upstream JS and Python. Not scripted.
2. **Seed data.** Upstream `O2u` at commit `adfc542939266de7f4bb7ebb552e8499701ee107`, byte-identical by two fetch routes. RLE
   SHA-256 `62abb2c5...`. Decodes to 20x20, 222 non-zero cells, level sum 19600 (mass 76.8627), equal to the literal upstream
   decoder's output. In repo: `tests/unit/patterns.test.js` (hash and fixture). The script that built the fixture is not in the repo.
3. **Sigma sources.** Upstream `O2u` 0.015; upstream `O2b` 0.014 (also in the older JS catalogue); older JS entry `O2(a)` 0.017;
   paper Figure 6 and 7 captions 0.016. Checked against the pinned clone and the paper.
4. **Unit tests:** 45 pass (`npm test`). Includes decoder fuzzing, placement, startup planning, and CPU behaviour (sigma 0.015
   persists and moves; sigma 0.014 evaporates).
5. **GPU against CPU reference.** In repo: `tests/browser/orbium-gpu.html`.
   - After reset the GPU state equals the seed exactly.
   - Max absolute error after 1 / 5 / 20 steps: 6.6e-7 / 1.4e-6 / 2.9e-6 (tolerance 1e-3).
   - Pointwise error through step 200: at most 1.3e-4.
   - 1000 steps: mass 0.922 to 0.931 of the seed, shape correlation at least 0.935, no WebGL errors, values stay in [0,1].
   - Motion: 614.3 cells in 1000 steps, about 0.61 cells/step (measured with unwrapped tracking).
   - Observables against the CPU: worst mass difference 0.068, worst centroid difference 0.031 cells.
   - Grid 128 and grid 64 agree exactly (difference 0.0) after 30 steps.
6. **Normal startup path** (ad hoc, real `npm start` and `index.html`). The default URL shows Orbium with no note. The running
   app's GPU state matched a CPU reference started from the seed (example run: 1.25e-6 after 6 steps at grid 256; 8.6e-5 after
   153 steps at grid 64; the step count at the check varies per run). A 500-step run through the app's own loop kept mass at
   0.90 to 0.97 of the seed with shape correlation at least 0.93 and about 0.61 cells/step. `?radius=10` shows the note and
   noise; `?radius=13` shows Orbium; the WebGL2-unavailable panel still appears; a context loss and restore re-seeds with Orbium.
7. **Frame loop.** Without a fence, a 10 s run at grid 256 queued about 150 s of GPU work (ad hoc); with `FrameFence` the backlog
   drained in 1.3 s and the HUD reported the real rate.
8. **Unscaled Orbium at other radii** (ad hoc, CPU, grid 64, 100 steps, same T, mu, sigma): evaporated at R = 8, 10, 11, 12, 15,
   16, 20; persisted at R = 13 (mass 71.3) and R = 14 (mass 82.5, shape not analysed).
9. **Long-run sensitivity** (ad hoc). A 1e-7 relative perturbation of the seed grows to about 5e-4 pointwise by step 700 in
   float64. A CPU float32 emulation differs from float64 by about 1e-2 (steps 500 to 900). GPU against CPU pointwise error
   reaches 5.7e-2 (step 600) and is not monotonic. The observables above stay close.

## Unresolved or unverified
- **No hardware-GPU run.** Real frame rates, precision, the R16F fallback and the `maxTapsPerStep` cap (200M, an estimate) are
  untested. A 512 grid took about 2.5 s per step on the software renderer.
- **GPU deviates about 4x more than a CPU float32 emulation.** The cause (shader `exp()`, fused multiply-add, tap order, or the
  software renderer) was not isolated.
- **R = 14:** the unscaled pattern persists for 100 steps. Whether it is still a recognisable Orbium is unknown. The design
  treats only R = 13 as compatible.
- **Reproducibility gap.** Items 6 to 9 and the fixture build came from scripts outside the repo. The repo contains only the
  unit tests and two standalone browser pages.
- **Context restore.** In a standalone headless test the restore did not complete, and an `INVALID_OPERATION` appeared after it
  with and without `deleteSync` (cause unknown). The end-to-end app scenario passed.
- **Orbium is 20 cells wide**, so it looks small at the default 256 grid. The default was not changed.
- **Placement orientation:** Orbium appears vertically mirrored relative to upstream pictures (decision 13).
- **Version labels.** `package.json` still says 0.1.0 although the code now includes Phase 2, and the separate backup is also
  called v0.1.0. A version bump or tag is the project owner's decision.
- **Security headers.** CSP is a meta tag only. The dev server sends only `nosniff` and `no-store`. Header-level policy is Phase 6.
- **No accessibility review** beyond the canvas `aria-label` and a non-live HUD.

## Planned (not started)
1. Pause, step, reset (reset reuses `App.initialState`).
2. Runtime parameter controls and a simulation-speed control.
3. Seed library with more verified patterns, and seed placement.
4. Zoom and pan.
5. Motion trails and activity heatmap.
6. Quality pass, including a real-hardware run.
7. Deployment: production hosting, security headers.
8. Optional: resample patterns to allow `?radius=` with Orbium. The paper reports approximate scale invariance for R > 12, but
   this would need its own verification.
