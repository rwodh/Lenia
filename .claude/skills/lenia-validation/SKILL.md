---
name: lenia-validation
description: Validate Lenia simulation correctness after changes to the kernel, growth function, update rule, shaders, seed patterns, parameters, or GPU/CPU parity tests. Use when asked to check that the simulation is still correct or scientifically honest.
---

# Lenia simulation validation

Source of truth for the maths and past evidence: `DECISIONS.md` (5, 9, 10, 12, 14) and `progress.md` "Verified facts".
Read the actual code (`src/simulation/kernel.js`, `reference.js`, `src/shaders/lenia-step.frag.js`) before judging it.

## Model to check against
- `U = K * A` (periodic convolution), `A' = clamp(A + (1/T) * G(U), 0, 1)`, `G(u) = 2 exp(-(u-mu)^2 / (2 sigma^2)) - 1`.
- Kernel: single ring, exponential core (alpha 4), normalised to sum 1. Periodic boundary. Hard clip, dt = 1/T.
- The CPU reference (`reference.js`) and the GPU shader must implement the same definitions.

## Checklist
1. `npm test` passes; report the count and any failure verbatim.
2. If the shader, kernel, or params changed: run `tests/browser/gpu-parity.html` and `tests/browser/orbium-gpu.html`
   (see `README.md`). Each must end in `ALL PASS`. Quote the tolerances and errors it reports.
3. Parity policy (`DECISIONS.md` 12): strict pointwise (1e-3) for the first 200 steps; beyond that compare observables
   (mass, centroid) only. Do not tighten or loosen tolerances to make a run pass without recording why.
4. Seed data: Validate every library pattern against its documented upstream
   source, parameters, and integrity evidence. Never retype or rescale patterns.
   Do not claim a pattern is verified unless its own evidence supports that claim.
5. Visualization honesty: colour maps and overlays are display-only and must not modify simulation state. Label anything
   derived (trails, heatmaps) as such.
6. Guided-tour claims must be backed by a run (`tests/unit/experiment-evidence.test.js`). An earlier draft claimed
   sigma 0.014 kills a settled Orbium; it does not.

## Reporting
- Say which environment produced each result. Browser results from headless Chromium/SwiftShader are software-renderer
  results, never hardware-GPU results.
- Separate verified (a test or measurement you ran now), carried over from `progress.md` (not re-run), and unverified.
- If you cannot run the browser pages, say so and list them as not run rather than inferring a pass.
