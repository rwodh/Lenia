# Integration report: Phases 1-5 into main (PRs #4 to #10)

Date: 8 Nov 2026. The repository copy of the integration report published for the owner on 8 Nov 2026 (owner decision 9 of
the M1/M2 plan). Labels: **Verified** (a test or page in the repo reproduces it), **Reported** (one-off probe or a reading of
documentation), **Inferred** (from reading the code), **Unverified**.

## Result
Phases 1 to 5 (with 4b) went into `main` as six stacked pull requests, `#4` to `#9`, each reviewed and re-tested on its own
commit and merged by the owner as a true merge commit; a doc-only follow-up, `#10`, fixed five stale lines found in the reviews.
`main` after `#10` is `9424b4e`; its tree equals the reviewed commit `59724bf`. Nothing is deployed.

Every browser result here is on `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)`, a hardware
GPU behind ANGLE, in Chrome 156 in a normal window with background throttling off, unless stated. Nothing is claimed for other
GPUs or browsers.

## Pull requests
Each review used a `git archive` export of the PR's commit outside the repository, served with production headers under
`/Lenia/` and with dev headers. Every merge commit has the previous `main` and the PR commit as parents, and every merged tree
equals the reviewed commit's tree (Verified through the GitHub API).

| PR | Branch -> commit | Merged (UTC) | Merge | Unit | gpu-parity | orbium-gpu | ui-flow (runs) |
|---|---|---|---|---|---|---|---|
| #4 | `fix/restore-and-docs` -> 74da2a7 | 7 Nov 23:26 | 7c796d7 | 90/90 | 26/26 | 29/29 | 82/83 x2 (a) |
| #5 | `feature/deploy-slice` -> edcd8cb | 7 Nov 23:38 | c880edb | 98/98 | 26/26 | 29/29 | 83/83 x3 |
| #6 | `feature/world-view` -> f8f62f4 | 7 Nov 23:49 | 495adc2 | 107/107 | 32/32 | 29/29 | 106/106 x3 |
| #7 | `feature/placement` -> 44a241e | 7 Nov 23:56 | 8bfd0a2 | 113/113 | 32/32 | 29/29 | 122/122 x3 |
| #8 | `feature/visual-modes` -> ec3e48e | 8 Nov 00:04 | 924ce14 | 114/114 | 36/36 | 29/29 | 136/136 x3 |
| #9 | `feature/second-organism` -> 480de19 (6 commits) | 8 Nov 00:14 | 530be2f | 120/120 | 40/40 | 29/29 | 154/154 x3 |
| #10 | `docs/fix-stale-lines` -> 59724bf | 8 Nov 06:57 | 9424b4e | 120/120 | - | - | - (comments and docs only) |

(a) The one failure also fails on the old `main`: the test held the "GPU is behind" state too weakly for a GPU that keeps up.
PR #5 rewrote that check, and every later run passed it (Verified).

## What the phases built
| Phase | Commit | What |
|---|---|---|
| 1 | 74da2a7 | Context restore kept float16: dead objects were deleted, leaving errors for the format probe. Now dropped. "Ocean" label |
| 2 | edcd8cb | `_headers` (production CSP with `frame-ancestors 'self'`, nosniff, referrer, permissions, `no-cache`), local production mode, CSP-equality test |
| 3 | f8f62f4 | World View zoom and pan, display only; default view byte-identical |
| 4a | 44a241e | Choose the start cell of the selected organism |
| 5 | ec3e48e | Trails and activity overlays, display only |
| 4b | 46a5645 | Add copies of the selected organism to a running world (GPU `max` stamp, cap 8, the owner's three conditions) |
| hygiene, docs | f6c58f3, b31b318, 584dc2e, 487593f, 480de19, 59724bf | `.gitignore`, deployment notes, doc corrections |

## Key results
| Claim | Status |
|---|---|
| The restore fix works: the regression check fails on the old code (float32 -> float16, error 2.37e-4) and passes after | Verified |
| Default view byte-identical to the pre-View shader (0 of 806,872 bytes differ) | Verified |
| View, placement and overlays never change the simulation state | Verified |
| Overlays equal the CPU rules (trails exact, activity within 1.19e-7); the stamp equals its CPU twin (float32 exact, float16 within 4.86e-4) | Verified |
| 4b conditions: samples told apart by addition count; insertion not counted as activity (0.1000 = 1/T); cap 8 | Verified |
| Production headers delivered as defined; a cross-origin frame of the app is blocked by `frame-ancestors` | Verified (curl), Reported (browser) |
| Overlay cost 1.07 to 1.84 % of a step at grid 128, 0.57 to 0.90 % at 512, over several runs | Reported |

## Investigations
- **Real input can fail one ui-flow check (B1).** "A context restore keeps the view" waited during the restore; one real wheel
  event in that wait reproduced the failure twice out of twice (Reported). Fixed in M1.
- **The ANGLE "READ-usage buffer" warning comes from the Observatory readback.** It stops when readback is off and follows each
  new readback request, also after a completed read (Reported).
- **Deployment notes** were wrong about CSP coverage and assumed host behaviour; corrected in `480de19` (Verified locally).
- **Context-loss edge cases** (fault injection): a failed restore left the error panel up after recovery; Reset after a failed
  restore left `INVALID_OPERATION`, and the next restore could pick float16; switching an overlay on or adding during a loss gave
  a misleading "shader failed to compile" (uncaught for Add). Fixed in M1 (decision 33).
- **Undefined `%` in the display shader** for index -1 (works on ANGLE/D3D11). Fixed in M1 (decision 32).

## Incidents
- An unplanned commit `09416c1` (added `desktop.ini`, not made by the assistant) was removed with approval before any push.
- One commit message was reworded with approval before any push (`584dc2e`).
- The assistant never merged a PR; the owner merged all of them.

## Open after integration (as of 8 Nov 2026, before M1)
Deployment (host choice, live checklist), browsers other than Chromium, real touch, screen readers, float16-only GPUs, versioning,
the O2b deviation; the M1 items above are now done (see `2026-11-08-m1.md`).
