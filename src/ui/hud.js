/**
 * Read-only status display: the status chip (state, generation, GPU-limited badge), the Status panel (generation, pattern,
 * world, render rate, state format) and the note toast. Uses textContent only, never innerHTML.
 */
const genText = (g) => Number(g).toLocaleString('en-US'); // 1,234

export class Hud {
  constructor(root = document) {
    const q = (name) => root.querySelector(`[data-hud="${name}"]`);
    this.state = q('state');
    this.chipGen = q('chip-gen');
    this.gpuBadge = q('gpu-badge');
    this.gen = q('gen');
    this.pattern = q('pattern');
    this.world = q('world');
    this.render = q('render');
    this.format = q('format');
    this.radius = q('radius');
    this.note = q('note');
    this.toast = q('toast');
    this.noteClose = q('note-close');
    this.noteText = '';
    this.noteDismissed = false;
    this.noteClose?.addEventListener('click', () => {
      this.noteDismissed = true;
      this.showNote();
    });
  }

  /** Immediate update on user actions (the periodic update() below only runs a few times a second). */
  setRunState(paused, generation) {
    this.state.textContent = paused ? 'Paused' : 'Running';
    this.state.dataset.state = paused ? 'paused' : 'running';
    this.gen.textContent = String(generation);
    if (this.chipGen) this.chipGen.textContent = genText(generation);
  }

  update({ paused, generation, fps, gridSize, radius, format, gpuBound, patternLabel }) {
    this.setRunState(paused, generation);
    this.pattern.textContent = patternLabel || '-';
    this.world.textContent = `${gridSize} x ${gridSize}  |  R = ${radius}`;
    this.render.textContent = `${fps.toFixed(fps < 10 ? 1 : 0)} fps` + (gpuBound ? '  |  GPU-limited' : '');
    if (this.format) this.format.textContent = format;
    if (this.gpuBadge) this.gpuBadge.hidden = !gpuBound;
    this.radius.textContent = String(radius);
  }

  /** Immediate pattern-name update (the periodic update() also sets it). */
  setPattern(label) {
    this.pattern.textContent = label || '-';
  }

  /**
   * Show a note in the toast area, or clear it with ''. A `persistent` note describes a condition that still holds (for example
   * a lost graphics context), so it has no close button; any other note can be dismissed until a different note replaces it.
   */
  setNote(text, { persistent = false } = {}) {
    if (text !== this.noteText) this.noteDismissed = false;
    this.noteText = text;
    this.notePersistent = persistent;
    this.showNote();
  }

  showNote() {
    const visible = !!this.noteText && !this.noteDismissed;
    this.note.textContent = this.noteText;
    this.note.hidden = !visible;
    if (this.toast) this.toast.hidden = !visible;
    if (this.noteClose) this.noteClose.hidden = this.notePersistent;
  }
}
