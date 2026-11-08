// Runs in a real WebGL2 browser. Verifies the GPU shaders against the CPU reference,
// the display colour map, shader-error reporting and the asynchronous state readback. Prints PASS/FAIL per check.
import { createGLContext } from '../../src/gl/context.js';
import { createProgram } from '../../src/gl/program.js';
import { LeniaSimulation } from '../../src/simulation/lenia.js';
import { Renderer } from '../../src/render/renderer.js';
import { normalizeParams } from '../../src/simulation/params.js';
import { buildKernel } from '../../src/simulation/kernel.js';
import { stepReference } from '../../src/simulation/reference.js';
import { randomDiscSeed } from '../../src/simulation/seed.js';
import { LeniaError } from '../../src/errors.js';
import { AsyncReadback } from '../../src/gl/readback.js';
import { defaultView, viewUniforms, worldToBuffer, cellAt } from '../../src/render/view-math.js';
import { OverlayAccumulator, OVERLAY_MODE } from '../../src/gl/overlay.js';
import { StampPass } from '../../src/gl/stamp.js';
import { stampMax } from '../../src/simulation/seed.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { ORBIUM_O2U } from '../../src/simulation/patterns.js';
import fullscreenVert from '../../src/shaders/fullscreen.vert.js';
import preViewFrag from '../fixtures/display-pre-view.frag.js';
import { SURROUND } from '../../src/config.js';

const out = document.getElementById('result');
const lines = [];
let failures = 0;
const log = (text, cls = '') => lines.push({ text, cls });
const check = (name, ok, extra = '') => {
  if (!ok) failures++;
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`, ok ? 'pass' : 'fail');
};
const maxAbsDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

function parity(gl, caps, label, raw, steps) {
  const { params } = normalizeParams(raw);
  const n = params.gridSize;
  const seed = randomDiscSeed(n, { radiusFraction: 0.4, seed: params.seed });
  const sim = new LeniaSimulation(gl, caps, params);
  sim.reset(seed);
  const kernel = buildKernel(params.radius);
  let cpu = seed;
  for (let t = 1; t <= steps; t++) {
    sim.step();
    cpu = stepReference(cpu, n, kernel, params);
    if (t === 1 || t === steps) {
      const gpu = sim.readState();
      const diff = maxAbsDiff(gpu, cpu);
      const tol = caps.stateFormat.name === 'float32' ? 1e-3 : 1e-2;
      const mass = gpu.reduce((s, v) => s + v, 0);
      check(`${label}: GPU == CPU after ${t} step(s)`, diff <= tol && mass > 0, `maxAbsDiff=${diff.toExponential(2)} tol=${tol} mass=${mass.toFixed(1)}`);
    }
  }
  check(`${label}: generation counter`, sim.generation === steps, `generation=${sim.generation}`);
  sim.dispose();
}

try {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64; // non-square on purpose: exercises letterboxing
  const { gl, caps } = createGLContext(canvas);
  log(`renderer: ${caps.renderer}`);
  log(`state format: ${caps.stateFormat.name}, max texture ${caps.maxTextureSize}, max viewport ${caps.maxViewport.join('x')}`);
  check('WebGL2 context + renderable float format', true);

  // 1. Shader error reporting
  try {
    createProgram(gl, 'broken', '#version 300 es\nvoid main(){ gl_Position = vec4(0.); }', '#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main(){ o = nonsense; }');
    check('broken shader reports SHADER_COMPILE', false, 'no error thrown');
  } catch (e) {
    check('broken shader reports SHADER_COMPILE', e instanceof LeniaError && e.code === 'SHADER_COMPILE' && e.detail.length > 0, `detail="${e.detail.trim().split('\n')[0]}"`);
  }

  // 2. GPU vs CPU reference
  parity(gl, caps, 'narrow growth (mu .15 sigma .015, R=13)', { gridSize: 64, radius: 13, seed: 3 }, 5);
  parity(gl, caps, 'wide growth (mu .5 sigma .1, R=5)', { gridSize: 64, radius: 5, mu: 0.5, sigma: 0.1, timeSteps: 4, seed: 11 }, 5);
  parity(gl, caps, 'grid 128, R=7', { gridSize: 128, radius: 7, mu: 0.3, sigma: 0.05, seed: 5 }, 2);

  // 3. Display pass: letterbox background and colour-map endpoints
  const { params } = normalizeParams({ gridSize: 64, radius: 5 });
  const sim = new LeniaSimulation(gl, caps, params);
  const renderer = new Renderer(gl, canvas, caps);
  const px = (x, y) => { const b = new Uint8Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b); };
  const near = (rgba, rgb, tol) => rgb.every((v, i) => Math.abs(rgba[i] - v) <= tol); // compares R,G,B only

  sim.reset(new Float32Array(64 * 64)); // all zeros
  renderer.draw(sim.stateTexture, 64);
  const bg = px(2, 32), zero = px(64, 32);
  check('letterbox region is the background colour', near(bg, [11, 13, 18], 2), `rgb=${bg.slice(0, 3)}`);
  check('state 0 maps to viridis(0) dark purple', near(zero, [71, 1, 85], 3), `rgb=${zero.slice(0, 3)}`);

  sim.reset(new Float32Array(64 * 64).fill(1));
  renderer.draw(sim.stateTexture, 64);
  const one = px(64, 32);
  check('state 1 maps to viridis(1) yellow', near(one, [252, 231, 33], 6), `rgb=${one.slice(0, 3)}`);
  check('no pending GL error after rendering', gl.getError() === gl.NO_ERROR);
  sim.dispose(); renderer.dispose();

  // 3b. World View (display only). The default view must draw exactly the bytes of the shader as it was before the view
  //     existed (frozen copy in tests/fixtures), and the JS mapping (src/render/view-math.js) must predict where the shader
  //     draws a given cell, including in a window that straddles the world's edges.
  {
    const n = 64;
    const vsim = new LeniaSimulation(gl, caps, normalizeParams({ gridSize: n, radius: 5 }).params);
    const vren = new Renderer(gl, canvas, caps);
    const old = createProgram(gl, 'display-pre-view', fullscreenVert, preViewFrag, ['uState', 'uGridSize', 'uCanvasSize', 'uPalette']);
    const vao = gl.createVertexArray();
    const snap = () => {
      const b = new Uint8Array(canvas.width * canvas.height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    };
    const drawOld = (palette) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      old.use();
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, vsim.stateTexture);
      gl.uniform1i(old.uniforms.uState, 0);
      gl.uniform1i(old.uniforms.uGridSize, n);
      gl.uniform2f(old.uniforms.uCanvasSize, canvas.width, canvas.height);
      gl.uniform1i(old.uniforms.uPalette, palette);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    vsim.reset(randomDiscSeed(n, { radiusFraction: 0.45, seed: 7 }));
    let differing = 0, worst = 0, compared = 0;
    for (const [w, h] of [[128, 64], [97, 131], [200, 200], [333, 120]]) {
      canvas.width = w; canvas.height = h;
      for (const palette of [0, 1]) {
        vren.setPalette(palette ? 'observatory' : 'viridis');
        vren.draw(vsim.stateTexture, n, viewUniforms(defaultView(n), n));
        const now = snap();
        drawOld(palette);
        const before = snap();
        for (let i = 0; i < now.length; i++) { const d = Math.abs(now[i] - before[i]); if (d) differing++; worst = Math.max(worst, d); }
        compared += now.length;
      }
    }
    check('World View: the default view draws byte-identical pixels to the pre-view shader (4 canvas sizes, both palettes)',
      worst === 0, `differing bytes=${differing} of ${compared}, max difference=${worst}`);

    // A field with two lit cells; one is the corner cell (63, 0), whose neighbours across both edges are (0, 0) and (63, 63).
    canvas.width = 160; canvas.height = 96;
    const W = canvas.width, H = canvas.height;
    const field = new Float32Array(n * n);
    field[0 * n + 63] = 1;
    field[12 * n + 41] = 1;
    vsim.reset(field);
    vren.setPalette('viridis');
    const pixelAt = (x, y) => {
      const b = new Uint8Array(4);
      gl.readPixels(Math.floor(x), Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return Array.from(b);
    };
    const bright = (c) => c[0] > 150 && c[1] > 180; // viridis near 1 (yellow)
    const dark = (c) => near(c, [71, 1, 85], 3); // viridis(0)
    const cases = [
      { label: 'window straddling both world edges (centre at the world corner, zoom 8)', view: { cx: 0, cy: 0, zoom: 8 }, cell: [63, 0], far: [[2, 0], [63, 61], [60, 0]] },
      { label: 'panned and zoomed (zoom 3)', view: { cx: 41.3, cy: 12.8, zoom: 3 }, cell: [41, 12], far: [[44, 12], [41, 9], [38, 15]] },
      { label: 'maximum zoom (16)', view: { cx: 63.9, cy: 0.2, zoom: 16 }, cell: [63, 0], far: [[61, 0]] },
    ];
    for (const { label, view, cell, far } of cases) {
      vren.draw(vsim.stateTexture, n, viewUniforms(view, n));
      const p = worldToBuffer(view, n, W, H, cell[0] + 0.5, cell[1] + 0.5);
      const at = pixelAt(p.px, p.py);
      const jsCell = cellAt(view, n, W, H, Math.floor(p.px) + 0.5, Math.floor(p.py) + 0.5);
      const farOk = far.every(([x, y]) => {
        const q = worldToBuffer(view, n, W, H, x + 0.5, y + 0.5);
        return q.px < 0 || q.py < 0 || q.px >= W || q.py >= H || dark(pixelAt(q.px, q.py));
      });
      check(`World View: JS mapping predicts the drawn cell, ${label}`,
        bright(at) && jsCell && jsCell.x === cell[0] && jsCell.y === cell[1] && farOk,
        `cell (${cell}) -> pixel (${p.px.toFixed(1)}, ${p.py.toFixed(1)}) rgb=${at.slice(0, 3)}; JS cell there (${jsCell && [jsCell.x, jsCell.y]})`);
    }
    // Seamless wrap: at zoom 8 centred on the world corner no pixel shows the background colour.
    vren.draw(vsim.stateTexture, n, viewUniforms({ cx: 0, cy: 0, zoom: 8 }, n));
    const all = snap();
    let bgPixels = 0;
    for (let i = 0; i < all.length; i += 4) if (near([all[i], all[i + 1], all[i + 2]], [11, 13, 18], 2)) bgPixels++;
    check('World View: a window straddling the world edges wraps seamlessly (no background pixel at zoom 8)', bgPixels === 0, `background pixels=${bgPixels}`);
    check('World View: no pending GL error', gl.getError() === gl.NO_ERROR);

    // 3c. Periodic surround (decision 35). (1) With it on, every pixel the pre-view shader drew inside the main square is
    //     byte-identical (only the old background pixels change). (2) A surround pixel is the dimmed colour of the same cell
    //     one period away, inside the square: the shader multiplies the unrounded colour by SURROUND.dim, so within 1 LSB.
    //     (3) A faint boundary line appears where a period edge crosses pixel centres. With it off, the old bars return: that
    //     is the default-view check above (Renderer.draw without a surround draws the background, as before).
    vsim.reset(randomDiscSeed(n, { radiusFraction: 0.45, seed: 7 }));
    const BG = [11, 13, 18];
    let insideCompared = 0, insideDiffering = 0, outsideChanged = 0;
    for (const [w, h] of [[128, 64], [97, 131], [200, 200], [333, 120]]) {
      canvas.width = w; canvas.height = h;
      for (const palette of [0, 1]) {
        vren.setPalette(palette ? 'observatory' : 'viridis');
        vren.draw(vsim.stateTexture, n, viewUniforms(defaultView(n), n), null, SURROUND);
        const now = snap();
        drawOld(palette);
        const before = snap();
        for (let i = 0; i < now.length; i += 4) {
          const wasBg = near([before[i], before[i + 1], before[i + 2]], BG, 0);
          if (wasBg) { if (now[i] !== before[i] || now[i + 1] !== before[i + 1] || now[i + 2] !== before[i + 2]) outsideChanged++; continue; }
          insideCompared++;
          if (now[i] !== before[i] || now[i + 1] !== before[i + 1] || now[i + 2] !== before[i + 2]) insideDiffering++;
        }
      }
    }
    check('Surround on: the main square is byte-identical to the pre-view shader (4 canvas sizes, both palettes)',
      insideDiffering === 0 && insideCompared > 0 && outsideChanged > 0,
      `inside pixels compared=${insideCompared}, differing=${insideDiffering}; outside pixels now drawn=${outsideChanged}`);

    // (2) 200 x 100: the square is x 50..149 (side 100, a whole number), so the period edges fall between pixel columns; the
    //     columns right next to an edge (49, 150) are exactly 0.5 px from it, where drawing the 1 px line depends on float
    //     rounding, so the samples stay at least one column away. The same holds for the top and bottom rows (the horizontal
    //     period edges are at y = 0 and 100), so rows 1..98 are used. Pixel x outside matches pixel x +/- 100 inside.
    canvas.width = 200; canvas.height = 100;
    let worstDim = 0, dimCompared = 0;
    for (const palette of [0, 1]) {
      vren.setPalette(palette ? 'observatory' : 'viridis');
      vren.draw(vsim.stateTexture, n, viewUniforms(defaultView(n), n), null, SURROUND);
      const img = snap();
      for (let y = 1; y < 99; y++) {
        for (const x of [0, 7, 25, 48, 151, 170, 199]) {
          const xi = x < 50 ? x + 100 : x - 100, o = (y * 200 + x) * 4, q = (y * 200 + xi) * 4;
          for (let k = 0; k < 3; k++) worstDim = Math.max(worstDim, Math.abs(img[o + k] - Math.round(img[q + k] * SURROUND.dim)));
          dimCompared++;
        }
      }
    }
    check('Surround on: a surround pixel equals the dimmed colour of the wrapped cell (within 1 LSB)', worstDim <= 1 && dimCompared > 0,
      `pixels compared=${dimCompared}, max difference=${worstDim} (dim ${SURROUND.dim})`);

    // (3) 201 x 100: the square starts at x = 50.5, so the right edge (uv = 1) runs through the centres of column 150, which is
    //     outside the square and gets the line colour: mix(dimmed, white, SURROUND.line).
    canvas.width = 201; canvas.height = 100;
    vren.setPalette('viridis');
    vren.draw(vsim.stateTexture, n, viewUniforms(defaultView(n), n), null, SURROUND);
    const lineImg = snap();
    let lineWorst = 0;
    for (let y = 0; y < 100; y++) {
      const o = (y * 201 + 150) * 4, inner = (y * 201 + 50) * 4; // column 50 is the same world column, inside the square
      for (let k = 0; k < 3; k++) {
        const expected = Math.round(255 * ((lineImg[inner + k] / 255) * SURROUND.dim * (1 - SURROUND.line) + SURROUND.line));
        lineWorst = Math.max(lineWorst, Math.abs(lineImg[o + k] - expected));
      }
    }
    check('Surround on: the period boundary is drawn as a faint line (mixed towards white by SURROUND.line, within 2 LSB)',
      lineWorst <= 2, `max difference from the expected line colour=${lineWorst}`);
    check('Surround: no pending GL error', gl.getError() === gl.NO_ERROR);
    gl.deleteVertexArray(vao); gl.deleteProgram(old.program); vren.dispose(); vsim.dispose();
    canvas.width = 128; canvas.height = 64;
  }

  // 4. Asynchronous readback (Observatory): exact copy, tag = generation at submission, one request in flight,
  //    float32 and float16 state formats. Polling uses setTimeout here; nothing waits on the GPU.
  const waitResult = async (rb) => {
    for (let i = 0; i < 2000; i++) { const r = rb.poll(); if (r) return r; await new Promise((ok) => setTimeout(ok, 0)); }
    return null;
  };
  const formats = [['float32', caps.stateFormat]];
  if (caps.stateFormat.name === 'float32') formats.push(['float16', { name: 'float16', internalFormat: 'R16F' }]);
  for (const [fname, stateFormat] of formats) {
    for (const n of [64, 128]) {
      const { params: p } = normalizeParams({ gridSize: n, radius: 13, seed: 9 });
      const s = new LeniaSimulation(gl, { ...caps, stateFormat }, p);
      s.reset(randomDiscSeed(n, { radiusFraction: 0.4, seed: 9 }));
      for (let t = 0; t < 3; t++) s.step();
      const rb = new AsyncReadback(gl, n);
      const before = s.readState(), tagGen = s.generation;
      const queued = rb.request(s.stateFramebuffer, { generation: tagGen });
      const second = rb.request(s.stateFramebuffer, { generation: -1 });
      for (let t = 0; t < 5; t++) s.step(); // the state moves on after submission
      const r = await waitResult(rb);
      check(`readback ${fname} grid ${n}: one request in flight, result arrives without blocking`, queued && !second && !!r, `components=${rb.components}`);
      check(`readback ${fname} grid ${n}: copy equals the state at submission exactly; tag = generation at submission`,
        !!r && maxAbsDiff(r.state, before) === 0 && r.tag.generation === tagGen && s.generation === tagGen + 5,
        r ? `maxAbsDiff=${maxAbsDiff(r.state, before)} tag=${r.tag.generation} now=${s.generation}` : 'no result');
      rb.dispose(); s.dispose();
    }
  }
  check('no pending GL error after readbacks', gl.getError() === gl.NO_ERROR);

  // 5. Readback leaves the caller's bindings as they were (READ_FRAMEBUFFER, DRAW_FRAMEBUFFER, PIXEL_PACK_BUFFER),
  //    also when a call inside request() throws, so later readPixels into client memory still works.
  {
    const { params: p } = normalizeParams({ gridSize: 64, radius: 13, seed: 4 });
    const a = new LeniaSimulation(gl, caps, p), b = new LeniaSimulation(gl, caps, p);
    a.reset(randomDiscSeed(64, { radiusFraction: 0.4, seed: 4 })); b.reset(randomDiscSeed(64, { radiusFraction: 0.3, seed: 8 }));
    const expected = b.readState(); // before the sentinel pack buffer is bound (readState reads into client memory)
    const sentinel = gl.createBuffer();
    const bindings = () => [gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING), gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING)];
    const same = (x, y) => x.every((v, i) => v === y[i]);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, a.stateFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, sentinel);
    const before = bindings();
    const rb = new AsyncReadback(gl, 64);
    rb.request(b.stateFramebuffer, { generation: 0 });
    const afterRequest = bindings();
    const r = await waitResult(rb);
    const afterPoll = bindings();
    check('readback restores READ/DRAW framebuffer and pixel-pack bindings after request() and poll()',
      same(before, afterRequest) && same(before, afterPoll) && !!r && maxAbsDiff(r.state, expected) === 0);
    const realReadPixels = gl.readPixels;
    gl.readPixels = () => { throw new Error('forced failure'); };
    let threw = false;
    try { rb.request(b.stateFramebuffer, { generation: 1 }); } catch { threw = true; }
    delete gl.readPixels; // back to the prototype's method
    const afterThrow = bindings();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    let readOk = true;
    try { b.readState(); } catch { readOk = false; }
    check('readback restores bindings when a call inside request() throws; readState() still works and no GL error remains',
      threw && gl.readPixels === realReadPixels && same(before, afterThrow) && !rb.busy && readOk && gl.getError() === gl.NO_ERROR);
    rb.dispose(); a.dispose(); b.dispose(); gl.deleteBuffer(sentinel);
  }

  // 5. Visualization aids (trails, activity): display only. The state with an aid accumulating every step must be identical
  //    to the state without it, and the accumulated values must match the same rule computed on the CPU from the GPU states.
  {
    const { params: ap } = normalizeParams({ gridSize: 64, radius: 13, seed: 21 });
    const seed = randomDiscSeed(64, { radiusFraction: 0.3, seed: 21 });
    const withAid = new LeniaSimulation(gl, caps, ap), without = new LeniaSimulation(gl, caps, ap);
    withAid.reset(seed); without.reset(seed);
    const ov = new OverlayAccumulator(gl, caps, 64);
    const f32 = Math.fround, tol = caps.stateFormat.name === 'float32' ? 1e-6 : 1e-2;
    let cpu = new Float32Array(64 * 64), prev = withAid.readState(), worstAid = 0;
    for (const [mode, decay, label] of [[OVERLAY_MODE.trails, 0.9, 'trails'], [OVERLAY_MODE.activity, 0.95, 'activity']]) {
      ov.clear(); cpu = new Float32Array(64 * 64);
      for (let t = 0; t < 15; t++) {
        withAid.step();
        ov.accumulate(withAid.stateTexture, withAid.previousTexture, mode, decay);
        without.step();
        const a = withAid.readState();
        for (let i = 0; i < cpu.length; i++) {
          cpu[i] = mode === OVERLAY_MODE.trails ? Math.max(f32(cpu[i] * f32(decay)), a[i]) : f32(f32(cpu[i] * f32(decay)) + Math.abs(a[i] - prev[i]));
        }
        prev = a;
      }
      const gpu = ov.readValues(), d = maxAbsDiff(gpu, cpu);
      worstAid = Math.max(worstAid, d);
      check(`aid (${label}): accumulated values equal the per-step rule computed on the CPU from the GPU states`, d <= tol && cpu.some((v) => v > 0),
        `maxAbsDiff=${d.toExponential(2)} tol=${tol}`);
    }
    check('aid: the simulation state is identical with an aid accumulating every step (30 steps, both modes) and without one',
      maxAbsDiff(withAid.readState(), without.readState()) === 0 && withAid.generation === without.generation, `generation=${withAid.generation}`);
    check('aid: no pending GL error', gl.getError() === gl.NO_ERROR);
    ov.dispose(); withAid.dispose(); without.dispose();

    // Cost, reported (not asserted): GPU time of one step pass and of one accumulation pass, by timer query when available.
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) {
      log('info  aid cost: EXT_disjoint_timer_query_webgl2 unavailable here; the extra pass per step is unmeasured', 'info');
    } else {
      const timeMs = async (fn) => {
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q); fn(); gl.endQuery(ext.TIME_ELAPSED_EXT);
        for (let i = 0; i < 1000; i++) {
          await new Promise((ok) => setTimeout(ok, 5));
          if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT), ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
            gl.deleteQuery(q);
            return disjoint ? null : ns / 1e6;
          }
        }
        gl.deleteQuery(q);
        return null;
      };
      for (const n of [128, 512]) {
        const sim = new LeniaSimulation(gl, caps, normalizeParams({ gridSize: n, radius: 13, seed: 3 }).params);
        sim.reset(randomDiscSeed(n, { radiusFraction: 0.3, seed: 3 }));
        const acc = new OverlayAccumulator(gl, caps, n);
        const reps = n === 512 ? 4 : 20;
        await timeMs(() => { sim.step(); acc.accumulate(sim.stateTexture, sim.previousTexture, OVERLAY_MODE.activity, 0.95); }); // warm-up
        const step = await timeMs(() => { for (let i = 0; i < reps; i++) sim.step(); });
        const aid = await timeMs(() => { for (let i = 0; i < reps; i++) acc.accumulate(sim.stateTexture, sim.previousTexture, OVERLAY_MODE.activity, 0.95); });
        log(step === null || aid === null
          ? `info  aid cost at grid ${n}: timer query disjoint or unavailable; unmeasured`
          : `info  aid cost at grid ${n} (GPU timer, ${reps} passes each): step ${(step / reps).toFixed(3)} ms/pass, accumulation ${(aid / reps).toFixed(3)} ms/pass (${((aid / step) * 100).toFixed(2)} % of a step)`, 'info');
        acc.dispose(); sim.dispose();
      }
    }
  }

  // 6. Phase 4b stamp (adding an organism to the live state): the GPU pass equals the CPU twin stampMax exactly (float32), also
  //    across the world's corner; it is not a step (generation unchanged); float16 within its rounding.
  {
    const pat = decodeRle(ORBIUM_O2U.rle);
    const formats = [['float32', caps.stateFormat]];
    if (caps.stateFormat.name === 'float32') formats.push(['float16', { name: 'float16', internalFormat: 'R16F' }]);
    for (const [fname, stateFormat] of formats) {
      const sim = new LeniaSimulation(gl, { ...caps, stateFormat }, normalizeParams({ gridSize: 64, radius: 13, seed: 2 }).params);
      const stamp = new StampPass(gl);
      sim.reset(randomDiscSeed(64, { radiusFraction: 0.45, seed: 2 }));
      for (let i = 0; i < 3; i++) sim.step();
      let cpu = sim.readState();
      const g = sim.generation, tol = fname === 'float32' ? 0 : 1e-3;
      let worst = 0;
      for (const [x, y] of [[20, 40], [0, 63], [63, 0], [20, 40]]) { // the last repeats the first: max is idempotent
        stamp.apply(sim, 'O2u', pat, x, y);
        cpu = stampMax(cpu, 64, pat, x, y);
        worst = Math.max(worst, maxAbsDiff(sim.readState(), cpu));
      }
      check(`stamp (${fname}): the GPU pass equals the CPU twin (4 additions incl. the world corner and a repeat); generation unchanged`,
        worst <= tol && sim.generation === g, `maxAbsDiff=${worst.toExponential(2)} tol=${tol} generation ${g} -> ${sim.generation}`);
      check(`stamp (${fname}): no pending GL error`, gl.getError() === gl.NO_ERROR);
      stamp.dispose(); sim.dispose();
    }
  }
} catch (e) {
  failures++;
  log(`FAIL  unexpected exception: ${e && e.stack ? e.stack : e}`, 'fail');
}

log('');
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`, failures === 0 ? 'pass' : 'fail');
out.textContent = '';
for (const { text, cls } of lines) {
  const row = document.createElement('div');
  row.textContent = text || '\u00a0';
  if (cls) row.className = cls;
  out.appendChild(row);
}
document.body.dataset.status = failures === 0 ? 'pass' : 'fail';
