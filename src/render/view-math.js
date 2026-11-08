/**
 * World View maths: the JS twin of the mapping in src/shaders/display.frag.js (pure; no DOM, no GL; unit-tested).
 * Display only: nothing here touches the simulation state.
 *
 * A view is { cx, cy, zoom }: the world position (in cells, continuous, cell centres at +0.5) shown at the centre of the
 * canvas, and the magnification relative to the default fit. Positions on the canvas are drawing-buffer pixels with the
 * origin at the bottom-left, as gl_FragCoord (convert pointer positions with clientToBuffer first).
 *
 * The mapping matches src/shaders/display.frag.js exactly:
 *   uv  = (p - size / 2) / (side * zoom) + 0.5,   side = min(width, height)
 *   pos = uv * n + (c - n / 2)
 * so the default view (c = n/2, zoom 1) is the original letterboxed square fit. Only uv in [0, 1) is drawn: one period of
 * the periodic world around the view centre. A window that crosses the world's edge wraps seamlessly (pos is taken modulo n);
 * background appears only where the window is wider than one whole period, i.e. never once zoom >= the canvas aspect ratio.
 */

export const defaultView = (n) => ({ cx: n / 2, cy: n / 2, zoom: 1 });

const wrap = (v, n) => ((v % n) + n) % n;
const finite = (...xs) => xs.every(Number.isFinite);

/** World position (cells, continuous, not wrapped) under buffer pixel (px, py), or null outside the drawn period. */
export function bufferToWorld(view, n, width, height, px, py) {
  const s = Math.min(width, height) * view.zoom;
  const u = (px - width / 2) / s + 0.5;
  const v = (py - height / 2) / s + 0.5;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return { x: u * n + (view.cx - n / 2), y: v * n + (view.cy - n / 2) };
}

/** The cell { x, y } (integers in [0, n)) under buffer pixel (px, py), or null outside the drawn period. */
export function cellAt(view, n, width, height, px, py) {
  if (!finite(px, py)) return null;
  const w = bufferToWorld(view, n, width, height, px, py);
  return w && { x: wrap(Math.floor(w.x), n), y: wrap(Math.floor(w.y), n) };
}

/**
 * Buffer pixel at which world position (x, y) is drawn, choosing the periodic copy nearest the view centre.
 * Inverse of bufferToWorld wherever that is defined.
 */
export function worldToBuffer(view, n, width, height, x, y) {
  const s = Math.min(width, height) * view.zoom;
  const dx = wrap(x - view.cx + n / 2, n) - n / 2; // offset from the centre, in (-n/2, n/2]
  const dy = wrap(y - view.cy + n / 2, n) - n / 2;
  return { px: width / 2 + (dx / n) * s, py: height / 2 + (dy / n) * s };
}

/** Pointer position (CSS px, from a DOMRect) to drawing-buffer pixels. Uses the real buffer/CSS ratio, which differs from the
 *  device pixel ratio when the buffer is capped (LIMITS.maxCanvasPixels); flips y to the bottom-left origin. */
export function clientToBuffer(rect, bufferWidth, bufferHeight, clientX, clientY) {
  return {
    px: (clientX - rect.left) * (bufferWidth / rect.width),
    py: (rect.top + rect.height - clientY) * (bufferHeight / rect.height),
  };
}

/** The view with its zoom limited to [1, maxZoom] and its centre wrapped into [0, n). Non-finite input gives `fallback`. */
export function clampView(view, n, maxZoom, fallback = defaultView(n)) {
  if (!view || !finite(view.cx, view.cy, view.zoom)) return fallback;
  return { cx: wrap(view.cx, n), cy: wrap(view.cy, n), zoom: Math.min(maxZoom, Math.max(1, view.zoom)) };
}

/**
 * Zoom by `factor` keeping the world point under buffer pixel (px, py) fixed (the cursor's cell stays under the cursor).
 * Bad input (non-finite or non-positive factor) returns the view unchanged.
 */
export function zoomAt(view, n, width, height, px, py, factor, maxZoom) {
  if (!finite(px, py, factor) || factor <= 0) return view;
  const zoom = Math.min(maxZoom, Math.max(1, view.zoom * factor));
  const s0 = n / (Math.min(width, height) * view.zoom); // cells per buffer pixel
  const s1 = n / (Math.min(width, height) * zoom);
  const dx = px - width / 2, dy = py - height / 2;
  return clampView({ cx: view.cx + dx * (s0 - s1), cy: view.cy + dy * (s0 - s1), zoom }, n, maxZoom, view);
}

/** Move the view so the picture follows a drag of (dpx, dpy) buffer pixels (y up). Bad input returns the view unchanged. */
export function panBy(view, n, width, height, dpx, dpy, maxZoom) {
  if (!finite(dpx, dpy)) return view;
  const s = n / (Math.min(width, height) * view.zoom);
  return clampView({ cx: view.cx - dpx * s, cy: view.cy - dpy * s, zoom: view.zoom }, n, maxZoom, view);
}

/**
 * Shader uniforms for a view: the offset added to uv * n, and the zoom. The offset is wrapped into [0, n) (the same picture,
 * since the world is periodic), so the sample position is never negative. The bilinear footprint can still reach index -1
 * at the lowest edge; cell() in display.frag.js adds n before `%` so both operands stay non-negative (GLSL ES leaves `%`
 * undefined for a negative operand).
 */
export const viewUniforms = (view, n) => ({ offsetX: wrap(view.cx - n / 2, n), offsetY: wrap(view.cy - n / 2, n), zoom: view.zoom });
