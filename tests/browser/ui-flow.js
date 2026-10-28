// Integration check of the real page: explorer controls (play/pause/step/reset/params/speed/palette), single animation
// loop, and the Guided Discovery tour including its first-visit memory. Uses only the page's own DOM and the ?debug hook.
import { TOUR_STORAGE_KEY, EXPERIMENT } from '../../src/config.js';

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
  const raf = w.requestAnimationFrame.bind(w);
  const probe = { pending: 0, max: 0 };
  w.requestAnimationFrame = (cb) => { probe.pending++; return raf((t) => { probe.pending--; cb(t); }); };
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

  // ---------- returning visit: no auto tour; reopen works; experiment is interactive ----------
  P = await load('');
  check('returning visit: tour does not auto-open', P.$('#tour').hidden);
  check('"Guided tour" button is available', !P.$('#tour-open').hidden);
  P.click('#tour-open');
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

  // ---------- unavailable storage and incompatible URL ----------
  P = await load('&radius=10');
  check('noise start (radius != 13): tour is not offered', P.$('#tour-open').hidden && P.$('#tour').hidden);
} catch (e) {
  failures++;
  log(`FAIL  unexpected exception: ${e && e.stack ? e.stack : e}`, 'fail');
}
localStorage.removeItem(TOUR_STORAGE_KEY);
log('');
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`, failures === 0 ? 'pass' : 'fail');
flush();
document.body.dataset.status = failures === 0 ? 'pass' : 'fail';
