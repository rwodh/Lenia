/** Read-only status display. Uses textContent only, never innerHTML. */
export class Hud {
  constructor(root) {
    this.line = root.querySelector('[data-hud="line"]');
    this.note = root.querySelector('[data-hud="note"]');
  }

  update({ generation, fps, gridSize, radius, format, gpuBound }) {
    this.line.textContent =
      `gen ${generation}  |  ${fps.toFixed(fps < 10 ? 1 : 0)} fps  |  ${gridSize}x${gridSize}  |  R=${radius}  |  ${format}` +
      (gpuBound ? '  |  GPU-limited' : '');
  }

  setNote(text) {
    this.note.textContent = text;
    this.note.hidden = !text;
  }
}
