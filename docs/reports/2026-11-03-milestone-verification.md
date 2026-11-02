# Milestone verification report: Life Library and Observatory

Date: 3 Nov 2026. Repository: `rwodh/Lenia`. Prepared from the repository's own documentation (`DECISIONS.md`, `progress.md`,
`README.md`, `THIRD_PARTY_NOTICES.md`), the test pages and their recorded output, and Git. Nothing in this report was
re-measured while writing it.

**Report version.** This report documents the repository state at commit `603d8de` (branch `feature/observatory`) and the
GitHub `main` state read on 3 Nov 2026. It was written after that commit and does not itself change, test or validate
`603d8de`; if the report is committed later, that commit adds only this file.

## Status legend

| Label | Meaning in this report |
|---|---|
| **Verified** | Reproduced by a test or browser page that is in the repository, with the result stated. |
| **Reported** | Measured once by an in-page probe or a scratch script that is **not** in the repository, or observed by hand. Not reproducible from the repository alone. |
| **Unverified** | Not measured or not tested. |
| **Deferred** | Out of scope for these milestones, or waiting for an owner decision. |

## 1. Summary

| Milestone | Work | Commit(s) | Status |
|---|---|---|---|
| Project instructions | `CLAUDE.md`, Skills `lenia-validation` and `security-deployment-review` | `6b34ff9` | Merged into GitHub `main` (via PR #2) |
| Life Library | O2u and O2b organisms, selector, tests, provenance, docs | `bb448ce`, `db900c5` | Merged into GitHub `main` via PR #2 (merge commit `6949756`, 2 Nov 2026) |
| Observatory | Read-only measurements with asynchronous readback, chart, tests, docs | `603d8de` | **Local only** on `feature/observatory`. Not pushed, no PR, not merged, not deployed |

Final test counts: Life Library 74 unit, gpu-parity 15, orbium-gpu 25, ui-flow 64 (all pass). Observatory 90 unit,
gpu-parity 26, orbium-gpu 29, ui-flow 80 (all pass). Details and scope in sections 4 to 6.

## 2. Git, branch, push and merge status

Read with local Git and a read-only `git ls-remote origin` on 3 Nov 2026 (no fetch).

| Item | State |
|---|---|
| Current branch | `feature/observatory`, working tree clean before this report was written |
| `feature/observatory` | `603d8de` (3 Nov 2026 04:06 +0600), parent `6949756`. No upstream configured; not on the remote |
| GitHub `main` (`ls-remote`) | `6949756` "Merge pull request #2 from rwodh/feature/life-library" |
| Commits in GitHub `main` | `6b34ff9`, `bb448ce`, `db900c5` (checked with `git merge-base --is-ancestor`) |
| `603d8de` in GitHub `main` | No |
| Remote branches | Only `main`. The remote `feature/life-library` branch no longer exists (deleted after the merge) |
| Pull requests | `refs/pull/1/head` = `3528f0a`, `refs/pull/2/head` = `db900c5`. No PR for the Observatory |
| Local `main` | `0c80dcc`, **4 commits behind** GitHub `main`; not updated |
| Local `feature/life-library` | `db900c5`, still tracking the deleted remote branch |
| Deployment | None. Phase 6 (deployment) has not started |

PR #2 was opened by the owner from the pushed branch (the `gh` CLI is not installed in this environment). Its merge was
done on GitHub, outside this working session; the merge commit is visible as GitHub `main`.

## 3. Test environment and renderer

| Item | Value |
|---|---|
| Machine | The owner's Windows 11 machine |
| Node | v24.22.0 (`npm test` = `node --test`) |
| Server for browser pages | `node tools/serve.js` (`npm start`), `http://localhost:8080/` |
| Browser | The built-in browser pane of the Claude desktop app. Browser name and version were not recorded |
| Renderer string (WebGL `UNMASKED_RENDERER_WEBGL`, also printed by the pages) | `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| State format in the recorded runs | float32 (float16 only after a forced context loss and restore, see section 8) |

The renderer string names an AMD GPU behind ANGLE/Direct3D 11. That string is the only evidence about the GPU; the driver
version, power state and browser version were not recorded, and no claim beyond the string is made (`DECISIONS.md` 14).
Results recorded before 31 Oct 2026 (`progress.md` facts 1 to 13) came from headless Chromium on a software renderer
(ANGLE with SwiftShader) in an earlier environment.

Frame delivery in the built-in pane was irregular: animation frames were throttled when the pane was hidden, as low as
about 5 Hz while pages ran, and about 53 Hz in one 2.5 s probe. Pages that depend on animation frames (`ui-flow.html`)
took several minutes and needed the pane kept active. Timing-sensitive checks were written to wait for conditions rather
than fixed delays for this reason.

## 4. Life Library milestone (handoff 1)

### 4.1 Changes implemented

- Static, frozen pattern registry: `ORBIUM_O2B`, `PATTERN_LIBRARY`, `getPattern()` in `src/simulation/patterns.js`. The
  existing `ORBIUM_O2U` export is unchanged apart from an added `description`.
- O2b copied programmatically from upstream `Chakazul/Lenia`, commit `adfc542939266de7f4bb7ebb552e8499701ee107`,
  `Python/animals.json`, entry `O2b` (R 13, T 10, m 0.15, s 0.014). RLE SHA-256
  `382578f5a58d05c5eae95bf6e44306e8b5eade02e20d8ca416657c389b2660e5`.
- `planPattern()` in `src/simulation/startup.js` (pure) and `App.selectPattern(id)` in `src/app.js`: swaps base parameters,
  initial state and label, then resets through the existing Reset path. Reset and `R` restore the selected organism;
  play/pause and speed are kept. Refused when the world radius is not 13 (noise start).
- Organism card with selector, description and facts; slider "(start: ...)" labels follow the selected organism. The
  selector is locked during the guided tour and for the noise start.
- Guided tour selects O2u when it opens and when it closes (`EXPERIMENT.patternId`).
- Tests, fixture `tests/fixtures/orbium-o2b-reference.json`, `THIRD_PARTY_NOTICES.md`, `README.md`, `progress.md`,
  `DECISIONS.md` 21 to 23 and the clarifications to `DECISIONS.md` 12 and 14.
- Owner-approved test change: O2b's 200-step pointwise GPU-vs-CPU assertion was removed (not loosened); pointwise checks at
  1, 5 and 20 steps and all long-run behavioural checks were kept (`DECISIONS.md` 23).

### 4.2 Tests and results

Baseline before the work (31 Oct 2026, same renderer; checkout at `6b34ff9`): unit 60, gpu-parity 15, ui-flow 41,
orbium-gpu 13, all pass. This is a comparison of application code, not of whole repository trees: `git diff 0c80dcc 6b34ff9`
lists only `CLAUDE.md` and the two files under `.claude/skills/`, so the application code, tests and documentation that
the suites exercise are the same as at `0c80dcc`, while the trees themselves differ by those three files.

Final (1 Nov 2026, on the code committed as `bb448ce`; `db900c5` afterwards changed only `CLAUDE.md` and `DECISIONS.md`):
`npm test` 74/74; `git diff --check` clean; gpu-parity 15 PASS; orbium-gpu 25 PASS; ui-flow 64 PASS.

| Result | Status |
|---|---|
| O2b RLE hash, 20x20 decode, 207 non-zero cells, mass 71.4588, equal on all 400 cells to a decode by upstream's own decoder source | Verified (`patterns.test.js`) |
| O2u and O2b parameters inside `LIMITS` and `UI_RANGES`, on slider steps, R = 13 | Verified (unit tests) |
| O2b persists at its own sigma 0.014 on the CPU reference: the test asserts mass between 60 and 80 at 100 steps and 10 to 30 cells of motion in 30 steps | Verified (`patterns.test.js`); the exact values 69.2 and 16.85 cells are Reported (scratch script) |
| GPU vs CPU after 1 / 5 / 20 steps: O2u 6.6e-7 / 1.4e-6 / 2.5e-6, O2b 6.0e-7 / 1.9e-6 / 7.1e-6 (tolerance 1e-3) | Verified (`orbium-gpu.html`) |
| O2u pointwise through step 200: 3.57e-5 (asserted) | Verified (`orbium-gpu.html`) |
| O2b pointwise through step 200: 1.70e-3 (1.77e-4 at step 100): above 1e-3, reported by the page, **not asserted** | Verified as a measurement; the assertion was removed by owner decision |
| 1000-step behaviour: mass ratio 0.922 to 0.931 (O2u), 0.961 to 0.969 (O2b); shape correlation at least 0.935 / 0.934; motion 0.614 / 0.593 cells per step; observables worst mass difference 0.0080 / 0.0033, centroid 0.0019 / 0.0026 cells | Verified (`orbium-gpu.html`) |
| Selection, Reset with the selected organism, 25 switches with no object recreated, tour from O2b ends on O2u, locked selector | Verified (`ui-flow.html`) |
| CPU float32-accumulation comparison used to discuss O2b's sensitivity | Reported (scratch script) |

Defects found and fixed during the milestone: `Tour.open()` threw when it selected the pattern while its own status
listener was active (found by `ui-flow.html`); one new check assumed a fixed 600 ms delay and was changed to wait for the
condition.

The owner prepared a manual-testing session; its results were not reported back, so no manual-test outcome is claimed.

## 5. Observatory milestone (handoff 2)

### 5.1 Changes implemented

- `src/simulation/observables.js` (pure): mass, active area, per-axis circular centroid with concentration R and a
  validity rule; `wrapDelta`, `torusDistance`. Used by the app and the tests; the duplicated helpers in
  `tests/unit/patterns.test.js` and `tests/browser/orbium-gpu.js` now use it (all assertions kept).
- `src/gl/readback.js`: `AsyncReadback`, `readPixels` into a PIXEL_PACK_BUFFER plus a fence. Frames only poll the fence;
  the finished data is copied out with `getBufferSubData` (synchronous CPU work). One request in flight. Each request is
  tagged with the generation and epoch at submission. READ_FRAMEBUFFER and PIXEL_PACK_BUFFER bindings are restored in
  `finally`, also when a call throws.
- `src/simulation/sampler.js`: sampling rule (rate limit, skip while GPU-limited, only on generation change) and a
  bounded history.
- `src/app.js`: polling every frame, submission after the draw and before the frame fence, epoch and history cleared on
  Reset, pattern switch and context loss; "unavailable" on failure while the simulation keeps running.
- `src/ui/observatory.js`, `index.html`, `styles.css`, `src/main.js`: Observatory card and canvas chart (vertical axis from
  0, visible text summary used as the canvas label). `src/simulation/lenia.js`: a read-only `stateFramebuffer` getter only.
- `DECISIONS.md` 24 to 26, `progress.md` facts 18 to 21 and updated unresolved items, `README.md`.
- Values approved by the owner on 3 Nov 2026, after the final browser runs (see the order in section 5.2): active threshold 0.01, minimum mass 1e-3, minimum concentration 0.5,
  interval 250 ms (500 ms at grid 512), history 240, readback failure after 600 unsignalled polls, sampled-metric
  tolerances |dMass| <= 0.01, |dCentroid| <= 0.01 cells, |dActive| <= 2.

Unchanged: simulation equations, kernel, step shader, Life Library behaviour, guided tour, CSP, dependencies.

### 5.2 Tests and results

Baseline (2 Nov 2026, on the checked-out `db900c5`, whose whole repository tree is identical to GitHub `main` `6949756`:
`git diff db900c5 6949756` is empty): unit 74, gpu-parity 15, orbium-gpu 25, ui-flow 64, all pass.

Final, in this order on 3 Nov 2026:
1. The three browser pages were run after the review corrections: `gpu-parity.html` after the binding-restoration change
   (before the wording edits, which it does not exercise), `orbium-gpu.html` and `ui-flow.html` after both. Their results
   are below.
2. The owner then approved the Observatory values (section 5.1). The values themselves were not changed by the approval.
3. A last edit recorded that approval; it changed only comments (`src/config.js`, `tests/browser/orbium-gpu.js`) and
   documentation (`DECISIONS.md`, `progress.md`). The browser pages were **not** re-run after it; `npm test` (90/90) and
   `git diff --check` were.
4. The result was committed as `603d8de`.

| Suite | Result |
|---|---|
| `npm test` | 90/90 pass (16 new: 10 in `observables.test.js`, 6 in `sampler.test.js`) |
| `git diff --check` | clean (new files checked separately, clean) |
| `gpu-parity.html` | 26 PASS (11 new: 9 readback checks, 2 binding-preservation checks) |
| `orbium-gpu.html` | 29 PASS (4 new: check E, two generations for each pattern) |
| `ui-flow.html` | 80 PASS (16 new Observatory checks) |

| Result | Status |
|---|---|
| Readback copy equals the state at submission exactly (float32 read as RED/FLOAT, forced float16 read as RGBA/FLOAT, grids 64 and 128); tag = generation at submission while the simulation moved 5 steps on | Verified (`gpu-parity.html`) |
| Bindings restored after `request()` and `poll()`, and when `readPixels` is forced to throw; `readState()` still works; no GL error | Verified (`gpu-parity.html`) |
| Sampled metrics vs CPU reference at generations 20 and 100, worst absolute differences: mass 2.91e-4 (O2b, generation 100), centroid 7.0e-5 cells, active area 0 | Verified (`orbium-gpu.html` check E) |
| Paused and stepped 3 times: sample tagged with that generation and equal to that exact state | Verified (`ui-flow.html`) |
| No samples while paused; Reset and switch clear history and sampling resumes; no request while GPU-limited; unavailable during context loss and resumed after restore; simulated readback failure shows "unavailable" while running; no horizontal overflow at 390 px; at most one pending animation frame; no GL error | Verified (`ui-flow.html`) |
| Unit: exact mass, strict 0.01 boundary, seam blob at 63.5, empty field without NaN, low-concentration cases, consistency with the earlier per-cell centroid, seed masses and active areas, sampling rules, bounded history, bytes-per-second bound | Verified (unit tests) |
| Evolved-state counts near 0.01, R values of organisms and noise, float16 rounding effect on metrics | Reported (scratch script, `DECISIONS.md` 25) |

Defects and corrections during the milestone: the card trailed the App's latest sample by up to one status tick (the App
now emits when a sample lands); the `ui-flow.html` animation-frame probe did not subtract callbacks cancelled by
`cancelAnimationFrame` and reported 2 after a context restore, while an independent per-timestamp count showed one loop
(the probe was corrected, no check loosened); a review pass added binding restoration and corrected wording that implied a
fixed sampling rate.

## 6. What each test suite covers

| Suite | How to run | Covers | Counts (pre-library / Life Library / Observatory) |
|---|---|---|---|
| Unit tests | `npm test` | Pure modules in Node: kernel and growth, parameters and URL parsing, RLE decoder, seeds and placement, patterns and provenance (both organisms), startup and `planPattern`, scheduler, UI configuration and tour experiment evidence, shader source, observables, sampler | 60 / 74 / 90 |
| `gpu-parity.html` | `/tests/browser/gpu-parity.html` | GPU step shader vs CPU reference on random seeds, colour-map endpoints and letterbox, shader-error reporting; (Observatory) asynchronous readback exactness, tagging, formats, binding preservation | 15 / 15 / 26 |
| `orbium-gpu.html` | `/tests/browser/orbium-gpu.html` | For each library organism: exact seed upload, GPU vs CPU at 1/5/20 steps, 1000-step behaviour (values in range, mass, shape, motion, observables, pointwise through 200 steps for O2u only), grid-size independence, no WebGL errors; (Observatory) check E, sampled metrics vs CPU | 13 / 25 / 29 |
| `ui-flow.html` | `/tests/browser/ui-flow.html` | The real page in an iframe: transport controls, parameters, speed, colour, Reset, keyboard, single animation loop, the whole guided tour and first-visit memory; (Life Library) selection, switching, context restore, tour from O2b, locked selector; (Observatory) sampling lifecycle, tags, back-off, failure, narrow layout | 41 / 64 / 80 |

Each browser page ends with `ALL PASS` when every check passes. They are run by hand; they are not automated.

## 7. Performance measurements and their scope

All figures below are **Reported**: in-page probes in the built-in browser pane on the renderer in section 3 (3 Nov 2026),
or a Node script. None of the probes is in the repository. Ordinary-browser performance is **not** characterized.

| Measurement | Result |
|---|---|
| `getBufferSubData` per sample, warm (median; max) | grid 64: 1.0 ms (3.2); 128: 1.1 ms (1.4); 256: 3.2 ms (6.9); 512: 3.6 ms (6.7) with the GPU idle; 512 with the GPU loaded: 2.2 to 8.5 ms |
| `computeObservables` per sample, warm (median; max) | 64: 0.1 ms; 128: 0.2 ms; 256: 0.4 ms (1.1); 512: 1.3 ms (6.3); 512 with the GPU loaded: 1.1 to 1.7 ms |
| First sample at grid 512 after page load (cold) | `getBufferSubData` about 45 ms; metric computation recorded as 67.7 ms over two cold samples; that frame's JavaScript time 106.6 ms (14.2 ms maximum with sampling off) |
| Fence polling | about 0.3 ms per poll while pending (two polls timed, including probe overhead); fence signalled after 1 to 2 frames, at most 6 observed |
| Grid 512 under load | the loop was GPU-limited in 200 of 200 checks over 20 s, so no samples were taken |
| Node 24, grid 512 | about 5.1 ms per metric computation (scratch script) |

Scope limits:
- One machine, one renderer, one browser pane with irregular frame delivery. The cold-start cost recurs after every context
  restore (a new readback is created).
- **Unverified:** frame rate and frame-time effect in an ordinary browser, other GPUs and drivers, memory use, the
  simulation step cost on hardware, 2x speed on hardware, the `maxTapsPerStep` cap.
- Life Library: no timing was measured. That switching recreates no GPU objects is Verified by object identity, not by
  timing.

## 8. Known limitations and unresolved issues

| Issue | Status |
|---|---|
| After a context loss and restore the state format becomes float16 (starts as float32). **Observed and reproduced during the investigation** (3 Nov 2026, in-page probes): the 9 deletes that `initGpu()` makes on objects of the lost context each raised INVALID_OPERATION, and the float32-to-float16 transition followed; when each error was consumed right after its delete, float32 was kept. **Not reproducible from committed tests:** the diagnostic procedure is not in the repository, and `ui-flow.html` only logs the format after a restore (it cannot see the error, which the format probe drains), so neither the cause nor a fix is regression-tested. **Fix:** outside the Observatory implementation | Reported (cause established by intervention, not regression-tested); fix **Deferred** (owner decision) |
| Effect of float16 on Observatory metrics: mass about 1e-5 relative, centroid about 1e-4 cells (state rounding only) | Reported; float16 dynamics Unverified |
| At grid 512 on this machine the Observatory takes no samples (GPU-limited throughout); the card says so | Reported |
| O2b GPU error is larger than O2u's; cause not isolated | Unverified cause |
| O2b is not covered by the guided tour; its sigma sensitivity probed only briefly | Deferred / Unverified |
| Fixture-generation scripts (O2u and O2b references) and several earlier ad hoc measurements are not in the repository | Reproducibility gap |
| Bangla text not proofread by a native speaker; no screen-reader or accessibility audit; touch devices untested | Unverified |
| Security headers are a CSP meta tag only; no production hosting | Deferred (Phase 6) |
| `package.json` version still 0.1.0 | Owner decision |

## 9. Documentation inconsistencies found (not resolved in this report)

1. `.claude/skills/lenia-validation/SKILL.md` still states the parity policy as "strict pointwise (1e-3) for the first 200
   steps" for every pattern; `DECISIONS.md` 12 and 23 limit O2b's pointwise horizon to 20 steps and add the float16 1e-2
   tolerance.
2. `progress.md`, Phase 2 row, says "(one organism only)", while the Phase 3 row and the code have two organisms.
3. `progress.md`, "Unresolved", keeps an older "Context restore" item ("cause unknown") next to the newer float16 item that
   records the established cause.
4. `progress.md` says the tour was not tested in "real browsers other than headless Chromium"; it has since been exercised
   by `ui-flow.html` in the built-in browser pane (touch devices remain untested).
5. The comment in `src/app.js` `initGpu()` calls the deletes of lost-context objects "harmless no-ops"; they raise
   INVALID_OPERATION (see section 8).
6. Local `main` (`0c80dcc`) is behind GitHub `main` (`6949756`), and local `feature/life-library` tracks a remote branch
   that no longer exists.
7. One colour map is named "Observatory", the same as the new card; the README notes they are unrelated.

## 10. Deferred and roadmap items (not done)

- Push `feature/observatory`, open a PR, review and merge (owner actions); then update local `main`.
- Fix for float16 after context restore, with an assertion that the format survives a restore.
- Performance characterization in an ordinary browser.
- From `progress.md` "Planned (not started)": performance pass on hardware, more verified patterns and seed placement, zoom
  and pan, motion trails and activity heatmap, deployment and security headers, optional pattern resampling.
- Speed estimation from the centroid (excluded from the Observatory MVP).

## 11. Sources

`DECISIONS.md` (12, 14, 21 to 26), `progress.md` (verified facts 14 to 21, Unresolved, Planned), `README.md`,
`THIRD_PARTY_NOTICES.md`, `tests/unit/*.test.js`, `tests/browser/{gpu-parity,orbium-gpu,ui-flow}.js`, and Git history
(`6b34ff9`, `bb448ce`, `db900c5`, `6949756`, `603d8de`).
