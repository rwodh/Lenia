/**
 * Observatory card: shows the App's latest sample (mass, active area, centroid, the generation it describes) and a
 * mass-by-generation chart of the bounded history. Read-only: it never calls an App method that changes state.
 * Text is set with textContent only; the chart is drawn on a canvas (no markup, no inline styles).
 */
export class Observatory {
  constructor(app, root = document) {
    this.app = app;
    const q = (name) => root.querySelector(`[data-obs="${name}"]`);
    this.mass = q('mass');
    this.active = q('active');
    this.centroid = q('centroid');
    this.sample = q('sample');
    this.summary = q('summary');
    this.canvas = q('chart');
    this.ctx = this.canvas.getContext('2d');
    this.drawnVersion = -1;
    this.drawnAdds = -1;
    this.colours = null;

    // Redraw on resize (narrow layouts); the ResizeObserver callback runs outside the animation loop.
    this.resizeObserver = new ResizeObserver(() => { this.drawnVersion = -1; this.drawChart(); });
    this.resizeObserver.observe(this.canvas);
    this.unsubscribe = app.onStatus((snap) => this.render(snap));
    this.render(app.snapshot());
  }

  render(snap) {
    const obs = snap.observation;
    const latest = obs.latest;
    if (obs.status === 'unavailable') {
      for (const el of [this.mass, this.active, this.centroid]) el.textContent = '-';
      this.sample.textContent = `unavailable (${obs.reason})`;
    } else if (!latest) {
      for (const el of [this.mass, this.active, this.centroid]) el.textContent = '-';
      this.sample.textContent = 'waiting for a sample (none are taken while the GPU is behind)';
    } else {
      const c = latest.centroid;
      this.mass.textContent = latest.mass.toFixed(2);
      this.active.textContent = `${latest.activeArea} cells`;
      this.centroid.textContent = c.reason === 'no-mass' ? 'none (no mass)'
        : !c.valid ? 'not meaningful (spread out)'
        : `${c.x.toFixed(1)}, ${c.y.toFixed(1)}`;
      this.sample.textContent = `generation ${latest.generation}`;
    }
    if (snap.historyVersion !== this.drawnVersion || snap.additions.length !== this.drawnAdds) this.drawChart();
  }

  readColours() {
    const css = getComputedStyle(this.canvas);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    this.colours = { line: v('--accent', '#3fd6c8'), muted: v('--muted', '#94a0b9'), grid: v('--border', 'rgba(130,165,220,0.16)') };
  }

  drawChart() {
    const h = this.app.history, adds = this.app.additions;
    this.drawnVersion = h.version;
    this.drawnAdds = adds.length;
    const s = h.summary();
    const added = adds.length ? ` Organisms added at generation ${adds.map((a) => a.generation).join(', ')} (marked).` : '';
    const text = (s
      ? `Mass by generation, ${s.count} samples from generation ${s.from} to ${s.to}: latest ${s.latest.toFixed(2)}, lowest ${s.min.toFixed(2)}, highest ${s.max.toFixed(2)}.`
      : 'Mass by generation: no samples yet.') + added;
    this.summary.textContent = text;
    this.canvas.setAttribute('aria-label', text);

    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), ht = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== ht) { canvas.width = w; canvas.height = ht; }
    if (!this.colours) this.readColours();
    ctx.clearRect(0, 0, w, ht);
    if (!s || s.count < 2) return;

    // The vertical axis starts at 0, so small changes in mass are not magnified into dramatic swings.
    const pad = 6 * dpr, top = s.max > 0 ? s.max * 1.1 : 1;
    const x = (g) => pad + ((g - s.from) / Math.max(1, s.to - s.from)) * (w - 2 * pad);
    const y = (m) => ht - pad - (m / top) * (ht - 2 * pad);
    ctx.strokeStyle = this.colours.grid;
    ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(pad, y(0)); ctx.lineTo(w - pad, y(0)); ctx.stroke();
    // Phase 4b: a dashed vertical marker at the generation of each addition (an addition does not advance the generation, so
    // the samples just before and after it share that generation and the line jumps there).
    ctx.strokeStyle = this.colours.muted;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    for (const a of adds) {
      if (a.generation < s.from || a.generation > s.to) continue;
      ctx.beginPath(); ctx.moveTo(x(a.generation), pad); ctx.lineTo(x(a.generation), ht - pad); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = this.colours.line;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    for (let k = 0; k < s.count; k++) {
      const p = h.at(k);
      if (k === 0) ctx.moveTo(x(p.generation), y(p.mass)); else ctx.lineTo(x(p.generation), y(p.mass));
    }
    ctx.stroke();
    ctx.fillStyle = this.colours.muted;
    ctx.font = `${10 * dpr}px ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(top.toFixed(1), pad, pad);
  }
}
