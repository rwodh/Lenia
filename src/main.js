import { App } from './app.js';
import { Hud } from './ui/hud.js';
import { Controls } from './ui/controls.js';
import { Tour } from './ui/tour.js';
import { Observatory } from './ui/observatory.js';
import { ViewControls } from './ui/view-controls.js';
import { Panels } from './ui/panels.js';
import { Tooltips } from './ui/tooltips.js';
import { showFatal, hideFatal } from './ui/fatal.js';
import { safeLocalStorage } from './ui/storage.js';
import { parseQueryParams } from './simulation/params.js';
import { planStartup } from './simulation/startup.js';

const canvas = document.getElementById('lenia-canvas');
const hud = new Hud(document);
const fatalPanel = document.getElementById('fatal');

let app = null;
let orbium = false;
try {
  const startup = planStartup(parseQueryParams(location.search));
  if (startup.notes.length) hud.setNote(startup.notes.join(' | '));
  orbium = startup.kind === 'orbium';
  app = new App({
    canvas,
    hud,
    params: startup.params,
    initialState: startup.initialState,
    patternLabel: startup.label,
    patternId: startup.patternId,
    onFatal: (e) => showFatal(fatalPanel, e),
  });
  app.onRecovered = () => hideFatal(fatalPanel);
} catch (e) {
  showFatal(fatalPanel, e);
}

if (app) {
  // The first start can fail (no WebGL2, no float targets, or a context lost while starting). The controls are built anyway,
  // so that if the browser later restores the context the recovered app is usable (decision 33).
  let started = false;
  try {
    app.start();
    started = true;
  } catch (e) {
    showFatal(fatalPanel, e);
  }
  try {
    new Controls(app, document);
    new Observatory(app, document);
    const panels = new Panels(document);
    new Tooltips(document);
    // A click on the world (not a drag) chooses the organism's start cell while Place is armed, or adds a copy while Add is.
    new ViewControls(app, document, { onClick: (cell) => { if (app.placing) app.placeAt(cell); else if (app.adding) app.addAt(cell); } });
    // The guided experiment is written for Orbium; a URL that swaps it for noise gets the plain explorer.
    const tour = new Tour(app, { available: orbium, storage: safeLocalStorage(window), document, panels });
    if (new URLSearchParams(location.search).has('debug')) window.leniaUi = { panels }; // tests open panels through it
    if (started) {
      if (new URLSearchParams(location.search).has('tour')) tour.open();
      else tour.maybeAutoStart();
    }
  } catch (e) {
    showFatal(fatalPanel, e);
  }
}

// Diagnostics hook for tests, opt-in via ?debug
if (app && new URLSearchParams(location.search).has('debug')) window.leniaApp = app;
