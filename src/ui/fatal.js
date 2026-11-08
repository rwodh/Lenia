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

/** Hide the panel again, after the app has recovered (a later successful context restore). */
export function hideFatal(panel) {
  panel.hidden = true;
  panel.querySelector('[data-fatal="message"]').textContent = '';
  const detail = panel.querySelector('[data-fatal="detail"]');
  detail.textContent = '';
  detail.hidden = true;
}
