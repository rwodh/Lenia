import { VIEW } from '../config.js';
import { clientToBuffer } from '../render/view-math.js';

/**
 * World View input: drag and pinch (pointer events), wheel, buttons, keys (+ / - / 0 anywhere outside text fields; arrow keys
 * when the canvas has focus), and the "Cell (x, y)" readout under the pointer. Every action calls an App method; the App owns
 * the view (display only: nothing here can change the simulation). Text via textContent only.
 *
 * While the guided tour is modal the app root is inert (no pointer or focus reaches the canvas) and the keys are ignored.
 * `onClick(cell)` (optional) receives a click on the world that did not become a drag; placement uses it.
 */
export class ViewControls {
  constructor(app, root = document, { onClick = null } = {}) {
    this.app = app;
    this.canvas = app.canvas;
    this.cellOut = root.querySelector('[data-view="cell"]');
    this.tourEl = root.getElementById('tour');
    this.onClick = onClick;
    this.pointers = new Map(); // pointerId -> { x, y } (CSS px, client coordinates)
    this.press = null; // { id, x, y, moved } for the first pointer of a gesture, to tell a click from a drag

    for (const btn of root.querySelectorAll('[data-view-action]')) {
      btn.addEventListener('click', () => this.action(btn.dataset.viewAction));
    }
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
    c.addEventListener('pointerleave', () => { if (!this.pointers.size) this.showCell(null); });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    root.addEventListener('keydown', (e) => this.onKey(e));
  }

  action(name) {
    if (name === 'zoom-in') this.app.zoomBy(VIEW.stepFactor);
    else if (name === 'zoom-out') this.app.zoomBy(1 / VIEW.stepFactor);
    else if (name === 'reset') this.app.resetView();
  }

  /** Client (CSS px) position -> drawing-buffer pixel, using the canvas's real buffer/CSS ratio. */
  toBuffer(clientX, clientY) {
    return clientToBuffer(this.canvas.getBoundingClientRect(), this.canvas.width, this.canvas.height, clientX, clientY);
  }

  /** CSS-pixel movement -> buffer-pixel movement (y up). */
  scaleDelta(dx, dy) {
    const rect = this.canvas.getBoundingClientRect();
    return { dx: dx * (this.canvas.width / rect.width), dy: -dy * (this.canvas.height / rect.height) };
  }

  onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer (synthetic event): no capture needed */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.press = this.pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false } : null;
    this.canvas.classList.add('dragging');
  }

  onPointerMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) { // hover: readout only
      const b = this.toBuffer(e.clientX, e.clientY);
      this.showCell(this.app.cellAt(b.px, b.py));
      return;
    }
    if (this.pointers.size === 1) {
      const d = this.scaleDelta(e.clientX - p.x, e.clientY - p.y);
      if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > VIEW.clickSlopPx) this.press.moved = true;
      if (!this.press || this.press.moved) this.app.panBy(d.dx, d.dy);
      else return; // within the click slop: do not move yet (and keep the reference point)
    } else if (this.pointers.size === 2) {
      // Pinch: zoom by the change in finger distance about the midpoint, and pan by the midpoint's movement.
      const [a, b] = [...this.pointers.entries()].map(([id, q]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : q));
      const [a0, b0] = [...this.pointers.values()];
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a.x - b.x, a.y - b.y);
      const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const pan = this.scaleDelta(m1.x - m0.x, m1.y - m0.y);
      this.app.panBy(pan.dx, pan.dy);
      if (d0 > 0 && d1 > 0) {
        const mb = this.toBuffer(m1.x, m1.y);
        this.app.zoomAt(mb.px, mb.py, d1 / d0);
      }
    }
    p.x = e.clientX;
    p.y = e.clientY;
    const b = this.toBuffer(e.clientX, e.clientY);
    this.showCell(this.app.cellAt(b.px, b.py));
  }

  onPointerUp(e, cancelled = false) {
    if (!this.pointers.delete(e.pointerId)) return;
    const press = this.press;
    if (press && press.id === e.pointerId && !press.moved && !cancelled && this.onClick) {
      const b = this.toBuffer(e.clientX, e.clientY);
      const cell = this.app.cellAt(b.px, b.py);
      if (cell) this.onClick(cell);
    }
    this.press = null; // a gesture that lost a finger does not turn into a click
    if (!this.pointers.size) this.canvas.classList.remove('dragging');
  }

  onWheel(e) {
    e.preventDefault(); // the wheel zooms the view instead of scrolling the page
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.canvas.getBoundingClientRect().height : 1; // lines, pages
    const factor = Math.exp(-e.deltaY * unit * VIEW.wheelPerPixel);
    if (!Number.isFinite(factor)) return;
    const f = Math.min(VIEW.wheelMaxFactor, Math.max(1 / VIEW.wheelMaxFactor, factor));
    const b = this.toBuffer(e.clientX, e.clientY);
    this.app.zoomAt(b.px, b.py, f);
    this.showCell(this.app.cellAt(b.px, b.py));
  }

  onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (this.tourEl?.dataset.modal === 'true' && !this.tourEl.hidden) return;
    let handled = true;
    if (e.key === '+' || e.key === '=') this.action('zoom-in');
    else if (e.key === '-' || e.key === '_') this.action('zoom-out');
    else if (e.key === '0') this.action('reset');
    else if (t === this.canvas && e.key.startsWith('Arrow')) {
      const step = Math.min(this.canvas.width, this.canvas.height) * VIEW.keyPanFraction; // buffer px of the visible square
      const [dx, dy] = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] || [0, 0];
      this.app.panBy(dx, dy); // the arrow moves the view over the world: Right shows what lies to the right
    } else handled = false;
    if (handled) e.preventDefault();
  }

  showCell(cell) {
    if (this.cellOut) this.cellOut.textContent = cell ? `Cell (${cell.x}, ${cell.y})` : 'Cell: -';
  }
}
