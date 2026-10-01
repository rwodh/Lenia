import { App } from './app.js';
import { Hud } from './ui/hud.js';
import { showFatal } from './ui/fatal.js';
import { normalizeParams, parseQueryParams } from './simulation/params.js';

const canvas = document.getElementById('lenia-canvas');
const hud = new Hud(document.getElementById('hud'));
const fatalPanel = document.getElementById('fatal');

const { params, adjustments } = normalizeParams(parseQueryParams(location.search));
if (adjustments.length) hud.setNote(adjustments.join(' | '));

const app = new App({ canvas, hud, params, onFatal: (e) => showFatal(fatalPanel, e) });
try {
  app.start();
} catch (e) {
  showFatal(fatalPanel, e);
}

// Diagnostics hook for tests, opt-in via ?debug
if (new URLSearchParams(location.search).has('debug')) window.leniaApp = app;
