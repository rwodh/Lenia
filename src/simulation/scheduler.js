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

/** Initial state for nextGpuBound (also after start or a long gap). */
export const GPU_BOUND_START = Object.freeze({ gpuBound: false, achieved: 0, requested: 0, warmMs: 0, lastHeldAt: -Infinity, lastNow: null });

/**
 * The "GPU-limited" flag (decision 7), updated once per animation frame; pure, so it can be unit-tested. It says that the
 * simulation is running clearly slower than requested **because the GPU is behind**, with hysteresis:
 *
 *  - ON when the simulation achieved fewer than `onRatio` of the requested steps over the last ~`windowMs` (time-weighted sums
 *    with time constant `windowMs`), the window has seen at least `windowMs` of play, and the frame fence held a frame back
 *    within the last `windowMs`. Single held-back frames are normal (a fence signals one to a few frames after submission even
 *    when the GPU is nearly idle), and a slow display or a throttled tab can cause a deficit without any hold-back; neither
 *    alone turns the flag on.
 *  - OFF when the fence has held nothing back for `recoveryMs`, whatever the step rate: while the flag is on the loop takes one
 *    step per frame, which itself can cause a deficit (a 60 Hz display at 2x), so a deficit-based OFF could latch.
 *
 * frame: { now (ms), playMs (time credited to the simulation this frame; 0 while paused), steps (steps run this frame),
 * stepsPerSecond, held (the fence held this frame back) }. Returns the next state (see GPU_BOUND_START).
 */
export function nextGpuBound(state, { now, playMs, steps, stepsPerSecond, held }, { windowMs, onRatio, recoveryMs }) {
  if (!Number.isFinite(now)) return state;
  const elapsed = state.lastNow === null ? 0 : now - state.lastNow;
  // a gap longer than the window (hidden tab, breakpoint) says nothing about the GPU: start the window again
  const restart = elapsed > windowMs || elapsed < 0;
  const base = restart ? { ...GPU_BOUND_START, gpuBound: state.gpuBound, lastHeldAt: state.lastHeldAt } : state;
  const decay = restart ? 1 : Math.exp(-elapsed / windowMs);
  const play = Number.isFinite(playMs) && playMs > 0 ? playMs : 0;
  const achieved = base.achieved * decay + (Number.isFinite(steps) && steps > 0 ? steps : 0);
  const requested = base.requested * decay + (play * stepsPerSecond) / 1000;
  const warmMs = base.warmMs + (play > 0 && !restart ? elapsed : 0);
  const lastHeldAt = held ? now : base.lastHeldAt;
  const recentHold = now - lastHeldAt < windowMs;
  let gpuBound = base.gpuBound;
  if (gpuBound) gpuBound = now - lastHeldAt < recoveryMs;
  else gpuBound = play > 0 && warmMs >= windowMs && recentHold && achieved < onRatio * requested;
  return { gpuBound, achieved, requested, warmMs, lastHeldAt, lastNow: now };
}
