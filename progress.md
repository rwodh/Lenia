# Progress

Sections: status by phase, proposal feature status, verified facts, unresolved or unverified items, planned work.
Architecture is in `README.md`; design decisions are in `DECISIONS.md`.

## Status by phase
| Phase | State |
|---|---|
| 1 Foundation | Done |
| 2 Core Lenia | Done: GPU Lenia step, and the verified Orbium (O2u) seed is shown at startup (the selectable library is listed under Phase 3) |
| 3 Interaction | Partial: Play/Pause, Step, Reset, speed, live mu/sigma/T, Guided Discovery tour, a two-organism library (O2u, O2b) with a selector, World View zoom and pan (display only, decision 28), start-cell placement of the selected organism (decision 29). Not done: more patterns, adding copies of the selected organism to a running world (decision 31) |
| 4 Visualization | Partial: a full-screen floating interface (decision 36), a periodic surround around the world (decision 35), two colour maps (Ocean, Viridis), Running/Paused indicator, generation, pattern, world, render rate, and the read-only Observatory card (mass, active area, centroid, mass-by-generation chart), and two display-only aids: trails and an activity map (decision 30). No speed estimate |
| 5 Quality | Partial: 123 unit tests, three browser GPU/UI pages, context-loss fault injection, input limits, error paths, labelled controls and focus handling. No screen-reader test, no accessibility audit, no frame-rate or other performance calibration |
| 6 Deployment | Partial: repository side prepared (`_headers` with the production headers, a local production-header and subpath mode, a CSP-equality unit test, a static `404.html`, `docs/DEPLOYMENT.md`); **not deployed**. The app is still static files (no build step) |
| 7 Extensions | Not started |

## Proposal feature status (`CGL_Project_Proposal.pdf`, section 4)
| Feature | Status |
|---|---|
| Real-time Lenia simulation | Implemented |
| Emergent organisms | Two verified organisms (O2u, O2b; both Orbium); random noise otherwise |
| Seed organism library | Partial: two verified organisms, O2u and O2b, selectable (decision 21); no further patterns |
| Interactive parameter controls | mu, sigma, T live; radius and grid fixed by design (decision 19); grid, radius, seed also via URL |
| Real-time GPU processing | Implemented (WebGL2 fragment shader, ping-pong textures) |
| Pause, step, reset, restart | Implemented (Reset = initial state and parameters; restart = Reset while playing) |
| Zoom and pan | Implemented (display only): wheel, drag, pinch, buttons, keys; cell readout under the pointer (decision 28) |
| Information display | Implemented: Running/Paused, generation, pattern, world and radius, render rate, float format, "GPU-limited", and Observatory measurements |
| Dynamic colour visualization | Two colour maps of cell state, plus the activity aid (decision 30) |
| Live parameter experimentation | Implemented for mu, sigma, T, plus the guided sigma experiment |
| Motion trails | Implemented (display only; decaying per-step maximum, decision 30) |
| Density / activity heatmap | Implemented as an activity map (decaying per-step sum of |change|, decision 30); no density map |
| Controlling simulation speed (proposal objective) | Implemented (0.25x to 2x) |
| Placing seeds (proposal objective) | Implemented: the selected organism starts at any cell (decision 29), and up to 8 copies can be added to a running world (decision 31) |

## Verified facts
Environment. Items 1 to 13 were recorded earlier in headless Chromium on a software renderer (ANGLE with SwiftShader, one
core); none of those results came from a hardware GPU. Items 14 onward were recorded on 31 Oct 2026 in the Claude desktop app's
built-in browser, whose WebGL context reports the renderer string `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11
vs_5_0 ps_5_0, D3D11)` (read from `caps.renderer` and from `WEBGL_debug_renderer_info`). That string is the only evidence about
the GPU: the driver, browser version and power state were not recorded, and the earlier "software renderer" wording must not be
read as applying to items 14 onward (decision 14). "In repo" means `npm test` or a page under `tests/browser/` reproduces it; "ad hoc" means a script
outside the repo produced it.

1. **Maths matches the canonical sources** (kernel core, single-ring shell, normalisation, growth, hard-clip update, dt = 1/T,
   periodic wrap). Checked by reading Chan (2019, arXiv:1812.05433) and the upstream JS and Python. Not scripted.
2. **Seed data.** Upstream `O2u` at commit `adfc542939266de7f4bb7ebb552e8499701ee107`, byte-identical by two fetch routes. RLE
   SHA-256 `62abb2c5...`. Decodes to 20x20, 222 non-zero cells, level sum 19600 (mass 76.8627), equal to the literal upstream
   decoder's output. In repo: `tests/unit/patterns.test.js` (hash and fixture). The script that built the fixture is not in the repo.
3. **Sigma sources.** Upstream `O2u` 0.015; upstream `O2b` 0.014 (also in the older JS catalogue); older JS entry `O2(a)` 0.017;
   paper Figure 6 and 7 captions 0.016. Checked against the pinned clone and the paper.
4. **Unit tests:** 60 passed when this list was first written; 74 after the library (31 Oct 2026, see item 14); 90 pass now (`npm test`, 2 Nov 2026; the 16 new ones cover the Observatory, see item 18). Includes decoder fuzzing, placement, startup planning, CPU behaviour (sigma 0.015
   persists and moves; sigma 0.014 evaporates *from the seed*), step scheduling, slider ranges, storage helpers and the tour
   experiment evidence (item 11).
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

10. **UI flow** (in repo: `tests/browser/ui-flow.html`, software renderer, grid 64). 41 checks pass: Pause freezes the generation,
    Step advances exactly 1 (and 4 after four presses), Play resumes, sliders update the live parameter and clamp, radius is
    rejected, speed and colour buttons act, Reset restores the seed on the GPU exactly (max difference 0) and the parameters,
    Space toggles, at most one pending animation frame after repeated interaction, the tour's gates (observe, change, watch)
    only unlock when the user has done the step, Enter Explorer restores the organism (mass 76.86) without a reload, a returning
    visit does not auto-open the tour, and the noise start does not offer it. Console: no page errors.
11. **The tour's claim, measured.** A settled Orbium (60 steps at sigma 0.015, then sigma changed; CPU reference, grid 64):
    sigma 0.014 and 0.013 survive (mass ratio about 0.93 to 0.96 after 150 steps); 0.012 fades to 0 by +40 steps; 0.011 is
    below 0.011 of its mass within 20 steps for settle times 60, 100, 200 and 400. On the GPU in the real app the same
    scenario ended with mass 0. A first draft of the tour used 0.014, which only kills the freshly placed seed; this was caught
    by running the scenario, not by the earlier seed-only test. In repo: `tests/unit/experiment-evidence.test.js`.
12. **Existing GPU pages after the changes** (software renderer): `gpu-parity.html` ALL PASS (colour map checks unchanged);
    `orbium-gpu.html?long=500` ALL PASS (the default 1000-step run was not repeated).
13. **Layout** (headless Chromium screenshots, 1280x760 and 390x844): no horizontal overflow; on the narrow layout the canvas,
    the controls and the tour sheet fit together after a fix found by looking at the first screenshot. Bangla text rendered
    with the sandbox's fallback font only.
14. **Library data (O2b).** Upstream `O2b` ("Orbium bicaudatus") at the same pinned commit: parameters R 13, T 10, m 0.15, s 0.014;
    RLE of 462 characters, SHA-256 `382578f5a58d05c5eae95bf6e44306e8b5eade02e20d8ca416657c389b2660e5`; decodes to 20x20 with
    207 non-zero cells, level sum 18222 (mass 71.4588). The reference `tests/fixtures/orbium-o2b-reference.json` was produced by
    running the literal upstream decoder source (`Board.rle2arr` and its helpers from `Python/LeniaND.py`) with only numpy's
    `asarray` replaced by an identity stub (numpy is not installed); our decoder agrees with it on all 400 cells. The script that
    built it is not in the repo. mu, sigma and T of both patterns lie inside `UI_RANGES` and on slider steps. In repo:
    `tests/unit/patterns.test.js`, `startup.test.js`, `ui-config.test.js`.
15. **O2b on the CPU reference** (grid 64, in repo: `patterns.test.js`). At sigma 0.014 it persists (mass 69.2 at 100 steps from
    71.46) and moves about 17 cells in 30 steps. Ad hoc: at sigma 0.012 and 0.013 it was gone by 100 steps.
16. **GPU, library patterns** (in repo: `orbium-gpu.html`, AMD renderer above, float32 state, grid 64). Both patterns: the seed reads
    back exactly (error 0); GPU against CPU after 1 / 5 / 20 steps is 6.6e-7 / 1.4e-6 / 2.5e-6 for O2u and 6.0e-7 / 1.9e-6 / 7.1e-6
    for O2b (tolerance 1e-3); 1000 steps keep values in [0,1]; mass ratio 0.922 to 0.931 (O2u) and 0.961 to 0.969 (O2b); shape
    correlation at least 0.935 and 0.934; motion 0.614 and 0.593 cells/step; observables against the CPU: worst mass difference
    0.0080 / 0.0033, worst centroid difference 0.0019 / 0.0026 cells; grid 128 and grid 64 agree exactly; no WebGL errors.
    **Pointwise GPU against CPU through step 200** is 3.57e-5 for O2u (asserted) but 1.70e-3 for O2b (1.77e-4 at step 100), above the
    1e-3 tolerance; that check is therefore not asserted for O2b (decision 23). Long-term pointwise equivalence is not claimed.
17. **UI flow with the library** (in repo: `ui-flow.html`, same renderer, 64 checks pass). Selecting O2b puts the exact O2b seed on the GPU,
    O2b's parameters, label, sliders and "(start: ...)" labels; Reset and `R` restore O2b, not Orbium; play/pause and speed are
    kept; an unknown id is rejected; 25 O2u/O2b round trips leave the same simulation, kernel texture, state textures and program
    in place, at most one pending animation frame and no GL error; the tour started from O2b selects O2u, locks the selector, runs
    through and ends on O2u; `?radius=10` locks the selector. A context loss and restore after selecting O2b re-seeds O2b with O2b's
    parameters (at the time the restored state was float16; fixed later, see fact 22). A bug was found by running this page: the first version of
    `Tour.open()` selected the pattern while the tour's own status listener was already active and threw; it was fixed by selecting
    before the tour is marked open.
18. **Observatory, unit level** (in repo: `tests/unit/observables.test.js`, `sampler.test.js`; 16 tests). Exact mass; strict 0.01
    boundary on the stored float32 value; a blob straddling the seam located at 63.5, not the centre; an empty field gives a defined
    no-mass result with no NaN; uniform, nearly uniform and evenly split fields are flagged low-concentration; equal to the earlier
    per-cell centroid on both seeds at grids 64, 128 and 256 (the duplicated helpers in `patterns.test.js` and `orbium-gpu.js` now
    use the module); seed masses 19600/255 and 18222/255, active areas 220 and 205; sampling rules and the bounded history.
19. **Asynchronous readback on the GPU** (in repo: `gpu-parity.html`, AMD renderer above). For float32 (read as
    RED/FLOAT) and a forced float16 state (read as RGBA/FLOAT), grids 64 and 128: one request in flight, the result arrives by polling,
    equals the state at submission exactly while the simulation moved 5 steps on, and is tagged with the generation at submission.
    In-page probes (not in the repo) saw the fence signalled after 1 to 2 animation frames, at most 6. The same page checks that
    the readback restores the caller's framebuffer and pixel-pack bindings, also when a call inside it throws (26 checks pass).
20. **Sampled metrics against the CPU** (in repo: `orbium-gpu.html` check E, 29 checks pass). At generations 20 and 100: worst
    |dMass| 2.91e-4 (O2b, 100), |dCentroid| 7.0e-5 cells, |dActive| 0, against tolerances 0.01 / 0.01 / 2 (decision 26).
21. **Observatory in the app** (in repo: `ui-flow.html`, 80 checks pass). A sample arrives on its own; after pausing and stepping 3
    times the sample is tagged with that generation and measures that exact state; no samples while paused; Reset and a pattern
    switch clear the history and sampling resumes; no readback is requested while the loop is GPU-limited; unavailable during a
    context loss and resumed after the restore; a simulated readback failure shows "unavailable" while the simulation keeps
    running; no horizontal overflow at 390 px; at most one pending animation frame and no GL error. The ui-flow animation-frame
    probe was corrected to subtract callbacks cancelled by `cancelAnimationFrame` (after a restore it reported 2; a per-timestamp
    count showed `App.frame` ran once per frame, i.e. one loop).
22. **A context restore keeps the state format** (in repo: `ui-flow.html` regression block, AMD renderer above, 3 Nov 2026).
    Before the fix the app started in float32 and came back in float16 after a `WEBGL_lose_context` loss and restore (the
    re-seeded state then read back with error 2.37e-4). Cause, established earlier by intervention: `initGpu()` deleted the 9
    objects of the lost context (2 programs, 2 vertex arrays, 3 textures, 2 framebuffers); each delete raised
    INVALID_OPERATION, and the format probe, which requires `getError() === NO_ERROR` for each candidate, rejected float32
    because of that leftover error. Fix: after a loss `initGpu()` drops the old objects without deleting them (they died with
    the context); the probe is unchanged, so first-start probing is unchanged. The new checks failed on the unfixed code
    (format float32 -> float16, error 2.37e-4) and pass after the fix (float32 before and after, error 0 at generation 0, the
    Observatory resumes, no GL error). An earlier standalone headless test had also seen an INVALID_OPERATION after a restore
    (cause then unknown); the same deletes are a likely source, but that test was not re-run.
23. **World View** (decision 28; in repo: `view-math.test.js` 9 tests, `gpu-parity.html` World View checks, `ui-flow.html`
    World View block; AMD renderer above). The default view draws byte-identical pixels to a frozen copy of the pre-view
    display shader (0 of 806,872 bytes differ over 4 canvas sizes and both palettes). The JS mapping predicts where the shader
    draws a lit cell in a window centred on the world corner (zoom 8), a panned view (zoom 3) and at maximum zoom (16); at zoom
    8 on the corner no pixel shows the background (seamless wrap). In the app: the wheel zooms about the cursor (the world point
    under it stays within 1e-6 cells), drag and two-pointer pinch, buttons, + / - / 0, arrow keys only with the view focused,
    the cell readout, zoom limits 1 to 16, rejected NaN / Infinity, a bounded extreme wheel delta, the state unchanged by any
    view input (paused: identical read-back), the view kept by Reset, a pattern switch and a context restore, reset by the
    tour, blocked during its modal steps, one animation loop, no GL error, no overflow at 390 px. Touch input was exercised
    with synthetic pointer events only; no real touch device was used.
24. **Placement, overlays and additions** (decisions 29 to 31; in repo: `placement.test.js`, `additions.test.js`, `gpu-parity.html`,
    `ui-flow.html`; AMD renderer above). A click places the unchanged organism exactly (GPU state equals `placePatternAt`). Trails
    and activity equal the same rules computed on the CPU from the GPU states (trails exact, activity within 1.2e-7) and the state
    with them on is identical to the state without. The stamp that adds a copy equals its CPU twin exactly in float32 and within
    4.9e-4 in float16, without advancing the generation. After an addition, samples at the same generation are told apart by their
    addition count (mass 76.86 with 0 added, 153.73 with 1, generation 0), and the first activity increase is at most 1/T per cell
    (measured 0.1000), so the insertion is not recorded as activity. On the CPU reference two copies half a world apart evolve
    exactly as two independent copies (grid 128, 30 steps). What happens when organisms meet is not claimed.
25. **Release hardening (M1, 8 Nov 2026; decisions 32 to 34; in repo: `shaders.test.js`, `headers.test.js`, `ui-flow.html`
    context-loss guard block; Chrome 156 in a normal window with background throttling off, AMD renderer above).** Integer
    remainders in the shaders keep both operands non-negative (the display shader's change keeps the default view byte-identical).
    While the context is lost or after a failed restore, *Add* is refused with a "graphics context not available" note (no
    uncaught error), an overlay switched on is kept and created by the restore, an organism switch is applied by the restore
    exactly, and Reset or `R` leave no GL error; a later successful restore hides the error panel and keeps float32 even with a
    stale GL error left on the context (probe drain). Six of these checks failed on the code before (an uncaught "shader failed
    to compile", the overlay switched off, `INVALID_OPERATION` 1282, the panel never hidden, float16 after recovery). The
    "context restore keeps the view" check now holds off real input during its wait: with a real wheel event sent in that wait it
    passed twice (it failed twice before). Unknown paths get `404.html` (locally; the host is unverified).
26. **Floating, full-screen interface and periodic surround (M2, 9 Nov 2026; decisions 35 and 36; in repo: `gpu-parity.html`
    surround checks, `view-math.test.js`, `ui-flow.html` M2 block and tour checks; Chrome 156, normal window, AMD renderer above).**
    With the surround on, every pixel of the main square is byte-identical to the pre-View shader (135,810 pixels, 4 canvas sizes,
    both palettes); a surround pixel equals the dimmed colour of the same cell one period away within 1 LSB, and the period line
    has the expected colour. Every control is reachable from its panel by mouse and keyboard, one panel opens per side, Esc closes
    the latest and returns focus to its button, no panel covers the transport bar (desktop and 390 px), tooltips are hoverable and
    dismissed by Esc, Hide-UI keeps the world running, the tour opens the Parameters panel for its parameter steps and still
    passes its gates. Text contrast on the glass panel is at least 5.56:1 even over white (muted text), computed. Cost (Reported):
    the full-viewport display pass takes 0.4 to 1.0 ms GPU time per frame (p50) at 1280 x 720 and 1440 x 900, the surround adds
    0.1 to 0.2 ms; the effect of backdrop blur on frame time was inconclusive on this machine.

## Unresolved or unverified
- **The floating interface on real devices** (decision 36): touch was exercised with synthetic pointer events and an emulated
  390 x 844 phone only; no screen reader was used (the panels have `aria-expanded`/`aria-controls`, tooltips
  `aria-describedby`, the cell readout is `aria-live="off"`). Backdrop blur's cost on a slow GPU is unmeasured; whether to
  default to Solid there waits for a trustworthy GPU-limited flag (see below).
- **The GPU-limited flag is mostly a false positive on a 144 Hz display** (Reported, scratchpad probe, 8 and 9 Nov 2026, the AMD
  renderer above, Chrome 156 normal window). At grids 64 and 128 the GPU spends about 1 ms per frame (timer query, p50; p90 1.7 to
  3.4 ms) of a 7 ms frame interval, but a frame fence signals 1 to 3 frames after submission (presentation latency, not load).
  With `LOOP.maxFramesInFlight` = 2 frames were held back 40 to 64 % of the time and the simulation ran at 52 to 62 steps/s.
  Raised to 3 on 9 Nov 2026 (owner decision): held back 12 to 33 %, 57 to 62 steps/s at grid 128, but the fences then signal a
  frame later and the **flag is still on 23 to 63 %** (50 % at grid 64), so the Observatory still rarely samples. The flag counts
  any single held-back frame; a rule that needs several held-back frames in a row (app.js only) is proposed and waits for the
  owner. At grid 256 the flag is on throughout and the GPU's p90 frame time (8 ms) exceeds the 7 ms interval: real load.
- **Hardware evidence is limited to correctness pages on one machine.** Items 14 to 17 ran on the AMD renderer above. No frame-rate
  or performance figure was taken (the built-in browser pane delivered animation frames at roughly 5 Hz while the pages ran, so
  such numbers would not mean anything), and the `maxTapsPerStep` cap (200M, an estimate) and 2x speed remain untested. A 512 grid
  took about 2.5 s per step on the earlier software renderer.
- **The R16F (float16) fallback is exercised only by forced tests.** `gpu-parity.html` reads back a forced float16 state, and
  before the fix in fact 22 a context restore switched to float16 by accident. Its accuracy over long runs is untested.
- **Observatory cost is measured only by in-page probes, on one machine** (decisions 24 and 26). Warm, per sample at grid 512:
  `getBufferSubData` 2.2 to 8.5 ms and `computeObservables` 1.1 to 1.7 ms, both synchronous on the main thread; at grid 128 about
  1.1 ms and 0.2 ms. The first copy at grid 512 took about 45 ms (cold). At grid 512 the loop was GPU-limited throughout, so no
  samples were taken. The effect on frame rate in an ordinary browser is unmeasured (the built-in pane throttles frames).
- **Observatory values were approved by the owner on 3 Nov 2026** (decisions 25 and 26). Part of their evidence comes from scripts and
  in-page probes that are not in the repo, as listed there; history size and the poll limit are sizing choices without measurements.
- **GPU deviation is larger for O2b** (decision 23). The GPU's pointwise error against the CPU reference at step 200 is about 20
  times that of a float32-accumulating CPU variant (ad hoc: 1.7e-3 against 8.4e-5), and the cause is not isolated.
- **O2b is not covered by the tour, and its sensitivity to sigma has been probed only briefly** (item 15).
- **GPU deviates about 4x more than a CPU float32 emulation** (O2u, earlier software-renderer measurement; about 20x for O2b at step
  200 on the AMD renderer, see above). The cause (shader `exp()`, fused multiply-add, tap order, or the renderer) was not isolated.
- **R = 14:** the unscaled pattern persists for 100 steps. Whether it is still a recognisable Orbium is unknown. The design
  treats only R = 13 as compatible.
- **Reproducibility gap.** Items 6 to 9 and the fixture build came from scripts outside the repo. The repo contains only the
  unit tests and two standalone browser pages.
- **Orbium is 20 cells wide.** The default grid was changed from 256 to 128 to make it larger on screen (decision 15); the World View can now magnify it (decision 28), but the default grid was left at 128.
- **Placement orientation:** Orbium appears vertically mirrored relative to upstream pictures (decision 13).
- **Version labels.** `package.json` still says 0.1.0 although the code now includes Phase 2, and the separate backup is also
  called v0.1.0. A version bump or tag is the project owner's decision.
- **Security headers are prepared but not live.** `_headers` (decision 27) is checked locally only (`npm start -- --headers=prod`);
  what the host actually sends (for example how it combines its default `Cache-Control` with ours) is unverified until deployment.
- **Bangla text was written by the assistant and not reviewed by a native speaker.** It should be proofread. Real Bengali fonts
  (Nirmala UI, Noto Sans Bengali) were not available in the test environment, so spacing and line height are unverified on
  Windows, macOS and Android.
- **Accessibility:** labels, focus-visible styles, `inert` behind modal tour steps, `aria-pressed` and `aria-live` status text
  exist, but no screen-reader or keyboard-only walkthrough was done, and the canvas has only a text label.
- **Tour on touch devices and in browsers other than Chromium-based ones** was not tested. `ui-flow.html` has run the whole tour
  in headless Chromium (software renderer) and in the Claude desktop app's built-in browser (AMD renderer, facts 17 and 21);
  Firefox, Safari and touch input are untested. The mobile layout is checked by screenshot only.
- **Speed 2x** needs two steps per frame at 60 Hz; on a 30 Hz display or a slow GPU the loop's cap and back-pressure apply and the
  real speed is lower. Not measured on hardware.

## Planned (not started)
1. Performance pass on real hardware (frame rate, 2x speed, R16F fallback accuracy, the `maxTapsPerStep` cap); proofread the Bangla.
2. More verified patterns beyond O2u and O2b; adding a different species to a running world (needs its own decision: it would run at the world's parameters, not its own).
3. World View follow-ups: a follow camera (needs smoothing of the sparse, asynchronous Observatory samples), value inspection under the pointer (needs the readback path), an optional nearest-neighbour magnification.
4. Visual aids follow-ups: a separate colour map for activity (it now shares the state's), and a measured frame-rate effect in an ordinary browser.
5. Deployment: the owner deploys and fills in the real-browser results table in `docs/DEPLOYMENT.md`.
6. Optional: resample patterns to allow `?radius=` with Orbium. The paper reports approximate scale invariance for R > 12, but
   this would need its own verification.
