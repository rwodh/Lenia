// Verifies the verified Orbium (O2u) organism on the real GPU shader path:
//  A. uploaded state equals the seed exactly
//  B. GPU == CPU reference after 1, 5 and 20 steps (max abs error vs tolerance)
//  C. long GPU run: mass, shape (translation-invariant correlation), motion, WebGL errors, CPU parity at checkpoints
//  D. grid-size independence: the same organism on a 128 grid equals the 64 grid result
// Pass/fail thresholds were fixed before the first run; see THRESHOLDS.
import { createGLContext } from '../../src/gl/context.js';
import { LeniaSimulation } from '../../src/simulation/lenia.js';
import { Renderer } from '../../src/render/renderer.js';
import { normalizeParams } from '../../src/simulation/params.js';
import { buildKernel } from '../../src/simulation/kernel.js';
import { stepReference } from '../../src/simulation/reference.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { placePatternCentred } from '../../src/simulation/seed.js';
import { ORBIUM_O2U } from '../../src/simulation/patterns.js';

// Long-horizon rationale: this system is sensitive to initial conditions (a 1e-7 seed perturbation amplifies ~5000x
// by step 700, and float32-vs-float64 CPU variants diverge ~1e-2 pointwise with no GPU involved), so pointwise parity is
// only meaningful early. It is enforced strictly for the first `earlyHorizon` steps; after that GPU and CPU are compared on
// observables (total mass, centroid). Observable tolerances were fixed before they were first measured.
const THRESHOLDS = {
  parityTolerance: 1e-3, parityToleranceHalf: 1e-2,
  earlyHorizon: 200, observableMass: 1.0, observableCentroidCells: 2.0,
  massRatio: [0.8, 1.1], minShapeCorrelation: 0.85, gridIndependence: 1e-3,
};
const LONG_STEPS = Math.max(100, Math.min(5000, Number(new URLSearchParams(location.search).get('long')) || 1000));
const CHECK_EVERY = 100;
const SAMPLE_EVERY = 10;

const out = document.getElementById('result');
const lines = [];
let failures = 0;
const log = (text, cls = '') => lines.push({ text, cls });
const check = (name, ok, extra = '') => { if (!ok) failures++; log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`, ok ? 'pass' : 'fail'); };
const flush = () => {
  out.textContent = '';
  for (const { text, cls } of lines) { const d = document.createElement('div'); d.textContent = text || '\u00a0'; if (cls) d.className = cls; out.appendChild(d); }
};
const tick = () => new Promise((r) => setTimeout(r, 0));

const maxAbsDiff = (a, b) => { let m = 0, at = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) { m = d; at = i; } } return { max: m, at }; };
const sum = (a) => { let s = 0; for (const v of a) s += v; return s; };

function circularCentroid(state, n) {
  let m = 0, cx = 0, sx = 0, cy = 0, sy = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = state[y * n + x]; if (v === 0) continue;
    m += v; cx += v * Math.cos(2 * Math.PI * x / n); sx += v * Math.sin(2 * Math.PI * x / n);
    cy += v * Math.cos(2 * Math.PI * y / n); sy += v * Math.sin(2 * Math.PI * y / n);
  }
  return { x: ((Math.atan2(sx, cx) / (2 * Math.PI)) * n + n) % n, y: ((Math.atan2(sy, cy) / (2 * Math.PI)) * n + n) % n };
}
const wrapDelta = (a, b, n) => ((b - a + n / 2) % n + n) % n - n / 2;

/** Max over all periodic shifts of the normalised correlation between `state` and the reference footprint `ref`. */
function shapeCorrelation(state, ref, n) {
  const idx = []; let nr = 0;
  for (let i = 0; i < ref.length; i++) if (ref[i] > 0) { idx.push(i); nr += ref[i] * ref[i]; }
  let ns = 0; for (const v of state) ns += v * v;
  if (ns === 0) return 0;
  const norm = Math.sqrt(nr * ns);
  let best = 0;
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
    let dot = 0;
    for (const i of idx) dot += ref[i] * state[((((i / n) | 0) + dy) % n) * n + ((i % n) + dx) % n];
    if (dot > best) best = dot;
  }
  return best / norm;
}

const frames = [];
const grabFrame = (renderer, sim, label) => {
  renderer.draw(sim.stateTexture, sim.size);
  frames.push({ label, url: renderer.canvas.toDataURL('image/png') });
};

async function main() {
  const canvas = document.getElementById('view');
  const { gl, caps } = createGLContext(canvas);
  log(`renderer: ${caps.renderer}`, 'info');
  log(`state format: ${caps.stateFormat.name}; pattern ${ORBIUM_O2U.id} "${ORBIUM_O2U.name}"; params ${JSON.stringify(ORBIUM_O2U.params)}`, 'info');
  const tol = caps.stateFormat.name === 'float32' ? THRESHOLDS.parityTolerance : THRESHOLDS.parityToleranceHalf;
  const pattern = decodeRle(ORBIUM_O2U.rle);
  const make = (gridSize) => normalizeParams({ gridSize, ...ORBIUM_O2U.params }).params;
  const renderer = new Renderer(gl, canvas, caps);
  let glErrors = [];
  const glCheck = (where) => { const e = gl.getError(); if (e !== gl.NO_ERROR) glErrors.push(`${where}: 0x${e.toString(16)}`); };

  // ---- A + B: upload exactness and short-horizon parity (grid 64)
  {
    const params = make(64), n = params.gridSize;
    const seed = placePatternCentred(n, pattern);
    const kernel = buildKernel(params.radius);
    const sim = new LeniaSimulation(gl, caps, params);
    sim.reset(seed);
    const up = maxAbsDiff(sim.readState(), seed);
    check('A. state read back after reset equals the placed seed exactly', up.max === 0, `maxAbsError=${up.max}  mass=${sum(sim.readState()).toFixed(6)} (seed ${sum(seed).toFixed(6)})`);
    let cpu = seed;
    for (let t = 1; t <= 20; t++) {
      sim.step();
      cpu = stepReference(cpu, n, kernel, params);
      if (t === 1 || t === 5 || t === 20) {
        const gpu = sim.readState();
        const d = maxAbsDiff(gpu, cpu);
        check(`B. GPU == CPU after ${t} step(s)`, d.max <= tol && sum(gpu) > 0, `maxAbsError=${d.max.toExponential(3)} tolerance=${tol} at cell (${d.at % n},${(d.at / n) | 0})  gpuMass=${sum(gpu).toFixed(4)} cpuMass=${sum(cpu).toFixed(4)}`);
      }
    }
    glCheck('after parity');
    sim.dispose();
  }
  flush();
  await tick();

  // ---- C: long run (grid 64)
  const n = 64, params = make(n);
  const seed = placePatternCentred(n, pattern);
  const kernel = buildKernel(params.radius);
  const sim = new LeniaSimulation(gl, caps, params);
  sim.reset(seed);
  grabFrame(renderer, sim, 'step 0 (seed)');
  const m0 = sum(seed), c0 = circularCentroid(seed, n);
  log('', ''); log(`long run: ${LONG_STEPS} steps, grid ${n}x${n}, checkpoint every ${CHECK_EVERY}`, 'info');
  log('step   mass   ratio  shapeCorr  active  centroid(x,y)  path-speed  pointwise-err  dMass(cpu)  dCentroid(cpu)', 'info');
  // Motion is tracked every SAMPLE_EVERY steps. The organism moves ~0.6 cells/step, so a 100-step window is
  // ~60 cells: ambiguous on a 64-cell torus. At 10-step sampling each jump is ~6 cells, which is unambiguous
  // (verified below via maxJump < n/4) and lets us accumulate an unwrapped path.
  let cpu = seed, prevC = c0, windowPath = 0, pathTotal = 0, netX = 0, netY = 0, maxJump = 0;
  let worstParity = 0, earlyParity = 0, worstDMass = 0, worstDCent = 0, valuesOk = true, massOk = true, corrMin = 1, minRatio = Infinity, maxRatio = 0, lastRatio = 1;
  for (let t = 1; t <= LONG_STEPS; t++) {
    sim.step();
    cpu = stepReference(cpu, n, kernel, params);
    if (t % SAMPLE_EVERY === 0) {
      const gpu = sim.readState();
      const c = circularCentroid(gpu, n);
      const dx = wrapDelta(prevC.x, c.x, n), dy = wrapDelta(prevC.y, c.y, n), jump = Math.hypot(dx, dy);
      maxJump = Math.max(maxJump, jump); windowPath += jump; pathTotal += jump; netX += dx; netY += dy; prevC = c;
      if (t % CHECK_EVERY === 0) {
        glCheck(`step ${t}`);
        let active = 0; for (const v of gpu) { if (!(v >= 0 && v <= 1)) valuesOk = false; if (v > 0.01) active++; }
        const mass = sum(gpu), ratio = mass / m0, corr = shapeCorrelation(gpu, seed, n);
        const par = maxAbsDiff(gpu, cpu).max;
        const cc = circularCentroid(cpu, n), dM = Math.abs(mass - sum(cpu)), dC = Math.hypot(wrapDelta(c.x, cc.x, n), wrapDelta(c.y, cc.y, n));
        worstParity = Math.max(worstParity, par); worstDMass = Math.max(worstDMass, dM); worstDCent = Math.max(worstDCent, dC);
        if (t <= THRESHOLDS.earlyHorizon) earlyParity = Math.max(earlyParity, par);
        corrMin = Math.min(corrMin, corr);
        minRatio = Math.min(minRatio, ratio); maxRatio = Math.max(maxRatio, ratio); lastRatio = ratio;
        if (ratio < THRESHOLDS.massRatio[0] || ratio > THRESHOLDS.massRatio[1]) massOk = false;
        log(`${String(t).padStart(4)}  ${mass.toFixed(2).padStart(6)}  ${ratio.toFixed(3)}  ${corr.toFixed(3).padStart(8)}  ${String(active).padStart(6)}  (${c.x.toFixed(1)},${c.y.toFixed(1)})  ${(windowPath / CHECK_EVERY).toFixed(4).padStart(10)}  ${par.toExponential(2).padStart(13)}  ${dM.toFixed(4).padStart(10)}  ${dC.toFixed(4).padStart(14)}`, 'info');
        windowPath = 0;
        if (t === Math.round(LONG_STEPS / 2 / CHECK_EVERY) * CHECK_EVERY) grabFrame(renderer, sim, `step ${t}`);
        flush(); await tick();
      }
    }
  }
  grabFrame(renderer, sim, `step ${LONG_STEPS}`);
  check(`C. values stay within [0,1] for all ${LONG_STEPS} steps`, valuesOk);
  check(`C. mass stays within ${THRESHOLDS.massRatio[0]}-${THRESHOLDS.massRatio[1]}x of the seed`, massOk, `ratio range ${minRatio.toFixed(3)}..${maxRatio.toFixed(3)} (final ${lastRatio.toFixed(3)}; seed mass ${m0.toFixed(2)})`);
  check(`C. organism stays recognizable (shape correlation >= ${THRESHOLDS.minShapeCorrelation})`, corrMin >= THRESHOLDS.minShapeCorrelation, `min ${corrMin.toFixed(3)}`);
  check('C. motion tracking is unambiguous (every sampled jump < n/4)', maxJump < n / 4, `max jump ${maxJump.toFixed(2)} cells per ${SAMPLE_EVERY} steps`);
  check('C. organism translates steadily (unwrapped path > 10 cells)', pathTotal > 10, `path ${pathTotal.toFixed(1)} cells, net (${netX.toFixed(1)}, ${netY.toFixed(1)}) = ${Math.hypot(netX, netY).toFixed(1)} cells in ${LONG_STEPS} steps; mean speed ${(pathTotal / LONG_STEPS).toFixed(3)} cells/step`);
  check(`C. pointwise GPU == CPU through the first ${THRESHOLDS.earlyHorizon} steps (checkpoints)`, earlyParity <= tol, `maxAbsError=${earlyParity.toExponential(2)} tolerance=${tol}`);
  check(`C. GPU and CPU observables agree for the whole run (|dMass| <= ${THRESHOLDS.observableMass}, |dCentroid| <= ${THRESHOLDS.observableCentroidCells} cells)`, worstDMass <= THRESHOLDS.observableMass && worstDCent <= THRESHOLDS.observableCentroidCells, `worst dMass=${worstDMass.toFixed(4)} worst dCentroid=${worstDCent.toFixed(4)} cells`);
  log(`info  pointwise GPU-vs-CPU error beyond the early horizon is NOT asserted (chaotic amplification; worst over the run ${worstParity.toExponential(2)})`, 'info');
  const finalGpu = sim.readState();
  sim.dispose();

  // ---- D: grid-size independence (128 grid vs 64 grid after 30 steps; at ~0.6 cells/step the organism is still inside the window and away from the 64-grid edges)
  {
    const p64 = make(64), p128 = make(128), steps = 30;
    const a = new LeniaSimulation(gl, caps, p64), b = new LeniaSimulation(gl, caps, p128);
    a.reset(placePatternCentred(64, pattern)); b.reset(placePatternCentred(128, pattern));
    for (let t = 0; t < steps; t++) { a.step(); b.step(); }
    const A = a.readState(), B = b.readState();
    let worst = 0, outside = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) worst = Math.max(worst, Math.abs(A[y * 64 + x] - B[(y + 32) * 128 + (x + 32)]));
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (x < 32 || x >= 96 || y < 32 || y >= 96) outside += B[y * 128 + x];
    check(`D. grid 128 and grid 64 agree after ${steps} steps`, worst <= THRESHOLDS.gridIndependence && outside === 0, `maxAbsDiff=${worst.toExponential(2)} (tolerance ${THRESHOLDS.gridIndependence}); mass outside the 64-cell window on the 128 grid = ${outside}`);
    a.dispose(); b.dispose();
  }
  glCheck('end');
  check('no WebGL errors during the whole run', glErrors.length === 0, glErrors.join('; '));
  renderer.dispose();

  const fr = document.getElementById('frames');
  for (const f of frames) {
    const fig = document.createElement('figure'), img = document.createElement('img'), cap = document.createElement('figcaption');
    img.src = f.url; img.alt = `Orbium simulation, ${f.label}`; cap.textContent = f.label;
    fig.append(img, cap); fr.appendChild(fig);
  }
  window.__frames = frames.map((f) => ({ label: f.label, url: f.url }));
}

try { await main(); } catch (e) { failures++; log(`FAIL  unexpected exception: ${e && e.stack ? e.stack : e}`, 'fail'); }
log('');
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`, failures === 0 ? 'pass' : 'fail');
flush();
document.body.dataset.status = failures === 0 ? 'pass' : 'fail';
