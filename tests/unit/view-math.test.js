import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEW } from '../../src/config.js';
import {
  defaultView, bufferToWorld, cellAt, worldToBuffer, clientToBuffer, clampView, zoomAt, panBy, viewUniforms,
} from '../../src/render/view-math.js';

const N = 128, W = 900, H = 600, MAX = VIEW.maxZoom;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('the default view is the original letterboxed square fit (display.frag.js before the World View)', () => {
  const v = defaultView(N);
  assert.deepEqual(viewUniforms(v, N), { offsetX: 0, offsetY: 0, zoom: 1 });
  const side = Math.min(W, H);
  for (const [px, py] of [[450.5, 300.5], [150.5, 0.5], [749.5, 599.5], [300, 17.25]]) {
    const original = { x: ((px - W / 2) / side + 0.5) * N, y: ((py - H / 2) / side + 0.5) * N }; // the pre-view formula
    assert.deepEqual(bufferToWorld(v, N, W, H, px, py), original);
  }
  assert.equal(bufferToWorld(v, N, W, H, 100, 300), null, 'letterbox bar: background, as before');
  assert.equal(bufferToWorld(v, N, W, H, 150, 300) !== null, true, 'left edge of the square is drawn');
  assert.equal(bufferToWorld(v, N, W, H, 750, 300), null, 'right edge is exclusive');
});

test('zooming keeps the world point under the cursor fixed', () => {
  let v = defaultView(N);
  for (const [px, py, f] of [[600, 200, 2], [610, 210, 1.7], [300, 500, 3], [455, 301, 0.5], [800, 50, 4]]) {
    const before = bufferToWorld(v, N, W, H, px, py);
    const next = zoomAt(v, N, W, H, px, py, f, MAX);
    const after = bufferToWorld(next, N, W, H, px, py);
    if (before && after) {
      const dx = ((after.x - before.x) % N + N) % N, dy = ((after.y - before.y) % N + N) % N;
      assert.ok(Math.min(dx, N - dx) < 1e-9 && Math.min(dy, N - dy) < 1e-9, `fixed point at (${px},${py}) x${f}`);
    }
    v = next;
  }
});

test('buffer -> world -> buffer round trip, including across the world edge', () => {
  const views = [defaultView(N), { cx: 3, cy: 125, zoom: 5 }, { cx: 0, cy: 0, zoom: 2.5 }, { cx: 127.9, cy: 64, zoom: 16 }];
  for (const v of views) {
    for (const [px, py] of [[450, 300], [430.25, 280.75], [460, 320], [455, 290]]) {
      const w = bufferToWorld(v, N, W, H, px, py);
      assert.ok(w, 'inside the drawn period');
      const b = worldToBuffer(v, N, W, H, w.x, w.y);
      assert.ok(close(b.px, px, 1e-6) && close(b.py, py, 1e-6), JSON.stringify({ v, px, py, b }));
    }
  }
});

test('a view centred on the world edge wraps seamlessly: no gap, neighbouring cells meet', () => {
  const v = { cx: 0, cy: 0, zoom: 8 }; // the centre pixel looks at the corner where cells (127,127) and (0,0) meet
  assert.deepEqual(cellAt(v, N, W, H, W / 2 + 1, H / 2 + 1), { x: 0, y: 0 });
  assert.deepEqual(cellAt(v, N, W, H, W / 2 - 1, H / 2 - 1), { x: N - 1, y: N - 1 });
  for (let px = 0; px < W; px += 7) for (let py = 0; py < H; py += 7) assert.ok(cellAt(v, N, W, H, px, py), 'no background at zoom 8');
});

test('y grows upwards: the bottom of the canvas shows low rows (cell (0,0) is bottom-left)', () => {
  const v = defaultView(N);
  assert.equal(cellAt(v, N, W, H, 450, 0.5).y, 0);
  assert.equal(cellAt(v, N, W, H, 450, 599.5).y, N - 1);
  const rect = { left: 10, top: 20, width: 450, height: 300 };
  assert.deepEqual(clientToBuffer(rect, W, H, 10, 320), { px: 0, py: 0 }, 'CSS bottom-left -> buffer origin');
  assert.deepEqual(clientToBuffer(rect, W, H, 460, 20), { px: W, py: H }, 'CSS top-right -> buffer top-right');
});

test('pointer mapping uses the real buffer/CSS ratio (a capped drawing buffer is smaller than CSS size x DPR)', () => {
  const rect = { left: 0, top: 0, width: 3000, height: 2000 }; // e.g. DPR 2 would give 6000x4000; the buffer is capped
  const p = clientToBuffer(rect, 2600, 1733, 1500, 1000);
  assert.ok(close(p.px, 1300) && close(p.py, 866.5));
});

test('zoom is limited to [1, VIEW.maxZoom]; the centre wraps into [0, n)', () => {
  let v = defaultView(N);
  for (let i = 0; i < 20; i++) v = zoomAt(v, N, W, H, 450, 300, 2, MAX);
  assert.equal(v.zoom, MAX);
  for (let i = 0; i < 20; i++) v = zoomAt(v, N, W, H, 450, 300, 0.5, MAX);
  assert.equal(v.zoom, 1, 'minimum zoom shows the whole world');
  v = panBy(defaultView(N), N, W, H, 10 * W, -7 * H, MAX);
  assert.ok(v.cx >= 0 && v.cx < N && v.cy >= 0 && v.cy < N);
  assert.deepEqual(clampView({ cx: -1, cy: 2 * N + 3, zoom: 99 }, N, MAX), { cx: N - 1, cy: 3, zoom: MAX });
});

test('panning moves the picture with the pointer', () => {
  const v = { cx: 64, cy: 64, zoom: 4 };
  const before = bufferToWorld(v, N, W, H, 400, 300);
  const moved = panBy(v, N, W, H, 30, -20, MAX);
  const after = bufferToWorld(moved, N, W, H, 430, 280);
  assert.ok(close(after.x, before.x, 1e-9) && close(after.y, before.y, 1e-9), 'the dragged point stays under the pointer');
});

test('periodic surround: outside the main square the mapping wraps instead of returning null (decision 35)', () => {
  const v = defaultView(N); // on 900 x 600 the main square spans x 150..750
  assert.equal(bufferToWorld(v, N, W, H, 50, 300), null, 'without the surround: background');
  assert.equal(cellAt(v, N, W, H, 50, 300), null);
  const side = Math.min(W, H);
  for (const [px, py] of [[50, 300], [10.5, 5.5], [899.5, 599.5], [140, 20]]) {
    const out = cellAt(v, N, W, H, px, py, { surround: true });
    // The same point one period (one square side) further in is inside the square and shows the same cell.
    const inside = cellAt(v, N, W, H, px < 150 ? px + side : px > 750 ? px - side : px, py, { surround: true });
    assert.deepEqual(out, inside, `(${px}, ${py})`);
    assert.ok(out.x >= 0 && out.x < N && out.y >= 0 && out.y < N);
  }
  // Inside the square the option changes nothing.
  assert.deepEqual(cellAt(v, N, W, H, 451, 299, { surround: true }), cellAt(v, N, W, H, 451, 299));
});

test('bad input is rejected: NaN, Infinity, zero or negative zoom factors leave the view unchanged', () => {
  const v = { cx: 10, cy: 20, zoom: 3 };
  for (const f of [NaN, Infinity, -Infinity, 0, -2]) assert.equal(zoomAt(v, N, W, H, 450, 300, f, MAX), v, `factor ${f}`);
  assert.equal(zoomAt(v, N, W, H, NaN, 300, 2, MAX), v);
  assert.equal(panBy(v, N, W, H, Infinity, 0, MAX), v);
  assert.equal(cellAt(v, N, W, H, NaN, 1), null);
  assert.deepEqual(clampView({ cx: NaN, cy: 0, zoom: 1 }, N, MAX), defaultView(N));
});
