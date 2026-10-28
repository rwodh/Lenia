import { SPEEDS, UI_RANGES, PALETTES } from '../config.js';

const PALETTE_LABELS = { observatory: 'Observatory', viridis: 'Viridis' };

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
    }

    const base = app.baseParams;
    for (const key of Object.keys(UI_RANGES)) {
      const el = root.querySelector(`[data-start="${key}"]`);
      if (el) el.textContent = `(start: ${base[key].toFixed(UI_RANGES[key].digits)})`;
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
    if (e.code === 'Space') {
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
    for (const key of Object.keys(UI_RANGES)) {
      const v = snap.params[key];
      this.inputs[key].value = String(v);
      this.outputs[key].textContent = v.toFixed(UI_RANGES[key].digits);
    }
  }
}
