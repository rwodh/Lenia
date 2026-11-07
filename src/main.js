import { App } from './app.js';
import { Hud } from './ui/hud.js';
import { Controls } from './ui/controls.js';
import { Tour } from './ui/tour.js';
import { Observatory } from './ui/observatory.js';
import { ViewControls } from './ui/view-controls.js';
import { showFatal } from './ui/fatal.js';
import { safeLocalStorage } from './ui/storage.js';
import { parseQueryParams } from './simulation/params.js';
import { planStartup } from './simulation/startup.js';

const canvas = document.getElementById('lenia-canvas');
const hud = new Hud(document);
const fatalPanel = document.getElementById('fatal');

let app = null;
try {
  const startup = planStartup(parseQueryParams(location.search));
  if (startup.notes.length) hud.setNote(startup.notes.join(' | '));
  const orbium = startup.kind === 'orbium';
  app = new App({
    canvas,
    hud,
    params: startup.params,
    initialState: startup.initialState,
    patternLabel: startup.label,
    patternId: startup.patternId,
    onFatal: (e) => showFatal(fatalPanel, e),
  });
  app.start();
  new Controls(app, document);
  new Observatory(app, document);
  new ViewControls(app, document);
  // The guided experiment is written for Orbium; a URL that swaps it for noise gets the plain explorer.
  const tour = new Tour(app, { available: orbium, storage: safeLocalStorage(window), document });
  if (new URLSearchParams(location.search).has('tour')) tour.open();
  else tour.maybeAutoStart();
} catch (e) {
  showFatal(fatalPanel, e);
}

// Diagnostics hook for tests, opt-in via ?debug
if (app && new URLSearchParams(location.search).has('debug')) window.leniaApp = app;
