/** Full-screen, user-facing error panel. Uses textContent only, never innerHTML. */
export function showFatal(panel, error) {
  const known = error && typeof error.userMessage === 'string';
  panel.querySelector('[data-fatal="message"]').textContent = known
    ? error.userMessage
    : 'Something went wrong while starting the simulation.';
  const detail = panel.querySelector('[data-fatal="detail"]');
  const text = known ? error.detail : String(error && error.message ? error.message : error);
  detail.textContent = text || '';
  detail.hidden = !text;
  panel.hidden = false;
}
