// Runs in a real WebGL2 browser. Verifies the GPU shaders against the CPU reference,
// the display colour map, and shader-error reporting. Prints PASS/FAIL per check.
import { createGLContext } from '../../src/gl/context.js';
import { createProgram } from '../../src/gl/program.js';
import { LeniaSimulation } from '../../src/simulation/lenia.js';
import { Renderer } from '../../src/render/renderer.js';
import { normalizeParams } from '../../src/simulation/params.js';
import { buildKernel } from '../../src/simulation/kernel.js';
import { stepReference } from '../../src/simulation/reference.js';
import { randomDiscSeed } from '../../src/simulation/seed.js';
import { LeniaError } from '../../src/errors.js';

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
