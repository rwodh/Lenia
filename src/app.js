import { createGLContext } from './gl/context.js';
import { FrameFence } from './gl/fence.js';
import { AsyncReadback } from './gl/readback.js';
import { OverlayAccumulator, OVERLAY_MODE } from './gl/overlay.js';
import { StampPass } from './gl/stamp.js';
import { computeObservables } from './simulation/observables.js';
import { shouldSample, sampleIntervalFor, SampleHistory } from './simulation/sampler.js';
import { LOOP, SPEEDS, DEFAULT_SPEED_ID, UI_RANGES, PALETTES, VIEW, VISUAL, ADDITIONS, SURROUND, PANEL_STYLES } from './config.js';
import * as viewMath from './render/view-math.js';
import { Renderer } from './render/renderer.js';
import { LeniaSimulation } from './simulation/lenia.js';
import { normalizeParams } from './simulation/params.js';
import { planPattern } from './simulation/startup.js';
import { getPattern } from './simulation/patterns.js';
import { decodeRle } from './simulation/rle.js';
import { planFrameSteps, MAX_PENDING_STEPS } from './simulation/scheduler.js';

/**
 * Owns the GPU resources and the single animation loop. Parameters must already be
 * normalised; `initialState` is the Float32Array (gridSize^2) the simulation starts from
 * (see simulation/startup.js). `patternId` is the library pattern being shown, or null for the noise start (which has
 * no library: its kernel radius is not the patterns'). `onFatal(error)` is called once if the app cannot continue.
 *
 * User-facing state (play/pause, speed, live parameters, palette) lives here; the UI in src/ui/
 * only calls the methods below and listens through onStatus(). The loop is never duplicated:
 * pause/step/reset only change flags and queued work that the one loop consumes.
 */
export class App {
  constructor({ canvas, hud, params, initialState, patternLabel = '', patternId = null, onFatal }) {
    this.canvas = canvas;
    this.hud = hud;
    this.baseParams = Object.freeze({ ...params }); // what Reset restores
    this.params = { ...params }; // live; shared by reference with the simulation, which reads mu/sigma/timeSteps every step
    this.initialState = initialState;
    this.patternLabel = patternLabel;
    this.patternId = patternId;
    this.placement = null; // null = centred (as at launch), else the cell { x, y } the organism's centre starts on
    this.placing = false; // "Place" mode armed: the next click on the world sets the placement
    // Phase 4b: copies of the selected organism added to the running world ({ x, y, generation } each, at most ADDITIONS.max).
    // Interventions, not part of the start: Reset (and a context restore, which re-seeds the start) removes them.
    this.additions = [];
    this.adding = false; // "Add" mode armed: the next click on the world adds a copy there
    this.stamp = null; // StampPass, created on the first addition
    this.onFatal = onFatal;

    this.paused = false;
    this.pendingSteps = 0;
    this.stepsPerSecond = SPEEDS.find((s) => s.id === DEFAULT_SPEED_ID).stepsPerSecond;
    this.palette = PALETTES[0];
    // World View (display only): kept across Reset, pattern switches and context restores; the tour resets it.
    this.view = viewMath.defaultView(params.gridSize);
    // Periodic surround (display only, decision 35) and the floating panels' look: user-facing display preferences.
    this.surround = SURROUND.default;
    this.panelStyle = PANEL_STYLES[0];
    // Visualization aid (display only): 'off' allocates nothing and adds no pass; otherwise one pass per simulation step.
    this.visualMode = 'off';
    this.decay = VISUAL.decay.default;
    this.overlay = null;
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
    this.gpuLost = false; // true between a context loss and the next initGpu()
    // True only while the GPU objects are usable: from a successful initGpu() until a context loss or a failure. While it is
    // false, actions that only change what the world should be (Reset, organism, start cell, overlay mode) change App state
    // and leave the GPU alone; the next successful initGpu() uploads that state. Adding an organism needs the live state, so
    // it is refused with a message instead (decision 33).
    this.gpuReady = false;
    this.onRecovered = null; // called after a successful restore (main.js hides the error panel)

    // Observatory (read-only): the state is copied to the CPU asynchronously, at most every 250 ms (500 ms at grid 512) and
    // not while the GPU is behind (see requestSample), and measured there.
    // `epoch` increases whenever the state is replaced (Reset, pattern switch, context loss); a readback submitted in an
    // older epoch is discarded when it arrives. Samples are tagged with the generation at submission.
    this.readback = null;
    this.epoch = 0;
    this.history = new SampleHistory();
    this.observation = { status: 'waiting', reason: '', latest: null }; // status: 'waiting' | 'ok' | 'unavailable'
    this.lastSampleMs = 0;
    this.lastSampledGeneration = -1;

    this.frame = this.frame.bind(this);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // required, otherwise the browser will not try to restore the context
      this.stop();
      this.gpuReady = false;
      this.gpuLost = true; // initGpu() must not delete the dead objects (see there)
      this.readback = null; // its buffer and fence died with the context; dropped, not disposed
      this.overlay = null; // likewise; recreated by initGpu() if a mode is on
      this.stamp = null; // likewise; recreated on the next addition
      this.clearObservations();
      this.setObservatoryUnavailable('graphics context lost');
      this.hud.setNote('Graphics context lost. Waiting for the browser to restore it...', { persistent: true });
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.initGpu();
        this.hud.setNote('');
        this.start();
        this.onRecovered?.(); // an error panel shown by a failed restore no longer describes the app
      } catch (err) {
        this.fail(err);
      }
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
  }

  /** (Re)create every GPU resource. Safe to call again after a context restore. */
  initGpu() {
    this.gpuReady = false;
    // After a context loss the old objects died with the context and are dropped, not disposed: deleting them raises
    // INVALID_OPERATION, and that leftover error made the format probe reject float32 (progress.md, fact 22).
    if (!this.gpuLost) {
      this.sim?.dispose();
      this.renderer?.dispose();
      this.fence?.dispose();
      this.overlay?.dispose();
      this.stamp?.dispose();
    }
    this.overlay = null;
    this.stamp = null;
    this.additions = []; // the state is re-seeded from the start below
    this.gpuLost = false;
    const { gl, caps } = createGLContext(this.canvas);
    this.caps = caps;
    this.fence = new FrameFence(gl, LOOP.maxFramesInFlight);
    this.renderer = new Renderer(gl, this.canvas, caps);
    this.renderer.setPalette(this.palette);
    this.sim = new LeniaSimulation(gl, caps, this.params);
    this.sim.reset(this.initialState);
    if (this.visualMode !== 'off') this.overlay = new OverlayAccumulator(gl, caps, this.sim.size);
    this.readback = null;
    this.clearObservations();
    try {
      this.readback = new AsyncReadback(gl, this.sim.size);
    } catch (err) {
      this.setObservatoryUnavailable(err.message); // the simulation does not depend on it
    }
    this.handleResize();
    this.gpuReady = true;
  }

  // ---- Observatory (read-only; never changes the simulation) ------------------------------------

  /** Forget all samples and any readback in flight: the state they describe has been replaced. */
  clearObservations() {
    this.epoch += 1;
    this.history.clear();
    this.readback?.cancel();
    this.lastSampleMs = 0;
    this.lastSampledGeneration = -1;
    this.observation = this.readback?.failed
      ? { status: 'unavailable', reason: this.readback.failed, latest: null }
      : { status: 'waiting', reason: '', latest: null };
  }

  setObservatoryUnavailable(reason) {
    this.observation = { status: 'unavailable', reason: String(reason || 'readback failed'), latest: null };
    this.emit();
  }

  /** Called every frame. Never blocks: only asks whether the copy has completed, and measures it when it has. */
  collectSample() {
    const rb = this.readback;
    if (!rb || rb.failed) return;
    let result;
    try {
      result = rb.poll();
    } catch (err) {
      rb.failed = String(err?.message || err);
    }
    if (rb.failed) {
      if (this.observation.status !== 'unavailable') this.setObservatoryUnavailable(rb.failed);
      return;
    }
    // Nothing yet; or the state was replaced (epoch) or an organism was added (adds) since the request: an addition does not
    // advance the generation, so the generation alone cannot tell the state before it from the state after it.
    if (!result || result.tag.epoch !== this.epoch || result.tag.adds !== this.additions.length) return;
    const o = computeObservables(result.state, this.sim.size);
    this.history.push(result.tag.generation, o.mass, result.tag.adds);
    this.observation = { status: 'ok', reason: '', latest: { generation: result.tag.generation, adds: result.tag.adds, ...o } };
    this.emit(); // the card shows a sample as soon as it is measured (rate-limited by requestSample)
  }

  /** Queue at most one readback of the current state, rate-limited, never while the GPU is behind. */
  requestSample(now) {
    const rb = this.readback;
    const due = shouldSample({
      available: !!rb && !rb.failed,
      busy: !!rb && rb.busy,
      gpuBound: this.gpuBound,
      generation: this.sim.generation,
      lastGeneration: this.lastSampledGeneration,
      nowMs: now,
      lastSampleMs: this.lastSampleMs,
      intervalMs: sampleIntervalFor(this.sim.size),
    });
    if (!due) return;
    try {
      if (rb.request(this.sim.stateFramebuffer, { generation: this.sim.generation, epoch: this.epoch, adds: this.additions.length })) {
        this.lastSampleMs = now;
        this.lastSampledGeneration = this.sim.generation;
      }
    } catch (err) {
      rb.failed = String(err?.message || err);
    }
    if (rb.failed) this.setObservatoryUnavailable(rb.failed);
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
    if (this.gpuReady) { // otherwise the next successful initGpu() uploads this.initialState (see gpuReady)
      this.sim.reset(this.initialState);
      this.overlay?.clear(); // its history described the state that was just replaced
    }
    this.additions = [];
    this.adding = false;
    this.hud.setPattern(this.displayLabel);
    this.accumulatorMs = 0;
    this.pendingSteps = 0;
    this.clearObservations();
    this.emit();
  }

  /**
   * Show library pattern `id`: it becomes what Reset restores (its own initial state, parameters and label), and the
   * simulation restarts from it through the same path as reset(). Play/pause and speed are kept. Selecting the pattern
   * already shown restarts it. Throws if there is no library here (noise start) or the id is unknown.
   * One state upload: the kernel texture and the ping-pong targets are reused, since every pattern has the same radius.
   * The chosen start cell (placeAt) is kept, unless `centred` is set (the tour uses that, so it always starts centred).
   */
  selectPattern(id, { centred = false } = {}) {
    if (this.patternId === null) throw new RangeError('this world has no pattern library (it does not use the patterns\' kernel radius)');
    const placement = centred ? null : this.placement;
    const plan = planPattern(id, this.baseParams, placement);
    this.baseParams = Object.freeze({ ...plan.params });
    this.initialState = plan.initialState; // also what a context restore re-uploads
    this.placement = placement;
    this.patternLabel = plan.label;
    this.patternId = plan.pattern.id;
    this.hud.setPattern(plan.label);
    this.placing = false;
    this.reset();
  }

  /** The pattern label plus the number of added copies, e.g. "Orbium unicaudatus (O2u) + 1 added". */
  get displayLabel() {
    return this.additions.length ? `${this.patternLabel} + ${this.additions.length} added` : this.patternLabel;
  }

  // ---- Placement: where the selected organism starts (Reset restores it there). No change to the simulation rules. ----

  /** Arm or disarm "Place" mode: while armed, a click on the world chooses the start cell (see ViewControls onClick). */
  armPlacement(on) {
    this.placing = !!on && this.patternId !== null;
    if (this.placing) this.adding = false; // one click mode at a time
    this.emit();
  }

  /** Start the selected organism with its centre on cell { x, y } (integers in [0, grid)); restarts like Reset. */
  placeAt(cell) {
    if (this.patternId === null) throw new RangeError('this world has no organism to place');
    const placement = { x: cell?.x, y: cell?.y };
    const plan = planPattern(this.patternId, this.baseParams, placement); // throws RangeError for a cell outside the grid
    this.initialState = plan.initialState;
    this.placement = Object.freeze(placement);
    this.placing = false;
    this.reset();
  }

  // ---- Phase 4b: add a copy of the selected organism to the running world (decision 31) ----

  /** Arm or disarm "Add" mode: while armed, a click on the world adds a copy there. Refused at the cap. */
  armAdding(on) {
    this.adding = !!on && this.patternId !== null && this.additions.length < ADDITIONS.max;
    if (this.adding) this.placing = false; // one click mode at a time
    this.emit();
  }

  /**
   * Add a copy of the selected organism with its centre on cell { x, y }, into the current state, combined with max (src/gl/stamp.js).
   * Not a step: the generation is unchanged. The Observatory keeps its history; a readback in flight is discarded (its tag has
   * the old addition count) and the next sample is taken even at the same generation. The overlays are kept.
   */
  addAt(cell) {
    if (this.patternId === null) throw new RangeError('this world has no organism to add');
    if (this.additions.length >= ADDITIONS.max) throw new RangeError(`at most ${ADDITIONS.max} organisms can be added; Reset removes them`);
    if (!this.gpuReady) { // an addition changes the live state, which does not exist while the context is lost
      this.adding = false;
      this.hud.setNote('Graphics context not available: organisms can be added again once the browser restores it.');
      this.emit();
      return false;
    }
    const x = cell?.x, y = cell?.y, n = this.sim.size;
    if (![x, y].every((v) => Number.isInteger(v) && v >= 0 && v < n)) throw new RangeError(`cell (${x}, ${y}) is not a cell of the ${n}x${n} grid`);
    if (!this.stamp) this.stamp = new StampPass(this.sim.gl);
    this.stamp.apply(this.sim, this.patternId, decodeRle(getPattern(this.patternId).rle), x, y);
    this.additions = [...this.additions, Object.freeze({ x, y, generation: this.sim.generation })];
    this.adding = false;
    this.readback?.cancel();
    this.lastSampledGeneration = -1; // sample the new state even though the generation has not changed
    this.lastSampleMs = 0;
    this.hud.setPattern(this.displayLabel);
    this.emit();
    return true;
  }

  /** Back to the centred start (as at launch). */
  clearPlacement() {
    if (this.patternId !== null) this.selectPattern(this.patternId, { centred: true });
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

  /** 'off', 'trails' or 'activity'. Display only: the simulation state is never written. Switching clears the aid. */
  setVisualMode(mode) {
    if (!VISUAL.modes.includes(mode)) throw new RangeError(`unknown visual mode "${mode}"`);
    this.visualMode = mode;
    if (mode === 'off') {
      if (this.gpuReady) this.overlay?.dispose(); // otherwise its objects are dead or about to be replaced: drop them
      this.overlay = null;
    } else if (this.gpuReady) { // otherwise initGpu() creates it for this mode on the next successful restore
      try {
        if (!this.overlay) this.overlay = new OverlayAccumulator(this.sim.gl, this.caps, this.sim.size);
        else this.overlay.clear();
      } catch (err) { // e.g. GPU memory: the simulation does not depend on the aid, so fall back to off
        this.visualMode = 'off';
        this.overlay = null;
        this.hud.setNote(`Visual aid unavailable: ${err.message}`);
      }
    }
    this.emit();
  }

  /** Decay per simulation step, limited to VISUAL.decay; non-finite input is rejected. Returns the value in effect. */
  setDecay(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) throw new RangeError('decay must be a finite number');
    const { min, max } = VISUAL.decay;
    this.decay = Number(Math.min(max, Math.max(min, v)).toFixed(3));
    this.emit();
    return this.decay;
  }

  /** Periodic surround on or off (display only: the main square and the simulation are unaffected). */
  setSurround(on) {
    this.surround = !!on;
    this.emit();
  }

  /** 'glass' (translucent, blurred) or 'solid' panels. Display only. */
  setPanelStyle(style) {
    if (!PANEL_STYLES.includes(style)) throw new RangeError(`unknown panel style "${style}"`);
    this.panelStyle = style;
    this.emit();
  }

  setPalette(name) {
    if (!PALETTES.includes(name)) throw new RangeError(`unknown palette "${name}"`);
    this.palette = name;
    this.renderer?.setPalette(name);
    this.emit();
  }

  // ---- World View (display only; never changes the simulation) --------------------------------
  // Positions are drawing-buffer pixels, origin bottom-left (convert pointer positions with viewMath.clientToBuffer).

  /** Zoom by `factor` about buffer pixel (px, py); the cell under it stays under it. Bad input is ignored. */
  zoomAt(px, py, factor) {
    const { width, height } = this.canvas;
    this.setView(viewMath.zoomAt(this.view, this.worldSize, width, height, px, py, factor, VIEW.maxZoom));
  }

  /** Zoom by `factor` about the centre of the canvas (buttons and keys). */
  zoomBy(factor) {
    this.zoomAt(this.canvas.width / 2, this.canvas.height / 2, factor);
  }

  /** Move the picture by (dpx, dpy) buffer pixels, y up. Bad input is ignored. */
  panBy(dpx, dpy) {
    const { width, height } = this.canvas;
    this.setView(viewMath.panBy(this.view, this.worldSize, width, height, dpx, dpy, VIEW.maxZoom));
  }

  resetView() {
    this.setView(viewMath.defaultView(this.worldSize));
  }

  /** The cell { x, y } under buffer pixel (px, py) (wrapping in the periodic surround), or null where the background is shown. */
  cellAt(px, py) {
    return viewMath.cellAt(this.view, this.worldSize, this.canvas.width, this.canvas.height, px, py, { surround: this.surround });
  }

  setView(view) {
    const next = viewMath.clampView(view, this.worldSize, VIEW.maxZoom, this.view);
    if (next.cx === this.view.cx && next.cy === this.view.cy && next.zoom === this.view.zoom) return;
    this.view = next; // drawn by the next frame, paused or not
    this.emit();
  }

  get worldSize() {
    return this.sim ? this.sim.size : this.params.gridSize;
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
      view: this.view, // replaced (never mutated) on each change
      surround: this.surround,
      panelStyle: this.panelStyle,
      gpuBound: this.gpuBound,
      visualMode: this.visualMode,
      decay: this.decay,
      gridSize: this.sim ? this.sim.size : this.params.gridSize,
      patternLabel: this.displayLabel,
      patternId: this.patternId,
      placement: this.placement,
      additions: this.additions, // replaced (never mutated) on each change
      adding: this.adding,
      placing: this.placing,
      observation: this.observation, // replaced (never mutated) on each change
      historyVersion: this.history.version,
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
    this.gpuReady = false; // the GPU objects may be partly built or stale; actions wait for the next successful initGpu()
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
      this.collectSample();

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
          patternLabel: this.displayLabel,
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
    const ov = this.overlay, mode = OVERLAY_MODE[this.visualMode];
    for (let i = 0; i < plan.steps; i++) {
      this.sim.step();
      ov?.accumulate(this.sim.stateTexture, this.sim.previousTexture, mode, this.decay); // per step, read-only towards the state
    }
    this.accumulatorMs = plan.accumulatorMs;
    this.pendingSteps = plan.pendingSteps;

    const scale = mode === OVERLAY_MODE.activity ? (1 - this.decay) * this.params.timeSteps : 1; // activity: (1 - decay) / dt
    this.renderer.draw(this.sim.stateTexture, this.sim.size, viewMath.viewUniforms(this.view, this.sim.size),
      ov ? { texture: ov.texture, mode, scale } : null, this.surround ? SURROUND : null);
    this.requestSample(now); // only reached when the fence allowed this frame, i.e. the GPU is keeping up
    this.fence.mark();

    if (this.lastSubmitMs) {
      const interval = now - this.lastSubmitMs;
      if (interval > 0) this.fps = this.fps ? this.fps * 0.9 + (1000 / interval) * 0.1 : 1000 / interval;
    }
    this.lastSubmitMs = now;
  }
}
