import { createGLContext } from './gl/context.js';
import { FrameFence } from './gl/fence.js';
import { LOOP, SPEEDS, DEFAULT_SPEED_ID, UI_RANGES, PALETTES } from './config.js';
import { Renderer } from './render/renderer.js';
import { LeniaSimulation } from './simulation/lenia.js';
import { normalizeParams } from './simulation/params.js';
import { planFrameSteps, MAX_PENDING_STEPS } from './simulation/scheduler.js';

/**
 * Owns the GPU resources and the single animation loop. Parameters must already be
 * normalised; `initialState` is the Float32Array (gridSize^2) the simulation starts from
 * (see simulation/startup.js). `onFatal(error)` is called once if the app cannot continue.
 *
 * User-facing state (play/pause, speed, live parameters, palette) lives here; the UI in src/ui/
 * only calls the methods below and listens through onStatus(). The loop is never duplicated:
 * pause/step/reset only change flags and queued work that the one loop consumes.
 */
export class App {
  constructor({ canvas, hud, params, initialState, patternLabel = '', onFatal }) {
    this.canvas = canvas;
    this.hud = hud;
    this.baseParams = Object.freeze({ ...params }); // what Reset restores
    this.params = { ...params }; // live; shared by reference with the simulation, which reads mu/sigma/timeSteps every step
    this.initialState = initialState;
    this.patternLabel = patternLabel;
    this.onFatal = onFatal;

    this.paused = false;
    this.pendingSteps = 0;
    this.stepsPerSecond = SPEEDS.find((s) => s.id === DEFAULT_SPEED_ID).stepsPerSecond;
    this.palette = PALETTES[0];
    this.listeners = new Set();

    this.sim = null;
    this.renderer = null;
    this.running = false;
    this.rafId = 0;
    this.lastTime = 0;
    this.accumulatorMs = 0;
    this.fps = 0; // smoothed rate of frames actually submitted to the GPU
    this.lastSubmitMs = 0;
    this.lastHudMs = 0;
    this.gpuBound = false;
    this.cleanFrames = 0;
    this.fence = null;

    this.frame = this.frame.bind(this);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // required, otherwise the browser will not try to restore the context
      this.stop();
      this.hud.setNote('Graphics context lost. Waiting for the browser to restore it...');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.initGpu();
        this.hud.setNote('');
        this.start();
      } catch (err) {
        this.fail(err);
      }
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
  }

  /** (Re)create every GPU resource. Safe to call again after a context restore. */
  initGpu() {
    this.sim?.dispose(); // after a context loss these are harmless no-ops on dead handles
    this.renderer?.dispose();
    this.fence?.dispose();
    const { gl, caps } = createGLContext(this.canvas);
    this.caps = caps;
    this.fence = new FrameFence(gl, LOOP.maxFramesInFlight);
    this.renderer = new Renderer(gl, this.canvas, caps);
    this.renderer.setPalette(this.palette);
    this.sim = new LeniaSimulation(gl, caps, this.params);
    this.sim.reset(this.initialState);
    this.handleResize();
  }

  // ---- user-facing controls -------------------------------------------------------------

  play() { this.setPaused(false); }
  pause() { this.setPaused(true); }
  togglePlay() { this.setPaused(!this.paused); }

  setPaused(paused) {
    this.paused = !!paused;
    this.accumulatorMs = 0;
    if (!this.paused) this.pendingSteps = 0;
    this.emit();
  }

  /** Advance by exactly one step. Only meaningful while paused; ignored while playing. */
  stepOnce() {
    if (!this.paused) return false;
    if (this.pendingSteps < MAX_PENDING_STEPS) this.pendingSteps += 1;
    return true;
  }

  /** Restore the initial state AND the parameters the app started with. Play/pause and speed are kept. */
  reset() {
    Object.assign(this.params, this.baseParams);
    this.sim?.reset(this.initialState);
    this.accumulatorMs = 0;
    this.pendingSteps = 0;
    this.emit();
  }

  /** Set a live parameter (mu, sigma, timeSteps). Validated by normalizeParams, then limited to the slider range. Returns the value in effect. */
  setParam(key, value) {
    const range = UI_RANGES[key];
    if (!range) throw new RangeError(`parameter "${key}" cannot be changed at runtime`);
    const { params } = normalizeParams({ ...this.params, [key]: value });
    const clamped = Math.min(range.max, Math.max(range.min, params[key]));
    this.params[key] = Number(clamped.toFixed(6));
    this.emit();
    return this.params[key];
  }

  setSpeed(id) {
    const speed = SPEEDS.find((s) => s.id === id);
    if (!speed) throw new RangeError(`unknown speed "${id}"`);
    this.stepsPerSecond = speed.stepsPerSecond;
    this.emit();
  }

  setPalette(name) {
    if (!PALETTES.includes(name)) throw new RangeError(`unknown palette "${name}"`);
    this.palette = name;
    this.renderer?.setPalette(name);
    this.emit();
  }

  snapshot() {
    return {
      paused: this.paused,
      generation: this.sim ? this.sim.generation : 0,
      params: { ...this.params },
      baseParams: this.baseParams,
      stepsPerSecond: this.stepsPerSecond,
      speedId: SPEEDS.find((s) => s.stepsPerSecond === this.stepsPerSecond)?.id,
      palette: this.palette,
      gridSize: this.sim ? this.sim.size : this.params.gridSize,
      patternLabel: this.patternLabel,
    };
  }

  /** Subscribe to state changes (user actions, and the periodic status tick). Returns an unsubscribe function. */
  onStatus(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.hud.setRunState(this.paused, this.sim ? this.sim.generation : 0);
    if (!this.listeners.size) return;
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  start() {
    if (!this.sim) this.initGpu();
    this.resizeObserver.observe(this.canvas);
    this.running = true;
    this.lastTime = performance.now();
    this.lastSubmitMs = 0;
    this.accumulatorMs = 0;
    this.gpuBound = false;
    this.cleanFrames = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  fail(error) {
    this.stop();
    this.onFatal(error);
  }

  handleResize() {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
  }

  frame(now) {
    if (!this.running) return;
    try {
      const dt = Math.min(now - this.lastTime, 250); // a long stall (hidden tab, breakpoint) must not trigger a burst
      this.lastTime = now;
      if (!this.paused) this.accumulatorMs += dt;

      if (this.fence.canSubmit()) {
        if (++this.cleanFrames >= LOOP.gpuBoundRecoveryFrames) this.gpuBound = false;
        this.submitFrame(now);
      } else {
        // The GPU is still busy with earlier frames. Submitting more would only add latency.
        this.gpuBound = true;
        this.cleanFrames = 0;
      }

      if (now - this.lastHudMs >= LOOP.hudIntervalMs) {
        this.lastHudMs = now;
        // If nothing has been submitted for a while, report the (low) real rate rather than a stale average.
        const idleMs = now - this.lastSubmitMs;
        const fps = this.lastSubmitMs && idleMs > 0 ? Math.min(this.fps, 1000 / idleMs) : this.fps;
        this.hud.update({
          paused: this.paused,
          generation: this.sim.generation,
          fps,
          gridSize: this.sim.size,
          radius: this.params.radius,
          format: this.caps.stateFormat.name,
          gpuBound: this.gpuBound,
          patternLabel: this.patternLabel,
        });
        this.emit();
      }
      this.rafId = requestAnimationFrame(this.frame);
    } catch (err) {
      this.fail(err);
    }
  }

  /** Run the due simulation steps, draw, and fence the frame. */
  submitFrame(now) {
    // Fixed simulation rate, independent of display refresh. When GPU-bound, one step per
    // frame: the simulation slows down but the page stays responsive.
    const plan = planFrameSteps({
      paused: this.paused,
      accumulatorMs: this.accumulatorMs,
      stepMs: 1000 / this.stepsPerSecond,
      cap: this.gpuBound ? 1 : LOOP.maxStepsPerFrame,
      pendingSteps: this.pendingSteps,
    });
    for (let i = 0; i < plan.steps; i++) this.sim.step();
    this.accumulatorMs = plan.accumulatorMs;
    this.pendingSteps = plan.pendingSteps;

    this.renderer.draw(this.sim.stateTexture, this.sim.size);
    this.fence.mark();

    if (this.lastSubmitMs) {
      const interval = now - this.lastSubmitMs;
      if (interval > 0) this.fps = this.fps ? this.fps * 0.9 + (1000 / interval) * 0.1 : 1000 / interval;
    }
    this.lastSubmitMs = now;
  }
}
