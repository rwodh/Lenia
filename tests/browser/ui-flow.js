// Integration check of the real page: explorer controls (play/pause/step/reset/params/speed/palette), single animation
// loop, and the Guided Discovery tour including its first-visit memory. Uses only the page's own DOM and the ?debug hook.
import { TOUR_STORAGE_KEY, EXPERIMENT, OBSERVATORY } from '../../src/config.js';
import { computeObservables } from '../../src/simulation/observables.js';
import { getPattern } from '../../src/simulation/patterns.js';
import { decodeRle } from '../../src/simulation/rle.js';
import { placePatternCentred } from '../../src/simulation/seed.js';

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
} catch (e) {
  failures++;
  log(`FAIL  unexpected exception: ${e && e.stack ? e.stack : e}`, 'fail');
}
localStorage.removeItem(TOUR_STORAGE_KEY);
log('');
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`, failures === 0 ? 'pass' : 'fail');
flush();
document.body.dataset.status = failures === 0 ? 'pass' : 'fail';
