/** Read-only status display (state pill, generation, pattern, world, render rate). Uses textContent only, never innerHTML. */
export class Hud {
  constructor(root = document) {
    const q = (name) => root.querySelector(`[data-hud="${name}"]`);
    this.state = q('state');
    this.gen = q('gen');
    this.pattern = q('pattern');
    this.world = q('world');
    this.render = q('render');
    this.radius = q('radius');
    this.note = q('note');
  }

  /** Immediate update on user actions (the periodic update() below only runs a few times a second). */
  setRunState(paused, generation) {
    this.state.textContent = paused ? 'Paused' : 'Running';
    this.state.dataset.state = paused ? 'paused' : 'running';
    this.gen.textContent = String(generation);
  }

  update({ paused, generation, fps, gridSize, radius, format, gpuBound, patternLabel }) {
    this.setRunState(paused, generation);
    this.pattern.textContent = patternLabel || '-';
    this.world.textContent = `${gridSize} x ${gridSize}  |  R = ${radius}`;
    this.render.textContent =
      `${fps.toFixed(fps < 10 ? 1 : 0)} fps  |  ${format}` + (gpuBound ? '  |  GPU-limited' : '');
    this.radius.textContent = String(radius);
  }

  setNote(text) {
    this.note.textContent = text;
    this.note.hidden = !text;
  }
}
