// Integration check of the real page: explorer controls (play/pause/step/reset/params/speed/palette), single animation
// loop, and the Guided Discovery tour including its first-visit memory. Uses only the page's own DOM and the ?debug hook.
import { TOUR_STORAGE_KEY, EXPERIMENT, OBSERVATORY, VIEW, ADDITIONS } from '../../src/config.js';
import { bufferToWorld } from '../../src/render/view-math.js';
import { computeObservables } from '../../src/simulation/observables.js';
import { getPattern } from '../../src/simulation/patterns.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { placePatternCentred, placePatternAt, stampMax } from '../../src/simulation/seed.js';

/** The exact initial state a library pattern must put on the GPU (page grid is 64). */
const seedOf = (id, n = 64) => placePatternCentred(n, decodeRle(getPattern(id).rle));
const diffMax = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

const out = document.getElementById('result');
const lines = [];
let failures = 0;
const log = (text, cls = '') => lines.push({ text, cls });
const check = (name, ok, extra = '') => { if (!ok) failures++; log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`, ok ? 'pass' : 'fail'); };
const flush = () => { out.textContent = ''; for (const { text, cls } of lines) { const d = document.createElement('div'); d.textContent = text || '\u00a0'; if (cls) d.className = cls; out.appendChild(d); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, timeoutMs = 120000) {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > timeoutMs) throw new Error(`timeout waiting for: ${what}`); await sleep(100); }
}

const frame = document.getElementById('app');
async function load(query) {
  await new Promise((resolve) => { frame.onload = resolve; frame.src = `../../index.html?debug&grid=64${query}`; });
  await until(() => frame.contentWindow.leniaApp?.sim, 'app start', 20000);
  const w = frame.contentWindow, d = frame.contentDocument;
  // Track animation-frame callbacks that are scheduled but not yet fired: a second loop would show up as > 1.
  // A cancelled callback (App.stop() on context loss) never runs, so it is subtracted when cancelled.
  const raf = w.requestAnimationFrame.bind(w), caf = w.cancelAnimationFrame.bind(w);
  const probe = { pending: 0, max: 0 }, ids = new Set();
  w.requestAnimationFrame = (cb) => { const id = raf((t) => { ids.delete(id); probe.pending--; cb(t); }); ids.add(id); probe.pending++; return id; };
  w.cancelAnimationFrame = (id) => { if (ids.delete(id)) probe.pending--; caf(id); };
  setInterval(() => { probe.max = Math.max(probe.max, probe.pending); }, 40);
  return { w, d, app: w.leniaApp, probe, $: (s) => d.querySelector(s), click: (s) => d.querySelector(s).click() };
}
const sum = (a) => { let s = 0; for (const v of a) s += v; return s; };

try {
  localStorage.removeItem(TOUR_STORAGE_KEY);

  // ---------- first visit: tour opens, skipping leaves a clean running explorer ----------
  let P = await load('');
  check('first visit: guided tour opens on the welcome step', !P.$('#tour').hidden && !P.$('[data-tour-step=welcome]').hidden && P.$('#tour').dataset.modal === 'true');
  check('modal step makes the app inert (focus is contained)', P.$('#app').inert === true);
  check('welcome text contains Bangla marked lang="bn"', P.$('[data-tour-step=welcome] [lang=bn]') !== null);
  P.d.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: 'Escape' }));
  check('Escape leaves the tour', P.$('#tour').hidden && P.$('#app').inert === false);
  check('leaving remembers completion', localStorage.getItem(TOUR_STORAGE_KEY) === 'done');
  check('leaving resets and plays', P.app.paused === false && P.app.sim.generation < 20, `generation=${P.app.sim.generation}`);

  // ---------- explorer controls ----------
  const { app } = P;
  const seed = app.initialState;
  P.click('#btn-play'); // pause
  check('Pause: app paused, button reads Play, Step enabled', app.paused && P.$('#btn-play').textContent === 'Play' && !P.$('#btn-step').disabled);
  check('Pause: status pill says Paused', P.$('[data-hud=state]').textContent === 'Paused');
  await sleep(400);
  const gPaused = app.sim.generation;
  await sleep(1500);
  check('Pause: generation does not advance', app.sim.generation === gPaused, `generation=${gPaused}`);

  P.click('#btn-step');
  await until(() => app.sim.generation !== gPaused, 'single step');
  await sleep(1500);
  check('Step: advances exactly one generation', app.sim.generation === gPaused + 1, `${gPaused} -> ${app.sim.generation}`);
  for (let i = 0; i < 3; i++) { P.click('#btn-step'); await until(() => app.sim.generation === gPaused + 2 + i, `step ${i + 2}`); }
  await sleep(1500);
  check('Step x3 more: exactly four in total', app.sim.generation === gPaused + 4, `generation=${app.sim.generation}`);

  P.click('#btn-play');
  check('Play: resumes, Step disabled while playing', !app.paused && P.$('#btn-step').disabled);
  const gResume = app.sim.generation;
  await until(() => app.sim.generation > gResume + 3, 'advance after Play');
  check('Play: generation advances', true, `generation=${app.sim.generation}`);

  // parameters
  const sigma = P.$('#p-sigma');
  sigma.value = '0.02'; sigma.dispatchEvent(new P.w.Event('input', { bubbles: true }));
  check('Parameter slider updates the live simulation parameter', app.params.sigma === 0.02 && P.$('[data-out=sigma]').textContent === '0.020');
  check('Parameter does not touch the stored start values', app.baseParams.sigma === 0.015);
  sigma.value = '99'; sigma.dispatchEvent(new P.w.Event('input', { bubbles: true }));
  check('Out-of-range slider input is clamped to the slider range', app.params.sigma <= 0.04 && app.params.sigma >= 0.005, `sigma=${app.params.sigma}`);
  let threw = false; try { app.setParam('radius', 5); } catch { threw = true; }
  check('Non-adjustable parameter (radius) is rejected', threw && app.params.radius === 13);

  // speed + palette
  P.d.querySelectorAll('#seg-speed .seg-btn')[3].click();
  check('Speed 2x sets 120 steps/s and marks the button pressed', app.stepsPerSecond === 120 && P.d.querySelectorAll('#seg-speed .seg-btn')[3].getAttribute('aria-pressed') === 'true');
  P.d.querySelectorAll('#seg-colour .seg-btn')[1].click();
  check('Colour switch changes the palette only', app.palette === 'viridis' && app.params.sigma <= 0.04);
  P.d.querySelectorAll('#seg-colour .seg-btn')[0].click();

  // reset restores state AND parameters
  P.click('#btn-play'); // pause so the readback is deterministic
  await sleep(1200);
  P.click('#btn-reset');
  const after = app.sim.readState();
  let maxDiff = 0; for (let i = 0; i < seed.length; i++) maxDiff = Math.max(maxDiff, Math.abs(after[i] - seed[i]));
  check('Reset: GPU state equals the initial Orbium seed exactly', maxDiff === 0 && app.sim.generation === 0, `maxDiff=${maxDiff} mass=${sum(after).toFixed(4)}`);
  check('Reset: parameters restored, sliders follow', app.params.sigma === 0.015 && P.$('#p-sigma').value === '0.015' && P.$('[data-out=sigma]').textContent === '0.015');
  check('Reset: play/pause state and speed are kept', app.paused === true && app.stepsPerSecond === 120);
  P.d.querySelectorAll('#seg-speed .seg-btn')[2].click();

  // keyboard shortcuts
  P.d.body.dispatchEvent(new P.w.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  check('Space toggles play', app.paused === false);
  P.d.body.dispatchEvent(new P.w.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  check('Space toggles pause', app.paused === true);

  // many interactions, then: still exactly one animation loop
  for (let i = 0; i < 25; i++) { P.click('#btn-play'); P.click('#btn-play'); P.click('#btn-reset'); }
  P.click('#btn-play');
  P.probe.max = 0;
  await sleep(3000);
  check('No duplicate animation loops after repeated interaction', P.probe.max <= 1, `max pending rAF callbacks = ${P.probe.max}`);
  check('Controls leave no WebGL error behind', P.app.sim.gl.getError() === P.app.sim.gl.NO_ERROR);

  // ---------- regression: a context restore keeps the state format (it used to drop float32 to float16) ----------
  // Cause (progress.md): initGpu() deleted the lost context's objects, each delete raised INVALID_OPERATION, and the
  // format probe then rejected float32 because of that leftover error.
  P = await load('');
  {
    const A = P.app;
    const ext = A.sim.gl.getExtension('WEBGL_lose_context');
    const first = A.caps.stateFormat.name;
    if (!ext || first !== 'float32') {
      log(`info  restore-format regression not applicable: ${ext ? `state format at start is ${first}` : 'WEBGL_lose_context unavailable'}`, 'info');
    } else {
      A.pause(); // paused across the restore, so the re-seeded state is still generation 0
      const old = A.sim;
      ext.loseContext();
      await sleep(300);
      ext.restoreContext();
      await until(() => A.sim !== old && A.running, 'context restore', 30000);
      const fmt = A.caps.stateFormat.name, err = diffMax(A.sim.readState(), seedOf('O2u'));
      check('context restore keeps the state format (float32 before and after)', fmt === first, `before=${first} after=${fmt}`);
      check('context restore re-seeds the selected organism exactly (error 0, generation 0)', err === 0 && A.sim.generation === 0, `maxAbsError=${err}`);
      await until(() => A.observation.status === 'ok', 'Observatory sample after restore', 60000); // still paused: the seed itself
      const seedMass = computeObservables(seedOf('O2u'), A.sim.size).mass;
      check('context restore: the Observatory resumes (generation 0, the seed\'s exact mass); no WebGL error',
        A.observation.latest.generation === 0 && A.observation.latest.mass === seedMass && A.sim.gl.getError() === A.sim.gl.NO_ERROR,
        `gen=${A.observation.latest.generation} mass=${A.observation.latest.mass.toFixed(4)}`);
      A.play();
    }
  }

  // ---------- organism library: selection, Reset, repeated switching, context restore ----------
  P = await load('');
  {
    const A = P.app;
    const buttons = () => [...P.d.querySelectorAll('#seg-pattern button')];
    const pressed = () => buttons().map((b) => b.getAttribute('aria-pressed')).join();
    const onGpu = (id) => diffMax(A.sim.readState(), seedOf(id)) === 0; // synchronous with the click that preceded it: no frame can step in between
    const hud = () => P.$('[data-hud=pattern]').textContent;
    await until(() => hud() !== '-', 'HUD pattern label');
    check('library: two organisms offered; O2u is shown, pressed and labelled', buttons().length === 2 && pressed() === 'true,false' && hud() === 'Orbium unicaudatus (O2u)' && A.patternId === 'O2u');

    buttons()[1].click();
    check('select O2b: GPU state equals the O2b seed exactly, generation 0', A.patternId === 'O2b' && onGpu('O2b') && A.sim.generation === 0);
    check('select O2b: parameters are O2b\'s (mu 0.15, sigma 0.014, T 10) and Reset\'s target follows',
      A.params.mu === 0.15 && A.params.sigma === 0.014 && A.params.timeSteps === 10 && A.params.radius === 13 && A.baseParams.sigma === 0.014);
    check('select O2b: HUD label, sliders and "(start: ...)" labels follow immediately',
      hud() === 'Orbium bicaudatus (O2b)' && P.$('#p-sigma').value === '0.014' && P.$('[data-out=sigma]').textContent === '0.014'
      && P.$('[data-start=sigma]').textContent === '(start: 0.014)' && P.$('[data-start=mu]').textContent === '(start: 0.150)' && pressed() === 'false,true');
    check('select O2b: description and facts line are shown',
      P.$('[data-pattern=description]').textContent.length > 10 && P.$('[data-pattern=facts]').textContent.includes('σ 0.014') && P.$('[data-pattern=facts]').textContent.includes('R 13'));

    const sg = P.$('#p-sigma'); sg.value = '0.02'; sg.dispatchEvent(new P.w.Event('input', { bubbles: true }));
    await until(() => A.sim.generation > 0, 'O2b running with the changed sigma');
    check('O2b: changing sigma applies to the live simulation', A.params.sigma === 0.02 && A.sim.generation > 0);
    P.click('#btn-reset');
    check('select O2b, change a parameter, Reset: the O2b seed and O2b parameters return (not Orbium\'s)',
      A.patternId === 'O2b' && onGpu('O2b') && A.params.sigma === 0.014 && P.$('#p-sigma').value === '0.014' && hud() === 'Orbium bicaudatus (O2b)');
    P.d.body.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    check('the R key restores the selected pattern too', A.patternId === 'O2b' && onGpu('O2b'));

    P.click('#btn-play'); // pause
    await sleep(300);
    buttons()[0].click();
    check('select O2u again: O2u seed and parameters; play/pause and speed are kept',
      A.paused === true && A.stepsPerSecond === 60 && A.patternId === 'O2u' && onGpu('O2u') && A.params.sigma === 0.015 && pressed() === 'true,false');
    P.click('#btn-step');
    await until(() => A.sim.generation === 1, 'single step');
    A.selectPattern('O2u');
    check('selecting the pattern already shown restarts it', A.sim.generation === 0 && onGpu('O2u'));
    let threw = false;
    try { A.selectPattern('nope'); } catch (e) { threw = e.name === 'RangeError'; }
    check('an unknown pattern id is rejected and nothing changes', threw && A.patternId === 'O2u' && onGpu('O2u') && A.params.sigma === 0.015);

    const sim0 = A.sim, kernelTex0 = A.sim.kernelTex, tex0 = A.sim.targets[0].tex, tex1 = A.sim.targets[1].tex, prog0 = A.sim.program;
    for (let i = 0; i < 25; i++) { buttons()[1].click(); buttons()[0].click(); }
    buttons()[1].click();
    check('25 O2u/O2b round trips: same simulation, kernel texture, state textures and program (nothing recreated); ends on the O2b seed',
      A.sim === sim0 && A.sim.kernelTex === kernelTex0 && A.sim.targets[0].tex === tex0 && A.sim.targets[1].tex === tex1 && A.sim.program === prog0 && A.patternId === 'O2b' && onGpu('O2b'));
    P.click('#btn-play'); // resume
    P.probe.max = 0;
    await sleep(3000);
    check('no second animation loop after repeated switching', P.probe.max <= 1, `max pending rAF callbacks = ${P.probe.max}`);
    check('switching leaves no WebGL error behind', A.sim.gl.getError() === A.sim.gl.NO_ERROR);

    A.pause();
    A.selectPattern('O2b');
    const ext = A.sim.gl.getExtension('WEBGL_lose_context');
    check('WEBGL_lose_context is available to test restore', !!ext);
    if (ext) {
      const old = A.sim;
      P.firstFormat = A.caps.stateFormat.name;
      ext.loseContext();
      await sleep(300);
      ext.restoreContext();
      await until(() => A.sim !== old && A.running, 'context restore', 30000);
      // The restore keeps the state format (asserted by the regression block above); a browser that starts in float16 quantises
      // the seed (<= 5e-4), so exactness is only demanded for float32.
      const restored = A.sim.readState(), fmt = A.caps.stateFormat.name, tolSeed = fmt === 'float32' ? 0 : 1e-3;
      log(`info  state format after the restore: ${fmt} (it was ${P.firstFormat} before the context loss)`, 'info');
      check('context loss and restore after selecting O2b: re-seeded with O2b (not Orbium), O2b parameters kept',
        A.patternId === 'O2b' && diffMax(restored, seedOf('O2b')) <= tolSeed && diffMax(restored, seedOf('O2u')) > 0.1
        && A.params.sigma === 0.014 && hud() === 'Orbium bicaudatus (O2b)', `max diff to the O2b seed ${diffMax(restored, seedOf('O2b')).toExponential(2)} (${fmt})`);
      check('no WebGL error after the restore', A.sim.gl.getError() === A.sim.gl.NO_ERROR);
    }
  }

  // ---------- Observatory: samples, generation tags, lifecycle, back-off, failure, narrow layout ----------
  P = await load('');
  {
    const A = P.app;
    const obs = () => A.observation;
    const txt = (k) => P.$(`[data-obs=${k}]`).textContent;
    await until(() => obs().status === 'ok', 'first Observatory sample');
    const first = obs().latest;
    check('Observatory: a sample arrives on its own; card shows mass, active area, centroid and the generation it describes',
      first.mass > 60 && first.mass < 80 && first.activeArea > 150 && first.centroid.valid && first.generation <= A.sim.generation
      && txt('mass') === first.mass.toFixed(2) && txt('sample').startsWith('generation ') && /^\d+(\.\d)?, \d+(\.\d)?$/.test(txt('centroid')),
      `mass=${txt('mass')} active=${txt('active')} centroid=${txt('centroid')} sample=${txt('sample')}`);
    check('Observatory: definitions are visible and the chart has a text equivalent',
      P.$('#card-observatory').textContent.includes('sum of all cell values') && txt('summary').startsWith('Mass by generation')
      && P.$('[data-obs=chart]').getAttribute('aria-label') === txt('summary'));

    // generation tag: paused, step a known count; the sample must describe exactly that generation and state
    A.pause();
    await until(() => !A.readback.busy, 'no readback in flight');
    const g0 = A.sim.generation;
    for (let i = 1; i <= 3; i++) { P.click('#btn-step'); await until(() => A.sim.generation === g0 + i, `step ${i}`); }
    await until(() => obs().latest && obs().latest.generation === g0 + 3, 'sample of the stepped generation');
    const exact = computeObservables(A.sim.readState(), A.sim.size); // paused: the state is still that generation
    check('Observatory: after pausing and stepping 3 times, the sample is tagged with that generation and measures that exact state',
      obs().latest.generation === g0 + 3 && obs().latest.mass === exact.mass && obs().latest.activeArea === exact.activeArea,
      `tag=${obs().latest.generation} expected=${g0 + 3} mass=${obs().latest.mass} vs ${exact.mass}`);
    const n0 = A.history.length;
    await sleep(1500);
    check('Observatory: while paused no further samples are taken', A.history.length === n0 && obs().latest.generation === g0 + 3, `history ${n0} -> ${A.history.length}`);

    // Reset and pattern switch clear the history; sampling resumes. Paused across each, so the first new sample must be the
    // restored seed itself (generation 0, the seed's exact mass) however long the GPU takes to catch up: no samples are taken
    // while it is behind, so a playing check would depend on the GPU's speed.
    const seedMass = (id) => computeObservables(seedOf(id), A.sim.size).mass;
    const massTol = A.caps.stateFormat.name === 'float32' ? 0 : 1e-2;
    P.click('#btn-play');
    await until(() => A.history.length >= 3, 'some history');
    A.pause();
    P.click('#btn-reset');
    check('Observatory: Reset clears the history and the latest value at once', A.history.length === 0 && obs().latest === null && txt('sample') === 'waiting for a sample (none are taken while the GPU is behind)');
    await until(() => obs().status === 'ok', 'sampling resumes after Reset');
    check('Observatory: sampling resumes after Reset from the restored seed (generation 0, the seed\'s mass)',
      obs().latest.generation === 0 && Math.abs(obs().latest.mass - seedMass('O2u')) <= massTol, `gen=${obs().latest.generation} mass=${obs().latest.mass.toFixed(4)}`);
    P.d.querySelectorAll('#seg-pattern button')[1].click();
    check('Observatory: a pattern switch clears the history', A.history.length === 0 && obs().latest === null);
    await until(() => obs().status === 'ok', 'sampling resumes after the switch');
    check('Observatory: after switching to O2b the samples describe O2b (generation 0, the O2b seed\'s mass)',
      obs().latest.generation === 0 && Math.abs(obs().latest.mass - seedMass('O2b')) <= massTol, `gen=${obs().latest.generation} mass=${obs().latest.mass.toFixed(4)}`);
    P.d.querySelectorAll('#seg-pattern button')[0].click();
    P.click('#btn-play');
    check('Observatory: history is bounded by its capacity', A.history.capacity === OBSERVATORY.historyLength && A.history.length <= A.history.capacity);

    // back-off: while the loop considers the GPU behind, no readback is requested; sampling resumes afterwards
    await until(() => obs().status === 'ok' && !A.readback.busy, 'steady sampling');
    let requests = 0;
    const realRequest = A.readback.request.bind(A.readback);
    A.readback.request = (...args) => { requests++; return realRequest(...args); };
    // Hold the loop in its GPU-limited state. Setting the flag alone is not enough: a frame the fence really holds back resets
    // cleanFrames, and the loop recovers 60 frames later.
    Object.defineProperty(A, 'gpuBound', { get: () => true, set: () => {}, configurable: true });
    const gB = A.sim.generation;
    await sleep(2000);
    check('Observatory: no readback is requested while the GPU is behind (the simulation keeps running)', requests === 0 && A.sim.generation > gB, `requests=${requests} generation ${gB} -> ${A.sim.generation}`);
    delete A.gpuBound;
    A.gpuBound = false; A.cleanFrames = 0;
    await until(() => requests > 0, 'sampling resumes after the GPU catches up');
    check('Observatory: sampling resumes when the GPU catches up', requests > 0);
    A.readback.request = realRequest;

    // context loss and restore: unavailable while lost, history cleared, sampling resumes on the new context
    A.history.length > 0 || await until(() => A.history.length > 0, 'history before loss');
    const ext = A.sim.gl.getExtension('WEBGL_lose_context');
    if (ext) {
      const old = A.sim;
      ext.loseContext();
      await until(() => obs().status === 'unavailable', 'unavailable after loss', 10000);
      check('Observatory: unavailable while the graphics context is lost, history cleared', A.history.length === 0 && txt('sample').startsWith('unavailable'), txt('sample'));
      ext.restoreContext();
      await until(() => A.sim !== old && A.running, 'context restore', 30000);
      await until(() => obs().status === 'ok', 'sampling after restore', 30000);
      check('Observatory: sampling resumes after the context is restored', obs().latest.mass > 0 && A.readback && !A.readback.failed, `format=${A.caps.stateFormat.name}`);
    }

    // readback failure: shown as unavailable; the simulation keeps running
    A.readback.poll = () => { throw new Error('simulated readback failure'); };
    await until(() => obs().status === 'unavailable', 'unavailable after a readback failure');
    const gF = A.sim.generation;
    await sleep(1500);
    check('Observatory: a readback failure shows "unavailable" and the simulation keeps running',
      txt('sample').includes('simulated readback failure') && txt('mass') === '-' && A.sim.generation > gF && !A.paused && P.$('#fatal').hidden,
      `sample="${txt('sample')}" generation ${gF} -> ${A.sim.generation}`);

    // narrow layout: no horizontal overflow; the chart fits its card
    const frameWidth = frame.style.width;
    frame.style.width = '390px';
    await sleep(800);
    const root = P.d.documentElement, chart = P.$('[data-obs=chart]'), card = P.$('#card-observatory');
    check('Observatory: no horizontal overflow at 390 px; the chart fits its card',
      root.scrollWidth <= root.clientWidth && chart.getBoundingClientRect().width <= card.getBoundingClientRect().width && chart.clientWidth > 0,
      `scrollWidth=${root.scrollWidth} clientWidth=${root.clientWidth} chart=${chart.clientWidth}`);
    frame.style.width = frameWidth;
    P.probe.max = 0;
    await sleep(2000);
    check('Observatory: still at most one pending animation frame; no WebGL error', P.probe.max <= 1 && A.sim.gl.getError() === A.sim.gl.NO_ERROR, `max pending rAF callbacks = ${P.probe.max}`);
  }

  // ---------- World View: zoom and pan (display only), inputs, readout, lifecycle, single loop ----------
  P = await load('');
  {
    const A = P.app, c = A.canvas, n = A.sim.size;
    const rect = () => c.getBoundingClientRect();
    const toBuf = (x, y) => ({ px: (x - rect().left) * (c.width / rect().width), py: (rect().bottom - y) * (c.height / rect().height) });
    const worldUnder = (x, y) => { const b = toBuf(x, y); return bufferToWorld(A.view, n, c.width, c.height, b.px, b.py); };
    const sameWorld = (a, b) => { const d = (u, v) => { const t = Math.abs(u - v) % n; return Math.min(t, n - t); }; return !!a && !!b && d(a.x, b.x) < 1e-6 && d(a.y, b.y) < 1e-6; };
    const fire = (type, x, y, extra = {}) => c.dispatchEvent(new P.w.PointerEvent(type, { clientX: x, clientY: y, pointerId: extra.id ?? 1, pointerType: extra.type ?? 'mouse', button: 0, buttons: 1, bubbles: true, cancelable: true }));
    const key = (k, target = P.d.body) => target.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const viewOf = () => ({ ...A.view });
    A.pause();
    check('World View: starts at the default view (whole world, centred)', A.view.zoom === 1 && A.view.cx === n / 2 && A.view.cy === n / 2);

    // wheel zoom about the cursor: the world point under the cursor stays under it
    // Whole CSS pixels: Chrome rounds the clientX/clientY of synthetic mouse, pointer and wheel events.
    const r = rect(), wx = Math.round(r.left + r.width * 0.61), wy = Math.round(r.top + r.height * 0.37);
    const before = worldUnder(wx, wy);
    for (let i = 0; i < 3; i++) c.dispatchEvent(new P.w.WheelEvent('wheel', { deltaY: -150, clientX: wx, clientY: wy, bubbles: true, cancelable: true }));
    check('World View: the wheel zooms in about the cursor (the world point under it stays put)', A.view.zoom > 1.5 && sameWorld(before, worldUnder(wx, wy)), `zoom=${A.view.zoom.toFixed(3)}`);

    // drag pans: the point under the pointer follows it
    const grab = worldUnder(wx, wy);
    fire('pointerdown', wx, wy); fire('pointermove', wx + 2, wy + 1); fire('pointermove', wx + 40, wy - 25); fire('pointerup', wx + 40, wy - 25);
    check('World View: dragging pans the view; the grabbed point follows the pointer', sameWorld(grab, worldUnder(wx + 40, wy - 25)), `centre=(${A.view.cx.toFixed(2)}, ${A.view.cy.toFixed(2)})`);

    // two-pointer pinch zooms
    const z0 = A.view.zoom, mx = Math.round(r.left + r.width / 2), my = Math.round(r.top + r.height / 2);
    fire('pointerdown', mx - 30, my, { id: 11, type: 'touch' }); fire('pointerdown', mx + 30, my, { id: 12, type: 'touch' });
    fire('pointermove', mx + 60, my, { id: 12, type: 'touch' });
    fire('pointerup', mx - 30, my, { id: 11, type: 'touch' }); fire('pointerup', mx + 60, my, { id: 12, type: 'touch' });
    check('World View: a two-finger pinch zooms', A.view.zoom > z0 * 1.4, `zoom ${z0.toFixed(2)} -> ${A.view.zoom.toFixed(2)}`);

    // buttons and keys
    let v = viewOf(); P.click('[data-view-action=zoom-in]');
    const zin = A.view.zoom; P.click('[data-view-action=zoom-out]');
    check('World View: Zoom in / Zoom out buttons', zin > v.zoom && Math.abs(A.view.zoom - v.zoom) < 1e-9 && P.$('[data-view-action=zoom-in]').getAttribute('aria-label') === 'Zoom in');
    key('+'); const kin = A.view.zoom; key('-');
    check('World View: + and - keys zoom', kin > v.zoom && Math.abs(A.view.zoom - v.zoom) < 1e-9);
    v = viewOf(); key('ArrowRight');
    check('World View: arrow keys do nothing unless the view has focus', A.view.cx === v.cx && A.view.cy === v.cy);
    c.focus(); key('ArrowRight', c); key('ArrowUp', c);
    check('World View: with the view focused, ArrowRight / ArrowUp move the view right / up (focusable canvas)', P.d.activeElement === c && A.view.cx > v.cx && A.view.cy > v.cy && c.tabIndex === 0);
    key('s', c); await until(() => A.sim.generation === 1, 'S still steps with the view focused');
    c.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })); // Space toggles play
    check('World View: Space and S keep working with the view focused', !A.paused && A.sim.generation >= 1);
    A.pause();

    // readout
    fire('pointermove', wx, wy);
    const cb = toBuf(wx, wy), cl = A.cellAt(cb.px, cb.py);
    check('World View: "Cell (x, y)" readout under the pointer', P.$('[data-view=cell]').textContent === `Cell (${cl.x}, ${cl.y})`, P.$('[data-view=cell]').textContent);

    // limits and bad input
    for (let i = 0; i < 30; i++) key('+');
    const zMax = A.view.zoom;
    for (let i = 0; i < 30; i++) key('-');
    check('World View: zoom is limited to [1, VIEW.maxZoom]', zMax === VIEW.maxZoom && A.view.zoom === 1, `max=${zMax} min=${A.view.zoom}`);
    key('+'); v = viewOf();
    A.zoomAt(NaN, 10, 2); A.zoomAt(10, 10, Infinity); A.zoomAt(10, 10, -1); A.panBy(Infinity, 0); A.panBy(0, NaN);
    check('World View: NaN / Infinity / non-positive factors are rejected', A.view.cx === v.cx && A.view.cy === v.cy && A.view.zoom === v.zoom);
    key('+'); key('+'); const zw = A.view.zoom;
    c.dispatchEvent(new P.w.WheelEvent('wheel', { deltaY: Number.MAX_VALUE, clientX: wx, clientY: wy, bubbles: true, cancelable: true }));
    check('World View: an extreme wheel delta changes the zoom by at most VIEW.wheelMaxFactor', Math.abs(A.view.zoom - zw / VIEW.wheelMaxFactor) < 1e-9 && Number.isFinite(A.view.cx), `zoom ${zw} -> ${A.view.zoom}`);

    // display only; lifecycle: Reset and pattern switch keep the view, a context restore keeps it, the tour resets it
    A.pause();
    await sleep(300);
    const gHeld = A.sim.generation, held = A.sim.readState();
    key('+'); key('+'); fire('pointerdown', wx, wy); fire('pointermove', wx + 30, wy); fire('pointerup', wx + 30, wy);
    c.dispatchEvent(new P.w.WheelEvent('wheel', { deltaY: 120, clientX: wx, clientY: wy, bubbles: true, cancelable: true }));
    await sleep(500); // several frames drawn with the new view
    v = viewOf();
    check('World View: zooming and panning never change the simulation state (paused: same generation, identical state)',
      A.sim.generation === gHeld && diffMax(A.sim.readState(), held) === 0);
    P.click('#btn-reset');
    check('World View: Reset keeps the view', A.view.cx === v.cx && A.view.zoom === v.zoom);
    P.d.querySelectorAll('#seg-pattern button')[1].click();
    check('World View: a pattern switch keeps the view', A.view.cx === v.cx && A.view.zoom === v.zoom);
    P.d.querySelectorAll('#seg-pattern button')[0].click();
    const ext = A.sim.gl.getExtension('WEBGL_lose_context');
    if (ext) {
      const old = A.sim;
      ext.loseContext(); await sleep(300); ext.restoreContext();
      await until(() => A.sim !== old && A.running, 'context restore', 30000);
      check('World View: a context restore keeps the view', A.view.cx === v.cx && A.view.cy === v.cy && A.view.zoom === v.zoom);
    }
    P.click('[data-view-action=reset]');
    check('World View: Reset view (button) returns to the whole world', A.view.zoom === 1 && A.view.cx === n / 2 && A.view.cy === n / 2);
    key('+'); key('+');
    P.click('#tour-open');
    check('World View: opening the tour resets the view', A.view.zoom === 1 && A.view.cx === n / 2);
    key('+');
    check('World View: view keys are ignored while the tour is modal', A.view.zoom === 1 && P.$('#tour').dataset.modal === 'true');
    P.d.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: 'Escape' }));
    check('World View: the view works again after the tour', (key('+'), A.view.zoom > 1));

    // single loop, no GL error after mixed input; narrow layout
    for (let i = 0; i < 20; i++) { key('+'); fire('pointerdown', wx, wy); fire('pointermove', wx + 5 * i, wy); fire('pointerup', wx + 5 * i, wy); key('-'); P.click('#btn-play'); }
    P.probe.max = 0;
    await sleep(2000);
    check('World View: one animation loop and no GL error after mixed input', P.probe.max <= 1 && A.sim.gl.getError() === A.sim.gl.NO_ERROR, `max pending rAF callbacks = ${P.probe.max}`);
    const frameWidth = frame.style.width;
    frame.style.width = '390px';
    await sleep(800);
    const root = P.d.documentElement, tools = P.$('.view-tools').getBoundingClientRect(), stage = P.$('.stage').getBoundingClientRect();
    check('World View: narrow layout (390 px) has no horizontal overflow and the view tools fit the stage',
      root.scrollWidth <= root.clientWidth && tools.left >= stage.left && tools.right <= stage.right && getComputedStyle(c).touchAction === 'none',
      `scrollWidth=${root.scrollWidth} clientWidth=${root.clientWidth} tools=${tools.left.toFixed(0)}..${tools.right.toFixed(0)} stage=${stage.left.toFixed(0)}..${stage.right.toFixed(0)}`);
    frame.style.width = frameWidth;
  }

  // ---------- Placement: where the selected organism starts (Reset restores it there) ----------
  P = await load('');
  {
    const A = P.app, c = A.canvas, n = A.sim.size;
    const placedOf = (id, x, y) => placePatternAt(n, decodeRle(getPattern(id).rle), x, y);
    const onGpu = (expected) => diffMax(A.sim.readState(), expected) === 0;
    const rect = () => c.getBoundingClientRect();
    const fire = (type, x, y) => c.dispatchEvent(new P.w.PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, cancelable: true }));
    const cellUnder = (x, y) => A.cellAt((x - rect().left) * (c.width / rect().width), (rect().bottom - y) * (c.height / rect().height));
    const startText = () => P.$('[data-pattern=start]').textContent;
    A.pause();
    check('Placement: starts centred; Centre is disabled; Place is not armed', A.placement === null && startText() === 'Start: centre'
      && P.$('#btn-centre').disabled && P.$('#btn-place').getAttribute('aria-pressed') === 'false');

    // arm, click a cell (no movement): the organism starts there
    await until(() => A.observation.status === 'ok', 'a first sample', 60000);
    P.click('#btn-place');
    check('Placement: Place arms the mode (pressed, crosshair cursor)', A.placing && P.$('#btn-place').getAttribute('aria-pressed') === 'true' && c.classList.contains('placing'));
    const r = rect(), px = Math.round(r.left + r.width * 0.31), py = Math.round(r.top + r.height * 0.72);
    const target = cellUnder(px, py);
    fire('pointerdown', px, py); fire('pointerup', px, py);
    check('Placement: a click puts the exact organism, unchanged, with its centre on the clicked cell (generation 0)',
      !!A.placement && A.placement.x === target.x && A.placement.y === target.y && onGpu(placedOf('O2u', target.x, target.y)) && A.sim.generation === 0,
      `cell (${target.x}, ${target.y})`);
    check('Placement: the mode disarms after placing; the card names the start cell; the Observatory history was cleared',
      !A.placing && !c.classList.contains('placing') && startText() === `Start: cell (${target.x}, ${target.y})` && !P.$('#btn-centre').disabled && A.history.length === 0);

    // a drag while armed pans and does not place; Escape disarms
    P.click('#btn-place');
    fire('pointerdown', px, py); fire('pointermove', px + 40, py - 20); fire('pointerup', px + 40, py - 20);
    check('Placement: a drag while armed pans the view and does not place', A.placing && A.placement.x === target.x && A.placement.y === target.y);
    P.d.body.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    check('Placement: Escape disarms the mode', !A.placing && P.$('#btn-place').getAttribute('aria-pressed') === 'false');
    P.click('[data-view-action=reset]');

    // Reset restores the organism at the chosen cell; parameters too
    P.click('#btn-step');
    await until(() => A.sim.generation === 1, 'one step');
    A.setParam('sigma', 0.02);
    P.click('#btn-reset');
    check('Placement: Reset restores the organism at the chosen cell (and its parameters)', onGpu(placedOf('O2u', target.x, target.y)) && A.params.sigma === 0.015);

    // a pattern switch keeps the cell
    P.d.querySelectorAll('#seg-pattern button')[1].click();
    check('Placement: switching organism keeps the start cell (O2b placed at the same cell, O2b parameters)',
      A.patternId === 'O2b' && onGpu(placedOf('O2b', target.x, target.y)) && A.params.sigma === 0.014 && startText() === `Start: cell (${target.x}, ${target.y})`);
    P.d.querySelectorAll('#seg-pattern button')[0].click();

    // across the corner of the periodic world; bad cells are refused
    A.placeAt({ x: 0, y: n - 1 });
    const cornerMass = A.sim.readState().reduce((s, v) => s + v, 0), seedMass = seedOf('O2u').reduce((s, v) => s + v, 0);
    check('Placement: a start cell on the world corner wraps the organism across both edges, mass unchanged',
      onGpu(placedOf('O2u', 0, n - 1)) && Math.abs(cornerMass - seedMass) < 1e-9);
    let refused = 0;
    for (const bad of [{ x: n, y: 0 }, { x: -1, y: 3 }, { x: 1.5, y: 2 }, { x: NaN, y: 0 }, null]) {
      try { A.placeAt(bad); } catch (e) { if (e.name === 'RangeError') refused++; }
    }
    check('Placement: cells outside the grid, fractional cells and NaN are refused; nothing changes',
      refused === 5 && A.placement.x === 0 && A.placement.y === n - 1 && onGpu(placedOf('O2u', 0, n - 1)));

    // a context restore re-seeds the placed organism
    const ext = A.sim.gl.getExtension('WEBGL_lose_context');
    if (ext && A.caps.stateFormat.name === 'float32') {
      const old = A.sim;
      ext.loseContext(); await sleep(300); ext.restoreContext();
      await until(() => A.sim !== old && A.running, 'context restore', 30000);
      check('Placement: a context restore re-seeds the organism at the chosen cell exactly', onGpu(placedOf('O2u', 0, n - 1)) && A.sim.generation === 0);
    }

    // Centre returns to the launch state
    P.click('#btn-centre');
    check('Placement: Centre returns to the centred seed exactly', A.placement === null && onGpu(seedOf('O2u')) && P.$('#btn-centre').disabled && startText() === 'Start: centre');

    // the tour starts and ends centred and locks placement
    A.placeAt({ x: 10, y: 10 });
    P.click('#btn-place');
    P.click('#tour-open');
    check('Placement: opening the tour selects the centred O2u, disarms Place and locks Place and Centre',
      A.placement === null && !A.placing && onGpu(seedOf('O2u')) && P.$('#btn-place').disabled && P.$('#btn-centre').disabled);
    P.d.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: 'Escape' }));
    check('Placement: after the tour the organism is centred and placement is available again', A.placement === null && !P.$('#btn-place').disabled);
    P.probe.max = 0;
    await sleep(2000);
    check('Placement: one animation loop and no GL error', P.probe.max <= 1 && A.sim.gl.getError() === A.sim.gl.NO_ERROR, `max pending rAF callbacks = ${P.probe.max}`);
  }

  // ---------- Visualization aids (trails, activity): display only, per step, off by default ----------
  P = await load('');
  {
    const A = P.app;
    const aidBtn = (i) => P.d.querySelectorAll('#seg-aid .seg-btn')[i];
    const decayIn = P.$('#p-decay');
    check('aid: off by default; nothing allocated; the fade panel is hidden',
      A.visualMode === 'off' && A.overlay === null && P.$('[data-aid=panel]').hidden && aidBtn(0).getAttribute('aria-pressed') === 'true');

    // the state is unchanged by an aid: the same steps with trails on and off give identical states
    A.pause();
    P.click('#btn-reset');
    aidBtn(1).click();
    for (let i = 1; i <= 5; i++) { P.click('#btn-step'); await until(() => A.sim.generation === i, `aid step ${i}`); }
    const withTrails = A.sim.readState(), trailSteps = A.overlay.steps;
    aidBtn(0).click();
    P.click('#btn-reset');
    for (let i = 1; i <= 5; i++) { P.click('#btn-step'); await until(() => A.sim.generation === i, `plain step ${i}`); }
    check('aid: the state after 5 steps with trails on is identical to the state without them; one accumulation per step',
      diffMax(withTrails, A.sim.readState()) === 0 && trailSteps === 5, `accumulation passes=${trailSteps}`);
    check('aid: switching off frees the aid', A.overlay === null);

    // trails on: panel, explanation, fade control; accumulation keeps pace with the generation while playing
    aidBtn(1).click();
    check('aid: Trails shows the fade control and says what it shows (derived, display only)',
      !P.$('[data-aid=panel]').hidden && P.$('[data-aid=explain]').textContent.startsWith('Trails:') && P.$('[data-aid=explain]').textContent.includes('display only'));
    P.click('#btn-play');
    const g0 = A.sim.generation, s0 = A.overlay.steps;
    await until(() => A.sim.generation >= g0 + 20, 'running with trails');
    A.pause();
    check('aid: one accumulation pass per simulation step while playing', A.overlay.steps - s0 === A.sim.generation - g0, `steps ${A.overlay.steps - s0} vs generations ${A.sim.generation - g0}`);
    const trailVals = A.overlay.readValues();
    check('aid: trails hold values in [0, 1] and cover more cells than the organism alone',
      trailVals.every((v) => v >= 0 && v <= 1) && trailVals.filter((v) => v > 0.01).length > A.sim.readState().filter((v) => v > 0.01).length);

    // fade control is bounded; bad values are rejected
    decayIn.value = '0.5'; decayIn.dispatchEvent(new P.w.Event('input', { bubbles: true }));
    const lo = A.decay;
    decayIn.value = '2'; decayIn.dispatchEvent(new P.w.Event('input', { bubbles: true }));
    const hi = A.decay;
    let threw = false; try { A.setDecay(NaN); } catch (e) { threw = e.name === 'RangeError'; }
    check('aid: the fade is limited to [0.80, 0.999]; NaN is rejected', lo === 0.8 && hi === 0.999 && threw && A.decay === 0.999 && P.$('[data-out=decay]').textContent.startsWith('0.999'));

    // activity; Reset and a pattern switch clear the aid
    aidBtn(2).click();
    check('aid: Activity says what it shows (scaled to the largest possible change, display only)',
      A.visualMode === 'activity' && P.$('[data-aid=explain]').textContent.startsWith('Activity:') && P.$('[data-aid=explain]').textContent.includes('1/T'));
    P.click('#btn-step'); await until(() => A.overlay.steps >= 1, 'an activity pass');
    P.click('#btn-reset');
    check('aid: Reset clears the aid', A.overlay.readValues().every((v) => v === 0) && A.overlay.steps === 0);
    P.click('#btn-step'); await until(() => A.overlay.steps >= 1, 'an activity pass');
    P.d.querySelectorAll('#seg-pattern button')[1].click();
    check('aid: a pattern switch clears the aid', A.overlay.readValues().every((v) => v === 0));
    P.d.querySelectorAll('#seg-pattern button')[0].click();

    // GPU-limited back-off still applies (one step per frame), with one accumulation per step
    P.click('#btn-play');
    Object.defineProperty(A, 'gpuBound', { get: () => true, set: () => {}, configurable: true });
    let frames = 0; const realDraw = A.renderer.draw.bind(A.renderer);
    A.renderer.draw = (...args) => { frames++; return realDraw(...args); };
    const gB = A.sim.generation, sB = A.overlay.steps;
    await sleep(1500);
    const dg = A.sim.generation - gB, ds = A.overlay.steps - sB;
    A.renderer.draw = realDraw;
    delete A.gpuBound; A.gpuBound = false; A.cleanFrames = 0;
    check('aid: while GPU-limited the loop still takes at most one step per drawn frame, and accumulates once per step',
      dg > 0 && dg <= frames && ds === dg, `generations ${dg}, frames ${frames}, accumulation passes ${ds}`);

    // context restore recreates the aid (cleared); the tour turns it off
    const ext = A.sim.gl.getExtension('WEBGL_lose_context');
    if (ext) {
      const old = A.sim;
      ext.loseContext(); await sleep(300); ext.restoreContext();
      await until(() => A.sim !== old && A.running, 'context restore', 30000);
      check('aid: a context restore recreates the aid on the new context (mode kept)', A.visualMode === 'activity' && !!A.overlay && A.overlay.gl === A.sim.gl);
    }
    P.click('#tour-open');
    check('aid: opening the tour turns the aid off (the tour describes the state itself)', A.visualMode === 'off' && A.overlay === null);
    P.d.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: 'Escape' }));
    P.probe.max = 0;
    await sleep(2000);
    check('aid: one animation loop and no GL error', P.probe.max <= 1 && A.sim.gl.getError() === A.sim.gl.NO_ERROR, `max pending rAF callbacks = ${P.probe.max}`);
  }

  // ---------- Phase 4b: adding copies of the selected organism to the running world ----------
  P = await load('');
  {
    const A = P.app, c = A.canvas, n = A.sim.size, pat = decodeRle(getPattern('O2u').rle);
    const rect = () => c.getBoundingClientRect();
    const fire = (type, x, y) => c.dispatchEvent(new P.w.PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, cancelable: true }));
    const addedText = () => P.$('[data-pattern=added]').textContent;
    const exact = A.caps.stateFormat.name === 'float32';
    A.pause();
    await until(() => A.observation.latest && A.observation.latest.generation === A.sim.generation, 'a sample of the paused state', 60000);
    check('add: nothing added at start; Add available; label shows the cap', A.additions.length === 0 && !P.$('#btn-add').disabled && addedText() === `Added: 0 of ${ADDITIONS.max}`);

    // one click mode at a time
    P.click('#btn-place'); P.click('#btn-add');
    check('add: arming Add disarms Place (one click mode at a time)', A.adding && !A.placing && P.$('#btn-add').getAttribute('aria-pressed') === 'true');

    // a click adds a copy, combined with max; not a step; history kept; the next sample is tagged with the new count
    const before = A.sim.readState(), g0 = A.sim.generation, hist0 = A.history.length;
    const r = rect(), px = Math.round(r.left + r.width * 0.5 + r.height * 0.3), py = Math.round(r.top + r.height * 0.2);
    const cell = A.cellAt((px - r.left) * (c.width / r.width), (r.bottom - py) * (c.height / r.height));
    fire('pointerdown', px, py); fire('pointerup', px, py);
    const after = A.sim.readState();
    check('add: a click adds a copy at the clicked cell: state = max(previous, placed copy) exactly; generation unchanged',
      A.additions.length === 1 && A.additions[0].x === cell.x && A.additions[0].y === cell.y && A.sim.generation === g0
      && (exact ? diffMax(after, stampMax(new Float32Array(before), n, pat, cell.x, cell.y)) === 0 : true), `cell (${cell.x}, ${cell.y})`);
    check('add: the mode disarms; the HUD and the card count the copy; nothing was cleared from the Observatory history; no readback in flight',
      !A.adding && P.$('[data-hud=pattern]').textContent === 'Orbium unicaudatus (O2u) + 1 added' && addedText() === `Added: 1 of ${ADDITIONS.max}`
      && A.history.length === hist0 && !A.readback.busy);
    await until(() => A.observation.latest && A.observation.latest.adds === 1, 'a sample of the state after the addition', 60000);
    const same = [...Array(A.history.length).keys()].map((k) => A.history.at(k)).filter((s) => s.generation === g0);
    check('add: samples before and after the addition share the generation and are told apart by their addition count',
      same.some((s) => s.adds === 0) && same.some((s) => s.adds === 1) && Math.abs(A.observation.latest.mass - after.reduce((s, v) => s + v, 0)) < 1e-3,
      `samples at generation ${g0}: ${same.map((s) => `adds ${s.adds} mass ${s.mass.toFixed(2)}`).join('; ')}`);
    check('add: the chart summary names the addition (the marker\'s text equivalent)', P.$('[data-obs=summary]').textContent.includes(`added at generation ${g0}`));

    // overlays are kept; the insertion itself is never recorded as activity
    P.click('#btn-reset');
    A.setVisualMode('activity');
    for (let i = 1; i <= 2; i++) { P.click('#btn-step'); await until(() => A.sim.generation === i, `activity step ${i}`); }
    const actBefore = A.overlay.readValues();
    A.addAt({ x: 4, y: 4 });
    check('add: the activity overlay is kept, unchanged by the addition itself', diffMax(A.overlay.readValues(), actBefore) === 0);
    P.click('#btn-step'); await until(() => A.sim.generation === 3, 'step after the addition');
    const act = A.overlay.readValues(), dt = 1 / A.params.timeSteps;
    let maxIncrease = 0; for (let i = 0; i < act.length; i++) maxIncrease = Math.max(maxIncrease, act[i] - A.decay * actBefore[i]);
    check('add: the first activity pass after an addition records only that step\'s change (at most 1/T per cell), not the inserted copy',
      maxIncrease <= dt + 1e-6, `largest increase ${maxIncrease.toFixed(4)} (1/T = ${dt})`);
    A.setVisualMode('trails');
    A.addAt({ x: 40, y: 4 });
    P.click('#btn-step'); await until(() => A.sim.generation === 4, 'step with trails');
    const tr = A.overlay.readValues(), copy = placePatternAt(n, pat, 40, 4);
    let covered = 0, cells = 0; for (let i = 0; i < copy.length; i++) if (copy[i] > 0.5) { cells++; if (tr[i] > 0.3) covered++; }
    check('add: trails show the added copy from the next step on', cells > 0 && covered / cells > 0.9, `${covered} of ${cells} bright cells of the copy`);
    A.setVisualMode('off');

    // the cap; bad input; running additions
    P.click('#btn-reset');
    P.click('#btn-play');
    const spots = [[4, 4], [20, 4], [36, 4], [52, 4], [4, 52], [20, 52], [36, 52], [52, 52]];
    for (const [x, y] of spots) A.addAt({ x, y });
    let refused = 0;
    for (const bad of [{ x: 1, y: 1 }]) { try { A.addAt(bad); } catch (e) { if (e.name === 'RangeError') refused++; } }
    A.armAdding(true);
    check(`add: at most ${ADDITIONS.max} copies; the next is refused, Add is disabled and the card says Reset removes them`,
      A.additions.length === ADDITIONS.max && refused === 1 && !A.adding && P.$('#btn-add').disabled && addedText().includes('Reset removes them'));
    check('add: additions while running keep the simulation running and record their generations',
      !A.paused && A.additions.every((a, i) => i === 0 || a.generation >= A.additions[i - 1].generation) && A.sim.gl.getError() === A.sim.gl.NO_ERROR);
    P.click('#btn-reset');
    let badRefused = 0;
    for (const bad of [{ x: n, y: 0 }, { x: -1, y: 1 }, { x: 0.5, y: 1 }, { x: NaN, y: 1 }, null]) { try { A.addAt(bad); } catch (e) { if (e.name === 'RangeError') badRefused++; } }
    check('add: cells outside the grid, fractional cells and NaN are refused', badRefused === 5 && A.additions.length === 0);

    // Reset and a context restore remove additions; the tour locks Add
    A.pause();
    A.addAt({ x: 8, y: 56 });
    P.click('#btn-reset');
    check('add: Reset removes the added copies (state = the start exactly, label and history cleared)',
      A.additions.length === 0 && diffMax(A.sim.readState(), seedOf('O2u')) === 0 && P.$('[data-hud=pattern]').textContent === 'Orbium unicaudatus (O2u)' && A.history.length === 0);
    A.addAt({ x: 8, y: 56 });
    const ext = A.sim.gl.getExtension('WEBGL_lose_context');
    if (ext) {
      const old = A.sim;
      ext.loseContext(); await sleep(300); ext.restoreContext();
      await until(() => A.sim !== old && A.running, 'context restore', 30000);
      check('add: a context restore re-seeds the start, so added copies are gone', A.additions.length === 0 && diffMax(A.sim.readState(), seedOf('O2u')) <= (exact ? 0 : 1e-3));
      A.addAt({ x: 8, y: 56 });
      check('add: adding works on the restored context (the stamp is recreated)', A.additions.length === 1 && A.sim.gl.getError() === A.sim.gl.NO_ERROR);
    }
    P.click('#btn-add');
    P.click('#tour-open');
    check('add: opening the tour removes additions, disarms Add and locks it', A.additions.length === 0 && !A.adding && P.$('#btn-add').disabled);
    P.d.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: 'Escape' }));
    P.click('#btn-add');
    P.d.body.dispatchEvent(new P.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    check('add: Escape disarms Add', !A.adding);
    P.probe.max = 0;
    await sleep(2000);
    check('add: one animation loop and no GL error', P.probe.max <= 1 && A.sim.gl.getError() === A.sim.gl.NO_ERROR, `max pending rAF callbacks = ${P.probe.max}`);
  }

  // ---------- returning visit: no auto tour; reopen works; experiment is interactive ----------
  P = await load('');
  check('returning visit: tour does not auto-open', P.$('#tour').hidden);
  check('"Guided tour" button is available', !P.$('#tour-open').hidden);
  P.d.querySelectorAll('#seg-pattern button')[1].click(); // start the tour from O2b
  check('before the tour: O2b is selected', P.app.patternId === 'O2b' && P.app.params.sigma === 0.014);
  P.click('#tour-open');
  check('tour started from O2b selects O2u (state and parameters) and locks the selector',
    P.app.patternId === 'O2u' && diffMax(P.app.sim.readState(), seedOf('O2u')) === 0 && P.app.params.sigma === 0.015
    && [...P.d.querySelectorAll('#seg-pattern button')].every((b) => b.disabled) && !P.$('[data-pattern=locked]').hidden);
  P.d.querySelectorAll('#seg-pattern button')[1].click();
  check('the locked selector ignores clicks during the tour', P.app.patternId === 'O2u');
  const step = (n) => P.$(`[data-tour-step=${n}]`);
  const next = (n) => P.$(`[data-tour-step=${n}] [data-tour-action=next]`);
  P.click('[data-tour-step=welcome] [data-tour-action=next]');
  check('controls step highlights the real control card', P.$('#card-transport').classList.contains('spot') && P.$('#tour').dataset.modal === 'false' && P.$('#app').inert === false);
  P.click('[data-tour-step=controls] [data-tour-action=next]');
  check('parameters step highlights the parameter card', P.$('#card-params').classList.contains('spot'));
  P.click('[data-tour-step=params] [data-tour-action=next]');
  check('observe step: resets, plays, Next locked until enough steps', !step('observe').hidden && !P.app.paused && next('observe').disabled);
  await until(() => !next('observe').disabled, 'observe gate');
  check('observe step: Next unlocks after the observation', P.app.sim.generation >= EXPERIMENT.observeSteps, `generation=${P.app.sim.generation}`);
  P.click('[data-tour-step=observe] [data-tour-action=next]');
  check('change step: simulation paused, sigma slider highlighted, Next locked', P.app.paused && P.$('[data-param=sigma]').classList.contains('spot') && next('change').disabled);
  const s5 = P.$('#p-sigma'); s5.value = '0.013'; s5.dispatchEvent(new P.w.Event('input', { bubbles: true }));
  await sleep(300);
  check('change step: a wrong value does not unlock Next', next('change').disabled);
  s5.value = String(EXPERIMENT.targetValue); s5.dispatchEvent(new P.w.Event('input', { bubbles: true }));
  await sleep(300);
  check('change step: the target value unlocks Next', !next('change').disabled);
  P.click('[data-tour-step=change] [data-tour-action=next]');
  check('watch step: Next locked until it has actually run', next('watch').disabled);
  P.click('#btn-play');
  await until(() => !next('watch').disabled, 'watch gate');
  const massAfter = sum(P.app.sim.readState());
  check('watch step: the organism has faded on the GPU (what the tour then claims)', massAfter < 0.01, `mass=${massAfter.toFixed(6)}`);
  P.click('[data-tour-step=watch] [data-tour-action=next]');
  check('done step shown', !step('done').hidden && P.$('#tour').dataset.modal === 'true');
  P.click('[data-tour-action=enter]');
  const restored = P.app.sim.readState();
  check('Enter Explorer: tour closed, running, organism and sigma restored (same page, no reload)',
    P.$('#tour').hidden && !P.app.paused && P.app.params.sigma === 0.015 && sum(restored) > 60 && P.$('#app').inert === false, `mass=${sum(restored).toFixed(2)}`);
  check('no WebGL errors through the tour', P.app.sim.gl.getError() === P.app.sim.gl.NO_ERROR);
  check('the tour started from O2b ends with O2u selected and the selector usable again',
    P.app.patternId === 'O2u' && [...P.d.querySelectorAll('#seg-pattern button')].every((b) => !b.disabled)
    && P.d.querySelectorAll('#seg-pattern button')[0].getAttribute('aria-pressed') === 'true' && P.$('[data-hud=pattern]').textContent === 'Orbium unicaudatus (O2u)');
  P.d.querySelectorAll('#seg-pattern button')[1].click();
  check('after the tour the user can select O2b again', P.app.patternId === 'O2b' && diffMax(P.app.sim.readState(), seedOf('O2b')) === 0);

  // ---------- unavailable storage and incompatible URL ----------
  P = await load('&radius=10');
  check('noise start (radius != 13): tour is not offered', P.$('#tour-open').hidden && P.$('#tour').hidden);
  let noiseThrew = false;
  try { P.app.selectPattern('O2u'); } catch (e) { noiseThrew = e.name === 'RangeError'; }
  check('noise start: no organism library (selector locked with a reason, selection refused, no pattern id)',
    P.app.patternId === null && noiseThrew && [...P.d.querySelectorAll('#seg-pattern button')].every((b) => b.disabled) && !P.$('[data-pattern=locked]').hidden);
  check('noise start: Place, Centre and Add are disabled (no organism)', P.$('#btn-place').disabled && P.$('#btn-centre').disabled && P.$('#btn-add').disabled);
} catch (e) {
  failures++;
  log(`FAIL  unexpected exception: ${e && e.stack ? e.stack : e}`, 'fail');
}
localStorage.removeItem(TOUR_STORAGE_KEY);
log('');
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`, failures === 0 ? 'pass' : 'fail');
flush();
document.body.dataset.status = failures === 0 ? 'pass' : 'fail';
