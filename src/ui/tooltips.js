/**
 * Tooltips for the icon and transport buttons (elements with data-tip): name and shortcut, shown on hover and on keyboard
 * focus. WCAG 1.4.13: the tooltip is referenced with aria-describedby while shown, Esc dismisses it without moving focus, and
 * the pointer can move onto it without it disappearing. It never carries information the control's own name does not.
 * One shared element, text via textContent only.
 */
const SHOW_DELAY_MS = 350;
const HIDE_GRACE_MS = 200;

export class Tooltips {
  constructor(root = document, { win = window } = {}) {
    this.doc = root;
    this.win = win;
    this.tip = root.getElementById('tooltip');
    this.owner = null;
    this.showTimer = 0;
    this.hideTimer = 0;
    for (const el of root.querySelectorAll('[data-tip]')) {
      el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') this.schedule(el); });
      el.addEventListener('pointerleave', () => this.scheduleHide());
      el.addEventListener('focus', () => { if (el.matches(':focus-visible')) this.show(el); });
      el.addEventListener('blur', () => this.hide());
      el.addEventListener('click', () => this.hide());
    }
    this.tip.addEventListener('pointerenter', () => this.win.clearTimeout(this.hideTimer));
    this.tip.addEventListener('pointerleave', () => this.scheduleHide());
    // Esc dismisses a visible tooltip without moving focus. It is not swallowed: the same Esc still cancels Place or Add and
    // closes a panel, because a tooltip that appeared on its own (focus after leaving the tour) must not cost the user a key press.
    this.win.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.tip.hidden) this.hide(); }, true);
  }

  schedule(el) {
    this.win.clearTimeout(this.hideTimer);
    this.win.clearTimeout(this.showTimer);
    this.showTimer = this.win.setTimeout(() => this.show(el), SHOW_DELAY_MS);
  }

  scheduleHide() {
    this.win.clearTimeout(this.showTimer);
    this.win.clearTimeout(this.hideTimer);
    this.hideTimer = this.win.setTimeout(() => this.hide(), HIDE_GRACE_MS);
  }

  show(el) {
    this.win.clearTimeout(this.hideTimer);
    if (this.owner && this.owner !== el) this.owner.removeAttribute('aria-describedby');
    this.owner = el;
    this.tip.textContent = el.dataset.tip;
    this.tip.hidden = false;
    el.setAttribute('aria-describedby', this.tip.id);
    this.place(el);
  }

  hide() {
    this.win.clearTimeout(this.showTimer);
    this.win.clearTimeout(this.hideTimer);
    this.tip.hidden = true;
    if (this.owner && this.owner.getAttribute('aria-describedby') === this.tip.id) this.owner.removeAttribute('aria-describedby');
    this.owner = null;
  }

  /** Beside the control, on the side with room; kept inside the viewport. */
  place(el) {
    const r = el.getBoundingClientRect(), t = this.tip.getBoundingClientRect();
    const vw = this.win.innerWidth, vh = this.win.innerHeight, gap = 8;
    let x, y;
    if (r.left > vw * 0.6) { x = r.left - t.width - gap; y = r.top + (r.height - t.height) / 2; } // right edge: to the left
    else if (r.right < vw * 0.4 && r.top > 40 && r.bottom < vh - 40) { x = r.right + gap; y = r.top + (r.height - t.height) / 2; }
    else if (r.top > vh * 0.5) { x = r.left + (r.width - t.width) / 2; y = r.top - t.height - gap; } // bottom: above
    else { x = r.left + (r.width - t.width) / 2; y = r.bottom + gap; }
    x = Math.max(4, Math.min(vw - t.width - 4, x));
    y = Math.max(4, Math.min(vh - t.height - 4, y));
    this.tip.style.setProperty('left', `${Math.round(x)}px`); // CSSOM, not a style attribute in markup: allowed by the CSP
    this.tip.style.setProperty('top', `${Math.round(y)}px`);
  }
}
