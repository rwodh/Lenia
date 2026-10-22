import { App } from './app.js';
import { Hud } from './ui/hud.js';
import { showFatal } from './ui/fatal.js';
import { parseQueryParams } from './simulation/params.js';
import { planStartup } from './simulation/startup.js';

const canvas = document.getElementById('lenia-canvas');
const hud = new Hud(document.getElementById('hud'));
const fatalPanel = document.getElementById('fatal');

let app = null;
try {
  const startup = planStartup(parseQueryParams(location.search));
  if (startup.notes.length) hud.setNote(startup.notes.join(' | '));
  app = new App({
    canvas,
    hud,
    params: startup.params,
    initialState: startup.initialState,
    onFatal: (e) => showFatal(fatalPanel, e),
  });
  app.start();
} catch (e) {
  showFatal(fatalPanel, e);
}

// Diagnostics hook for tests, opt-in via ?debug
if (app && new URLSearchParams(location.search).has('debug')) window.leniaApp = app;
