/**
 * Floating panels, the narrow-screen bottom sheets and the Hide-UI switch. Pure interface state: which panel is open is not
 * user-facing simulation state, so it lives here, not in the App (owner decision 5, 8 Nov 2026); nothing is remembered.
 *
 * - A button with data-panel="<name>" toggles the panel #card-<name> (aria-expanded on every button for that panel).
 * - One open panel per side (data-side="left" | "right"); on narrow screens one panel at all.
 * - Esc closes the most recently opened panel and returns focus to the button that opened it.
 * - H hides every element marked .chrome except a "Show UI" button; H or that button shows them again.
 * The tour and the tests open panels through open(name).
 */
const NARROW = '(max-width: 720px)';

export class Panels {
  constructor(root = document, { win = window } = {}) {
    this.doc = root;
    this.win = win;
    this.app = root.getElementById('app');
    this.showBtn = root.getElementById('btn-show-ui');
    this.hideBtn = root.getElementById('btn-hide-ui');
    this.tourEl = root.getElementById('tour');
    this.panels = new Map();
    for (const el of root.querySelectorAll('.panel[id^="card-"]')) this.panels.set(el.id.slice('card-'.length), el);
    this.buttons = [...root.querySelectorAll('[data-panel]')];
    this.openers = new Map(); // name -> the button that opened it (focus returns there)
    this.order = []; // open panel names, most recent last

    for (const btn of this.buttons) btn.addEventListener('click', () => this.toggle(btn.dataset.panel, btn));
    for (const btn of root.querySelectorAll('[data-panel-close]')) {
      btn.addEventListener('click', () => this.close(btn.closest('.panel').id.slice('card-'.length), { focus: true }));
    }
    this.hideBtn?.addEventListener('click', () => this.setHidden(true));
    this.showBtn?.addEventListener('click', () => this.setHidden(false));
    root.addEventListener('keydown', (e) => this.onKey(e));
  }

  get narrow() { return this.win.matchMedia(NARROW).matches; }

  isOpen(name) { return this.panels.get(name)?.hidden === false; }

  toggle(name, opener) {
    if (this.isOpen(name)) {
      // A button that targets a part of the panel (the wordmark opens About) re-targets instead of closing it.
      if (opener?.dataset.panelTarget) return this.reveal(opener.dataset.panelTarget);
      return this.close(name);
    }
    this.open(name, { opener });
  }

  /** Open a panel; closes the other one on its side (or any other, on narrow screens). `focus` moves focus into it. */
  open(name, { opener = null, focus = false } = {}) {
    const el = this.panels.get(name);
    if (!el) throw new RangeError(`unknown panel "${name}"`);
    for (const other of [...this.order]) {
      if (other !== name && (this.narrow || this.panels.get(other).dataset.side === el.dataset.side)) this.close(other);
    }
    el.hidden = false;
    this.order = [...this.order.filter((n) => n !== name), name];
    if (opener) this.openers.set(name, opener);
    this.sync(name);
    if (opener?.dataset.panelTarget) this.reveal(opener.dataset.panelTarget);
    if (focus) el.focus({ preventScroll: true });
    return el;
  }

  close(name, { focus = false } = {}) {
    const el = this.panels.get(name);
    if (!el || el.hidden) return;
    el.hidden = true;
    this.order = this.order.filter((n) => n !== name);
    this.sync(name);
    const opener = this.openers.get(name);
    if (focus && opener && !opener.closest('[hidden]')) opener.focus({ preventScroll: true });
  }

  closeAll() { for (const name of [...this.order]) this.close(name); }

  reveal(id) { this.doc.getElementById(id)?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }

  sync(name) {
    const open = this.isOpen(name);
    for (const btn of this.buttons) if (btn.dataset.panel === name) btn.setAttribute('aria-expanded', String(open));
  }

  /** Hide or show all floating interface ("chrome"); the world keeps running. */
  setHidden(hidden) {
    this.app.dataset.ui = hidden ? 'hidden' : 'shown';
    this.showBtn.hidden = !hidden;
    (hidden ? this.showBtn : this.hideBtn)?.focus({ preventScroll: true });
  }

  get uiHidden() { return this.app.dataset.ui === 'hidden'; }

  onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const tourOpen = this.tourEl && !this.tourEl.hidden;
    if (e.key === 'Escape') {
      if (tourOpen || !this.order.length) return; // the tour handles its own Escape
      this.close(this.order[this.order.length - 1], { focus: true });
      return;
    }
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.repeat) return;
    if ((e.key === 'h' || e.key === 'H') && !(tourOpen && this.tourEl.dataset.modal === 'true')) {
      e.preventDefault();
      this.setHidden(!this.uiHidden);
    }
  }
}
