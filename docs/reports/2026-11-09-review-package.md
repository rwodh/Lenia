# Review package: M1, M2 and the GPU-limited flag (above main 9424b4e)

Date: 9 Nov 2026. For an independent review. Everything below is on the local branch `feature/floating-ui`; **nothing has been
pushed**. Each statement points to a file or a report section; status labels: **Verified** (checked by a test in the repo or by
`git diff`), **Reported** (measured by a scratchpad probe or script that is not in the repo), **Inferred** (read from the code, not
tested), **Unverified** (not checked).

## 1. Commit and branch map
`main` here means `origin/main` at `9424b4e` (merge of PR #10). The local `main` ref is stale (`a2b4f45`, behind `origin/main`
by 19) and is not the base.

| Commit | Branch where it was made | Content | Report |
|---|---|---|---|
| `d075135` | `fix/release-hardening` (local only) | M1: shader remainders, context-loss guards, 404 page | `2026-11-08-m1.md` |
| `804e461` | `fix/release-hardening` | `LOOP.maxFramesInFlight` 2 -> 3 (owner decision) | M1, Addendum 1 |
| `4b511e3` | `feature/floating-ui` (local only) | M2: floating full-screen interface, periodic surround | `2026-11-09-m2.md` |
| `f5c6fa8` | `feature/floating-ui` | New GPU-limited flag rule (owner decision) | M1, Addendum 2 |
| `504209b` | `feature/floating-ui` | Docs: the flag measured at 144 Hz | M1, Addendum 3 |
| (this file) | `feature/floating-ui` | Review package, docs only | - |

History is linear: `9424b4e <- d075135 <- 804e461 <- 4b511e3 <- f5c6fa8 <- 504209b`. `fix/release-hardening` points at `804e461`;
`feature/floating-ui` contains it. To review everything: `git diff 9424b4e feature/floating-ui` (39 files, +1934 / -347 before
this file).

## 2. Planned items and status
| Item | Status | Evidence |
|---|---|---|
| M1.1 Shader integer remainders keep both operands non-negative (decision 32) | Done | `shaders.test.js` remainder rule fails on the old shader; Verified |
| M1.2 Actions while the context is lost or after a failed restore (decision 33) | Done | `ui-flow` context-loss block; 6 checks failed on the code before; Verified |
| M1.3 GPU-limited flag mostly a false positive at 144 Hz | Done (via the two items below) | M1 report, sections "GPU-limited flag" and Addenda 1 to 3 |
| M1.3a In-flight cap 2 -> 3 (owner decision) | Done | Addendum 1; Reported |
| M1.3b Flag rule: step deficit **and** a fence hold-back; off after 1 s without hold-back (owner decision, decision 7) | Done | `scheduler.test.js` 8 tests, `ui-flow` 5 checks; Verified. Acceptance (flag < 10 % at grid 128, 144 Hz) met: 0 % in two runs; Reported |
| M1.4 B1: restore-keeps-view check immune to real input | Done | Reported (real-wheel injection, 2 of 2) |
| M1.5 Static 404 page (decision 34) | Done | `headers.test.js`; Verified locally, Unverified on a host |
| M2.1 Floating full-screen interface (decision 36) | Done | `ui-flow` M2 block (18 checks) and tour checks; Verified at emulated sizes |
| M2.2 Periodic surround, display only (decision 35) | Done | `gpu-parity` block 3c: main square byte-identical; Verified |
| M2.3 Text contrast >= 4.5:1 on glass | Done | Reported (computed, worst case 5.56:1) |
| M2.4 Remember open panels per viewer (optional) | Not done | Open decision (owner decision 5) |

## 3. Final check results and environments
Machine: one Windows 11 laptop. Browser: Chrome 156 in a normal window, temporary profile, background throttling off. Renderer for
every browser row: `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)` (hardware GPU via
ANGLE/D3D11, not a software renderer). Node v24.22.0. Refresh rate and power state are recorded from the 144 Hz measurement on;
earlier rows did not record them.

| Check | At | Result | Refresh / power |
|---|---|---|---|
| `npm test` | `504209b` | 131/131 | - |
| `gpu-parity.html` | `f5c6fa8` working tree | 44/44 ALL PASS; one 404, `/favicon.ico` | not recorded |
| `orbium-gpu.html` | same | 29/29 ALL PASS | not recorded |
| `ui-flow.html` | same, dev headers, one run | 188/188 ALL PASS | not recorded |
| `ui-flow.html` with the old flag rule (HEAD `app.js` of `4b511e3`) | scratch copy | 186 pass, **2 fail**: exactly the two new hold-back checks (expected) | not recorded |
| M2 suite (`gpu-parity` 44, `orbium-gpu` 29, `ui-flow` 183 x3, prod and dev headers) | `4b511e3` | all pass | not recorded |
| M1 suite (`gpu-parity` 40, `orbium-gpu` 29, `ui-flow` 161 x3) | `804e461` | all pass | not recorded |

Live flag rows, new rule (Reported, scratchpad probe, 15 s after 3 s warm-up; M1 Addenda 2 and 3, `progress.md` fact 27):

| Refresh | Power | Row | Flag on | Held back | Steps/s achieved / requested |
|---|---|---|---|---|---|
| 144 Hz | mains | grid 128, 1x (two runs) | 0 %, 0 % | 2.0 %, 0.6 % | 60 / 60 |
| 144 Hz | mains | grid 256, 1x | 0 % | 0.3 % | 60 / 60 |
| 144 Hz | mains | grid 512, 2x | 100 % | 34 % | 60.3 / 120 |
| 60 Hz | battery | grid 128, 1x | 0 % | 0.1 % | 60 / 60 |
| 60 Hz | not recorded | grid 512, 2x, back-off on / forced off | 91 % / 100 % | 2 % / 62 % | 63.0 / 83.3 of 120 |

## 4. Protected-file verification (`git diff 9424b4e HEAD`)
Unchanged (Verified, `git diff --quiet` per path): `src/shaders/lenia-step.frag.js`, `src/simulation/kernel.js`, `lenia.js`,
`reference.js`, `rle.js`, `patterns.js`, `seed.js`, `params.js`, `observables.js`, `src/shaders/overlay-accumulate.frag.js`,
`stamp.frag.js`, `src/gl/fence.js` (`FrameFence`), `targets.js`, `readback.js`, `tests/fixtures/`, `tests/unit/patterns.test.js`
(Orbium RLE hash), `tests/browser/orbium-gpu.js`, `THIRD_PARTY_NOTICES.md`, `CLAUDE.md`. `LIMITS` in `src/config.js`: no changed
line. Changed with approval: `src/gl/context.js` (4 lines, the probe's error drain, M1) and `src/shaders/display.frag.js`
(display only: remainders, M1; surround, M2). `src/ui/tour.js` changed only to open and close panels; its steps, gates and
experiment are unchanged (Verified by the tour checks).

## 5. Claims
| Claim | Status |
|---|---|
| Simulation maths, Orbium data and fixtures are untouched | Verified (`git diff`; RLE hash test) |
| The main square is drawn byte-identically with the surround on; default view byte-identical after M1 | Verified (`gpu-parity`) |
| Context-loss actions behave as decision 33 | Verified (`ui-flow` fault injection) |
| A context lost during the first start leaves usable controls after a restore | Inferred (`main.js`; no repo test) |
| The new flag rule ignores presentation-latency hold-backs and does not latch on the back-off's own deficit | Verified (synthetic traces, `scheduler.test.js`; fence-driven `ui-flow` checks) |
| Flag 0 % at grid 128 at 144 Hz on this machine | Reported |
| Grid 512 at 2x is real overload on this machine | Reported (62 % held back with the back-off off) |
| Every control reachable by mouse and keyboard; Esc and focus return; no panel covers the transport bar | Verified (emulated sizes) |
| Text contrast >= 4.5:1 on glass | Reported (computed) |
| Display-pass cost 0.4 to 1.0 ms per frame | Reported (timer query) |
| Undefined behaviour of the old `%` expression on other GPUs | Unverified |
| 404 page on a real host | Unverified |

## 6. Open decisions (owner)
1. **Back-off cost at overload.** While flagged, the loop takes 1 step per frame. At grid 512, 2x, 60 Hz this gives 63 steps/s
   where the GPU managed 83 with the back-off off (`progress.md` fact 27). Allow more than 1 step, or keep it.
2. **Solid panels on GPU-limited devices.** Default to Solid instead of Glass when the flag is on. The flag now looks trustworthy
   on this machine; blur's cost on a slow GPU is unmeasured.
3. **Remembering open panels per viewer** (optional in the M2 brief; not done).

## 7. Known unverified areas
Live host (not deployed; `_headers` checked locally only); real touch devices (synthetic pointer events and an emulated 390 x 844
viewport only); Firefox and Safari (Chromium only); screen readers (none used); float16 (R16F) state, exercised only by forced
tests, long-run accuracy untested; the flag on other GPUs and displays, and grid 64 under the new rule.

## 8. Pointers to the key changes
- Flag rule: `src/simulation/scheduler.js:45` (`nextGpuBound`), called at `src/app.js:535`; constants `src/config.js:44`;
  in-flight cap `src/config.js:38`; tests `tests/unit/scheduler.test.js:80` and `tests/browser/ui-flow.js:375`.
- Shader remainders: `src/shaders/display.frag.js:60` (`cell`), `:74` (`overlayCell`); surround `:91`; test
  `tests/browser/gpu-parity.js:183` (block 3c).
- GPU-ready guards: `src/app.js:78` (`gpuReady`), `:111` (`onRecovered`), `:321` (`addAt`); `src/main.js:33`;
  `src/gl/context.js:16` (error drain); test `tests/browser/ui-flow.js:155`.
- 404: `404.html`, `tools/serve.js:37`, `_headers`.
- Floating interface: `src/ui/panels.js:50` (`open`), `:93` (`onKey`); `src/ui/tooltips.js:29` (Escape);
  `src/config.js:134` (`SURROUND`), `:137` (`PANEL_STYLES`); test `tests/browser/ui-flow.js:837`.
- Decisions: `DECISIONS.md` 7 and 32 to 36. Facts: `progress.md` 25 to 27.

M2 screenshots (Chrome 156, AMD renderer, emulated sizes):
[desktop 1440x900](2026-11-09-m2/desktop-1440x900.png), [1440x900 with panels](2026-11-09-m2/desktop-1440x900-panels.png),
[desktop 1280x720](2026-11-09-m2/desktop-1280x720.png), [1280x720 tour](2026-11-09-m2/desktop-1280x720-tour.png),
[phone 390x844](2026-11-09-m2/mobile-390x844.png), [390x844 parameters](2026-11-09-m2/mobile-390x844-params.png).
