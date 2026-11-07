# Design note: adding a second organism to a live world (Phase 4b)

Status: **design only, not implemented**; waiting for the owner's decision (3 Nov 2026). Nothing here is Verified; every
behavioural statement below is a plan or an expectation to be tested.

## Why
Phase 4a (decision 29) only moves where the selected organism *starts*. On a periodic world that is a translation, so on its
own it has modest value: the same experiment, shifted. The payoff is this step: putting a second organism into a world that is
already running, so the user can watch two organisms meet, collide, merge or pass. That is a new kind of experiment, and it
is also the first feature that edits the live state, so it needs more care than 4a.

## Proposal (v1)
*Add* (a mode next to *Place*, armed the same way): a click on a cell adds a copy of the **selected** organism with its
centre on that cell, into the current state, at the current generation. Paused or running. Locked during the tour and for
the noise start, like the selector.

### 1. How the patch is written (and across the seam)
Two options:

| | A. CPU upload (`texSubImage2D`) | B. GPU "stamp" pass (recommended) |
|---|---|---|
| Combining with what is there | Needs the current values under the patch: an asynchronous readback, which is stale by the time it arrives unless paused; only *overwrite* works without it | A small fragment shader reads the current state and the pattern texture and writes the combination into the other ping-pong target; nothing leaves the GPU |
| Seam | The 20x20 patch splits into up to 4 rectangles: up to 4 uploads | The shader wraps the offset (`mod`), one pass, no split |
| Uploads | Up to 4 per addition | One small pattern texture per pattern (cached; at most 20x20 floats), none per addition |
| Cost | Negligible | One cheap pass (2 texel reads per cell; scissored to the patch's at most 4 rectangles if wanted) |

B keeps the "state never leaves the GPU" property and makes the combination exact against the state at that moment. It is a
new shader and a new method (e.g. `LeniaSimulation.stamp(patternTex, x, y)` or a separate `src/gl/stamp.js`); **the step shader
is not touched**. Afterwards `read` flips as after a step, but `generation` does not change (it is not a step).

### 2. Combination rule
| Rule | Effect |
|---|---|
| overwrite | Replaces the whole 20x20 box, zeros included: cuts a square hole into whatever was there |
| add, then clamp to [0, 1] | Overlaps saturate at 1; the clamp hides how much was lost |
| **max (recommended)** | Keeps every cell at the larger of the two values |

`max` keeps values in [0, 1] without clamping, never removes existing material, is idempotent (adding the same organism twice
at the same cell changes nothing), and on empty space all three rules agree: the verified pattern is copied exactly. None of
them has a physical meaning (Lenia conserves nothing), so the simplest rule that never destroys state and never needs a clamp is
preferred. The UI should say "added where the world was empty; overlapping cells keep the larger value".

### 3. Parameters: only the selected organism (honesty constraint)
mu, sigma and T are global. O2u is verified at sigma 0.015 and O2b at 0.014. Adding O2b into an O2u world would run it at
0.015, which is not its verified parameter set. v1 therefore adds copies of the **selected** organism only, whose parameters
are the world's (unless the user has moved a slider, in which case both copies run at the changed values, as the original
does). Mixing species would need its own decision and an on-screen statement that the added organism runs at the world's
parameters, not its own.

### 4. What Reset restores
Reset restores the start (the selected organism at its start cell) and the start parameters, as today. Additions are
interventions in a run, not part of its start, so Reset removes them. A context loss loses the live state anyway; the restore
re-seeds the start, so additions are lost there too (same as any evolved state today). Both are stated in the UI hint.
Alternative (not recommended for v1): record additions and replay them on Reset.

### 5. Observatory and labels
- An addition changes the state discontinuously. The readback in flight describes the state before it, so the epoch increases
  and that result is discarded (existing mechanism). The **history is kept** (same run, same generation counter) and the chart
  marks the generation of each addition with a vertical line; the text summary says "added at generation g". Alternative:
  clear the history as Reset does (simpler, loses the before/after comparison).
- With two organisms the centroid will usually be reported as "not meaningful (spread out)". That is correct behaviour of the
  existing rule (decision 25), not a bug, and the card's hint should say so.
- The status "Pattern" label shows the selected organism plus a count, e.g. "Orbium unicaudatus (O2u) + 1 added".

### 6. Tour lock
*Add* is disabled while the tour is open (its gates measure mass fading), exactly like the selector and *Place*.

## Test plan
- Unit: a pure CPU twin of the stamp (`stampMax(state, size, pattern, x, y)`): wrap at both edges and the corner, idempotence,
  exact copy on empty space, values stay in [0, 1], bad cells rejected.
- `gpu-parity.html`: the stamp shader equals the CPU twin exactly (float32) on random states, including across the corner;
  float16 within the existing 1e-2 tolerance; no GL error; bindings restored.
- `ui-flow.html`: paused add: read-back equals `stampMax(previous, ...)` exactly and the generation is unchanged; running add;
  Reset removes additions; the in-flight readback is discarded and the history kept with a marker; tour and noise locks; one
  animation loop.
- Behaviour, CPU reference (`patterns.test.js` style): two O2u copies far apart on grid 128 both persist for N steps (mass about
  twice one organism's, two separated blobs). Collisions are observed, not claimed: no test asserts what a collision does.

## Risks
- The outcome of collisions is unknown and may vary with GPU rounding (decision 23: long-run pointwise agreement is not claimed).
  The UI must not imply a predicted outcome.
- Two click modes (*Place* and *Add*) on one canvas can be confused; they need distinct buttons, cursors and the pressed state,
  and only one can be armed at a time.
- No undo: a mistaken addition is removed only by Reset.
- float16 states round the pattern's values (as the float16 seed already does).
- Cost is negligible per addition; nothing runs per frame.

## Decision needed from the owner
1. Go / no-go for v1 as above (B, `max`, selected organism only, Reset removes additions).
2. Observatory: keep the history with a marker (recommended) or clear it.
