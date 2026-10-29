import { TOUR_STORAGE_KEY, EXPERIMENT, UI_RANGES } from '../config.js';
import { hasCompletedTour, markTourCompleted } from './storage.js';
import { observeProgress, watchProgress, atTarget } from './experiment.js';

const STEPS = ['welcome', 'controls', 'params', 'observe', 'change', 'watch', 'done'];
const MODAL_STEPS = new Set(['welcome', 'done']);
const sigmaText = (v) => v.toFixed(UI_RANGES.sigma.digits);

/**
 * Guided Discovery: a short, skippable, interactive introduction layered over the same running App
 * (no reload, no second loop). The steps' content is static markup in index.html; this class only
 * shows one step at a time, highlights the real control being discussed, drives the experiment through
 * the App's public methods, and enables "Next" when the user has actually done what the step asks.
 * Leaving the tour (finish or skip) resets Orbium and its parameters and plays, so the Explorer starts clean.
 */
export class Tour {
  constructor(app, { available, storage, document: doc = document }) {
    this.app = app;
    this.available = available;
    this.storage = storage;
    this.doc = doc;
    this.root = doc.getElementById('tour');
    this.card = this.root.querySelector('.tour-card');
    this.appRoot = doc.getElementById('app');
    this.openBtn = doc.getElementById('tour-open');
    this.progressLabel = this.root.querySelector('[data-tour="progress"]');
    this.sections = new Map(
      [...this.root.querySelectorAll('[data-tour-step]')].map((el) => [el.dataset.tourStep, el]),
    );
    this.index = -1;
    this.isOpen = false;
    this.latched = new Set();
    this.watchCount = 0;
    this.lastGeneration = 0;
    this.spotEl = null;

    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tour-action]');
      if (!btn || btn.disabled) return;
      const action = btn.dataset.tourAction;
      if (action === 'next') this.goTo(this.index + 1);
      else if (action === 'back') this.goTo(this.index - 1);
      else this.finish(); // 'skip' and 'enter' both leave the tour
    });
    doc.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') this.finish();
    });

    if (available) {
      this.openBtn.hidden = false;
      this.openBtn.addEventListener('click', () => this.open());
    }
    app.onStatus((snap) => this.isOpen && this.update(snap));
  }

  maybeAutoStart() {
    if (this.available && !hasCompletedTour(this.storage, TOUR_STORAGE_KEY)) this.open();
  }

  open() {
    if (!this.available || this.isOpen) return;
    this.isOpen = true;
    this.root.hidden = false;
    this.goTo(0);
  }

  /** Leave the tour: remember completion, return the Explorer to a clean running start. */
  finish() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    this.setSpot(null);
    this.setModal(false);
    markTourCompleted(this.storage, TOUR_STORAGE_KEY);
    this.app.reset();
    this.app.play();
    this.doc.getElementById('btn-play').focus({ preventScroll: true });
  }

  setModal(modal) {
    this.root.dataset.modal = String(modal);
    this.appRoot.inert = modal;
  }

  setSpot(el, scrollTo = el) {
    this.spotEl?.classList.remove('spot');
    this.spotEl = el;
    if (!el) return;
    el.classList.add('spot');
    // Narrow screens stack canvas above panel and the tour sheet covers the bottom: bring the region of interest to the top.
    const narrow = this.doc.defaultView.matchMedia('(max-width: 860px)').matches;
    scrollTo.scrollIntoView({ block: narrow ? 'start' : 'nearest', behavior: 'auto' });
  }

  goTo(i) {
    if (i < 0 || i >= STEPS.length) return;
    this.index = i;
    const name = STEPS[i];
    for (const [key, el] of this.sections) el.hidden = key !== name;
    this.progressLabel.textContent = `${i + 1} / ${STEPS.length}`;
    this.setModal(MODAL_STEPS.has(name));

    const byId = (id) => this.doc.getElementById(id);
    const sigmaRow = this.doc.querySelector('[data-param="sigma"]');
    const stage = this.doc.querySelector('.stage');
    // [highlighted element, element to scroll into view]: canvas + transport stay together for the "watching" steps.
    const target = { controls: [byId('card-transport'), stage], params: [byId('card-params')], observe: [byId('card-transport'), stage],
      change: [sigmaRow], watch: [byId('card-transport'), stage] }[name];
    this.setSpot(target ? target[0] : null, target && target[1]);

    this.latched.delete(name);
    if (name === 'observe') { this.app.reset(); this.app.play(); }
    if (name === 'change') this.app.pause();
    if (name === 'watch') { this.watchCount = 0; this.lastGeneration = this.app.snapshot().generation; }

    this.update(this.app.snapshot());
    this.card.focus({ preventScroll: true });
    const primary = this.sections.get(name).querySelector('.btn-primary');
    if (MODAL_STEPS.has(name) && primary) primary.focus({ preventScroll: true });
  }

  update(snap) {
    const name = STEPS[this.index];
    const section = this.sections.get(name);
    const next = section.querySelector('[data-tour-action="next"]');
    const text = (key, value) => { section.querySelector(`[data-tour="${key}"]`).textContent = value; };
    const bar = (key, value, max) => { const p = section.querySelector(`[data-tour="${key}"]`); p.max = max; p.value = value; };

    if (name === 'observe') {
      const p = observeProgress(snap, 0);
      if (p.complete) this.latched.add(name);
      bar('observe-progress', p.value, p.max);
      text('observe-status', this.latched.has(name) ? 'Good. Keep this picture in mind.' : snap.paused ? 'Paused. Press Play to keep observing.' : 'Observing...');
      next.disabled = !this.latched.has(name);
    } else if (name === 'change') {
      if (atTarget(snap)) this.latched.add(name);
      const ok = this.latched.has(name) && atTarget(snap);
      text('change-status', ok ? `σ = ${sigmaText(snap.params.sigma)}. Press Next.`
        : `σ is ${sigmaText(snap.params.sigma)}; set it to ${sigmaText(EXPERIMENT.targetValue)}.`);
      next.disabled = !ok;
    } else if (name === 'watch') {
      const delta = snap.generation - this.lastGeneration;
      if (delta > 0 && atTarget(snap)) this.watchCount += delta;
      this.lastGeneration = snap.generation;
      const p = watchProgress({ generation: this.watchCount }, 0);
      if (p.complete) this.latched.add(name);
      bar('watch-progress', p.value, p.max);
      text('watch-status', !atTarget(snap) ? `σ is ${sigmaText(snap.params.sigma)}. Set it back to ${sigmaText(EXPERIMENT.targetValue)} to continue.`
        : this.latched.has(name) ? 'Done. Press Next to see what happened.'
        : snap.paused ? 'Paused. Press Play or Step.' : 'Watching...');
      next.disabled = !this.latched.has(name);
    }
  }
}
