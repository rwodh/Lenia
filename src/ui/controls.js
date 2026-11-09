import { SPEEDS, UI_RANGES, PALETTES, VISUAL, ADDITIONS, PANEL_STYLES } from '../config.js';
import { PATTERN_LIBRARY, getPattern } from '../simulation/patterns.js';

// The id 'observatory' is internal (shader uniform, tests); its label is 'Ocean' so it is not confused with the Observatory card.
const PALETTE_LABELS = { observatory: 'Ocean', viridis: 'Viridis' };
const AID_LABELS = { off: 'Off', trails: 'Trails', activity: 'Activity' };
const PANEL_LABELS = { glass: 'Glass', solid: 'Solid' };
// What each visualization aid shows. Both are derived from the state and drawn instead of it; neither changes the simulation.
const AID_TEXT = {
  trails: 'Trails: each cell shows the highest value it has had recently; older values fade by this factor at every simulation step. Derived from the state, display only.',
  activity: 'Activity: how much each cell has been changing, summed over recent steps with this fade and scaled so that 1 is the largest possible sustained change (1/T per step). Derived from the state, display only.',
};

function segmented(container, options, onPick) {
  const buttons = new Map();
  for (const { id, label } of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.textContent = label;
    b.addEventListener('click', () => onPick(id));
    container.appendChild(b);
    buttons.set(id, b);
  }
  return (activeId) => {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === activeId));
  };
}

/**
 * Wires the control panel to the App. Contains no simulation logic: every action calls an App method,
 * and the view is re-rendered from App.onStatus() snapshots (single source of truth = the App).
 * Text is set with textContent only.
 */
export class Controls {
  constructor(app, root = document) {
    this.app = app;
    this.playBtn = root.getElementById('btn-play');
    this.stepBtn = root.getElementById('btn-step');
    this.resetBtn = root.getElementById('btn-reset');
    this.inputs = {};
    this.outputs = {};

    this.playBtn.addEventListener('click', () => app.togglePlay());
    this.stepBtn.addEventListener('click', () => app.stepOnce());
    this.resetBtn.addEventListener('click', () => app.reset());

    this.paintSpeed = segmented(root.getElementById('seg-speed'), SPEEDS, (id) => app.setSpeed(id));
    this.paintColour = segmented(
      root.getElementById('seg-colour'),
      PALETTES.map((id) => ({ id, label: PALETTE_LABELS[id] })),
      (id) => app.setPalette(id),
    );

    this.paintSurround = segmented(
      root.getElementById('seg-surround'),
      [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }],
      (id) => app.setSurround(id === 'on'),
    );
    this.appEl = root.getElementById('app');
    this.paintPanels = segmented(
      root.getElementById('seg-panels'),
      PANEL_STYLES.map((id) => ({ id, label: PANEL_LABELS[id] })),
      (id) => app.setPanelStyle(id),
    );

    this.paintAid = segmented(
      root.getElementById('seg-aid'),
      VISUAL.modes.map((id) => ({ id, label: AID_LABELS[id] })),
      (id) => app.setVisualMode(id),
    );
    this.aid = {
      panel: root.querySelector('[data-aid="panel"]'),
      explain: root.querySelector('[data-aid="explain"]'),
      decay: root.getElementById('p-decay'),
      out: root.querySelector('[data-out="decay"]'),
    };
    this.aid.decay.min = String(VISUAL.decay.min);
    this.aid.decay.max = String(VISUAL.decay.max);
    this.aid.decay.step = String(VISUAL.decay.step);
    this.aid.decay.addEventListener('input', () => {
      this.aid.decay.value = String(app.setDecay(Number(this.aid.decay.value)));
    });

    this.tourEl = root.getElementById('tour');
    this.patternBox = root.getElementById('seg-pattern');
    this.paintPattern = segmented(
      this.patternBox,
      PATTERN_LIBRARY.map((p) => ({ id: p.id, label: p.name })),
      (id) => { if (id !== app.patternId) app.selectPattern(id); },
    );
    this.patternText = {
      description: root.querySelector('[data-pattern="description"]'),
      facts: root.querySelector('[data-pattern="facts"]'),
      locked: root.querySelector('[data-pattern="locked"]'),
      start: root.querySelector('[data-pattern="start"]'),
      added: root.querySelector('[data-pattern="added"]'),
    };
    this.addBtn = root.getElementById('btn-add');
    this.addBtn.addEventListener('click', () => app.armAdding(!app.adding));
    this.placeBtn = root.getElementById('btn-place');
    this.centreBtn = root.getElementById('btn-centre');
    this.canvas = app.canvas;
    this.placeBtn.addEventListener('click', () => app.armPlacement(!app.placing));
    this.centreBtn.addEventListener('click', () => app.clearPlacement());
    this.startLabels = {};

    for (const key of Object.keys(UI_RANGES)) {
      const input = root.querySelector(`[data-input="${key}"]`);
      const range = UI_RANGES[key];
      input.min = String(range.min);
      input.max = String(range.max);
      input.step = String(range.step);
      input.addEventListener('input', () => {
        const applied = app.setParam(key, Number(input.value));
        input.value = String(applied); // show the value actually in effect
      });
      this.inputs[key] = input;
      this.outputs[key] = root.querySelector(`[data-out="${key}"]`);
      this.startLabels[key] = root.querySelector(`[data-start="${key}"]`);
    }

    root.addEventListener('keydown', (e) => this.onKey(e));
    this.unsubscribe = app.onStatus((snap) => this.render(snap));
    this.render(app.snapshot());
  }

  onKey(e) {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (document.getElementById('tour')?.dataset.modal === 'true') return;
    if (e.key === 'Escape' && (this.app.placing || this.app.adding)) {
      if (this.app.placing) this.app.armPlacement(false);
      if (this.app.adding) this.app.armAdding(false);
    } else if (e.code === 'Space') {
      if (tag === 'BUTTON') return; // the focused button handles Space itself
      e.preventDefault();
      this.app.togglePlay();
    } else if (e.key === 's' || e.key === 'S') {
      this.app.stepOnce();
    } else if (e.key === 'r' || e.key === 'R') {
      this.app.reset();
    }
  }

  render(snap) {
    this.playBtn.textContent = snap.paused ? 'Play' : 'Pause';
    this.stepBtn.disabled = !snap.paused;
    this.stepBtn.title = snap.paused ? 'Advance exactly one step' : 'Pause first, then step';
    this.paintSpeed(snap.speedId);
    this.paintColour(snap.palette);
    this.paintSurround(snap.surround ? 'on' : 'off');
    this.paintPanels(snap.panelStyle);
    if (this.appEl) this.appEl.dataset.panels = snap.panelStyle;
    this.renderAid(snap);
    for (const key of Object.keys(UI_RANGES)) {
      const v = snap.params[key];
      this.inputs[key].value = String(v);
      this.outputs[key].textContent = v.toFixed(UI_RANGES[key].digits);
      // "(start: …)" follows the pattern Reset restores, which changes when a pattern is selected.
      const start = this.startLabels[key];
      if (start) start.textContent = `(start: ${snap.baseParams[key].toFixed(UI_RANGES[key].digits)})`;
    }
    this.renderPattern(snap);
  }

  /** Visualization aid: mode buttons; the fade slider and the explanation only while an aid is on. */
  renderAid(snap) {
    this.paintAid(snap.visualMode);
    const on = snap.visualMode !== 'off';
    this.aid.panel.hidden = !on;
    this.aid.decay.value = String(snap.decay);
    const halfLife = Math.log(0.5) / Math.log(snap.decay);
    this.aid.out.textContent = `${snap.decay.toFixed(3)} (half-life ${halfLife < 10 ? halfLife.toFixed(1) : Math.round(halfLife)} steps)`;
    this.aid.explain.textContent = on ? AID_TEXT[snap.visualMode] : '';
  }

  /** Organism card: which pattern is shown, its facts, and why the choice is locked when it is. */
  renderPattern(snap) {
    const noLibrary = snap.patternId === null;
    const tourOpen = !!this.tourEl && !this.tourEl.hidden;
    const locked = noLibrary || tourOpen;
    this.paintPattern(snap.patternId);
    for (const b of this.patternBox.querySelectorAll('button')) b.disabled = locked;
    // Placement follows the same lock as the selector (no organism for the noise start; the tour runs on the centred seed).
    this.placeBtn.disabled = locked;
    this.centreBtn.disabled = locked || snap.placement === null;
    this.placeBtn.setAttribute('aria-pressed', String(snap.placing && !locked));
    const full = snap.additions.length >= ADDITIONS.max;
    this.addBtn.disabled = locked || full;
    this.addBtn.setAttribute('aria-pressed', String(snap.adding && !locked));
    this.canvas?.classList.toggle('placing', (snap.placing || snap.adding) && !locked);
    const t = this.patternText;
    t.added.textContent = noLibrary ? '' : `Added: ${snap.additions.length} of ${ADDITIONS.max}${full ? ' (Reset removes them)' : ''}`;
    t.start.textContent = noLibrary ? '' : snap.placement ? `Start: cell (${snap.placement.x}, ${snap.placement.y})` : 'Start: centre';
    if (noLibrary) {
      t.description.textContent = 'Random noise start.';
      t.facts.textContent = '';
    } else {
      const p = getPattern(snap.patternId);
      const { radius, timeSteps, mu, sigma } = p.params;
      t.description.textContent = p.description;
      t.facts.textContent = `R ${radius} · T ${timeSteps} · μ ${mu} · σ ${sigma}`;
    }
    t.facts.hidden = noLibrary;
    t.locked.hidden = !locked;
    t.locked.textContent = noLibrary
      ? 'The organisms need kernel radius 13, but this URL uses another radius, so they are not offered.'
      : 'Locked during the guided tour, which uses Orbium unicaudatus.';
  }
}
