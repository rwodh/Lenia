import { EXPERIMENT } from '../config.js';

/**
 * Progress of the guided experiment, as pure functions of app state (unit-tested).
 * `snap` = { generation, paused, params:{sigma,...} }.
 */
export function observeProgress(snap, startGeneration) {
  const done = snap.generation - startGeneration;
  return { value: Math.max(0, Math.min(done, EXPERIMENT.observeSteps)), max: EXPERIMENT.observeSteps, complete: done >= EXPERIMENT.observeSteps };
}

/** True while the dial sits on the experiment's target value (within half a slider step). */
export function atTarget(snap) {
  return Math.abs(snap.params[EXPERIMENT.param] - EXPERIMENT.targetValue) < 0.0005;
}

export function watchProgress(snap, startGeneration) {
  const done = snap.generation - startGeneration;
  return { value: Math.max(0, Math.min(done, EXPERIMENT.watchSteps)), max: EXPERIMENT.watchSteps, complete: done >= EXPERIMENT.watchSteps };
}
