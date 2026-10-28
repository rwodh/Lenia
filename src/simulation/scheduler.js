/**
 * Pure step scheduling for the animation loop (no WebGL), so play / pause / single-step
 * semantics can be unit-tested. Called once per submitted frame.
 *
 *  - Playing: runs as many whole steps as the accumulated time allows, at most `cap`;
 *    if the cap was reached the backlog is dropped instead of spiralling.
 *  - Paused: never advances on its own and discards accumulated time, so resuming never bursts.
 *    Each queued single-step request runs exactly one step.
 *
 * Returns { steps, accumulatorMs, pendingSteps }.
 */
export function planFrameSteps({ paused, accumulatorMs, stepMs, cap, pendingSteps }) {
  if (paused) return { steps: pendingSteps, accumulatorMs: 0, pendingSteps: 0 };
  let steps = 0;
  let acc = accumulatorMs;
  while (acc >= stepMs && steps < cap) {
    steps += 1;
    acc -= stepMs;
  }
  if (steps === cap) acc = 0;
  return { steps, accumulatorMs: acc, pendingSteps: 0 };
}

/** Upper bound on queued single-step requests (key repeat must not build a backlog). */
export const MAX_PENDING_STEPS = 4;
