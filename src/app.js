import { createGLContext } from './gl/context.js';
import { FrameFence } from './gl/fence.js';
import { LOOP } from './config.js';
import { Renderer } from './render/renderer.js';
import { LeniaSimulation } from './simulation/lenia.js';

/**
 * Owns the GPU resources and the animation loop. Parameters must already be
 * normalised; `initialState` is the Float32Array (gridSize^2) the simulation starts from
 * (see simulation/startup.js). `onFatal(error)` is called once if the app cannot continue.
 */
export class App {
  constructor({ canvas, hud, params, initialState, onFatal }) {
    this.canvas = canvas;
    this.hud = hud;
    this.params = params;
    this.initialState = initialState;
    this.onFatal = onFatal;

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
    this.sim = new LeniaSimulation(gl, caps, this.params);
    this.sim.reset(this.initialState);
    this.handleResize();
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
      this.accumulatorMs += dt;

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
          generation: this.sim.generation,
          fps,
          gridSize: this.sim.size,
          radius: this.params.radius,
          format: this.caps.stateFormat.name,
          gpuBound: this.gpuBound,
        });
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
    const stepMs = 1000 / LOOP.stepsPerSecond;
    const cap = this.gpuBound ? 1 : LOOP.maxStepsPerFrame;
    let steps = 0;
    while (this.accumulatorMs >= stepMs && steps < cap) {
      this.sim.step();
      this.accumulatorMs -= stepMs;
      steps += 1;
    }
    if (steps === cap) this.accumulatorMs = 0; // running behind: drop the backlog

    this.renderer.draw(this.sim.stateTexture, this.sim.size);
    this.fence.mark();

    if (this.lastSubmitMs) {
      const interval = now - this.lastSubmitMs;
      if (interval > 0) this.fps = this.fps ? this.fps * 0.9 + (1000 / interval) * 0.1 : 1000 / interval;
    }
    this.lastSubmitMs = now;
  }
}
