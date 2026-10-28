# Lenia: Continuous Artificial Life Explorer

An interactive WebGL2 simulation of [Lenia](https://chakazul.github.io/lenia.html), a continuous cellular
automaton, built as a static, client-side web app (no backend, no build step, no runtime dependencies).
Computer Graphics Lab project, R. P. Shaha University.

## What you get

An "observatory" layout: the simulation canvas fills the left, a control panel the right (stacked on phones).

- **Guided Discovery** (first visit, or the *Guided tour* button): a skippable, 7-step introduction with concise Bangla
  explanations next to the English. It introduces the real controls, then runs one interactive experiment on the live
  simulation: watch Orbium, lower the growth width sigma from 0.015 to 0.011 (the simulation is paused so you can set the dial),
  press Play and watch the organism fade. *Next* unlocks only when you have actually done each part. Esc or *Skip* leaves at any
  time; leaving (or *Enter Lenia Explorer*) resets Orbium and its parameters and plays. First-visit memory is one flag in
  `localStorage` (`lenia.tour.v1`); if storage is blocked the tour simply shows again. `?tour` forces it open.
- **Lenia Explorer**: Play/Pause, Step (exactly one step, paused only), Reset (initial organism *and* initial parameters; play state
  and speed are kept), Speed (0.25x to 2x of the 60 steps/s base rate), live sliders for mu, sigma and T, two colour maps
  (Observatory, Viridis; display only), status (Running/Paused, generation, pattern, world, render rate), and a
  "What are you observing?" explanation in English and Bangla. Keys: `Space` play/pause, `S` step, `R` reset.
- Kernel radius and grid size are shown but not adjustable (Orbium only exists at radius 13; see `DECISIONS.md` 10).

## Run it

Requires Node 18+ only to serve files and run tests (ES modules do not load from `file://`).

```bash
npm start        # http://localhost:8080/   (PORT=9000 npm start to change)
npm test         # unit tests (node:test, no dependencies)
```

Browser GPU checks (the last line of each must read `ALL PASS`):

- `http://localhost:8080/tests/browser/gpu-parity.html` - GPU shaders vs the CPU reference, colour map, shader-error reporting.
- `http://localhost:8080/tests/browser/ui-flow.html` - drives the real page: Play/Pause/Step/Reset/parameters/speed/colour, a
  check that repeated interaction never creates a second animation loop, and the whole guided tour including its
  first-visit memory. Takes about a minute on a software GPU.
- `http://localhost:8080/tests/browser/orbium-gpu.html` - the verified Orbium organism on the GPU: parity after 1/5/20 steps,
  a long run (`?long=1000`), observable parity with the CPU, and grid-size independence. Takes about a minute on a software GPU.

URL options (validated and clamped; see `src/simulation/params.js`):
`?grid=64|128|256|512`  `?radius=3..24`  `?seed=<integer>`  `?tour` (open the guided tour)  `?debug` (exposes `window.leniaApp`).

What you see at startup: the verified Orbium organism, run with its own parameters (radius 13, T=10, mu 0.15,
sigma 0.015). The stored pattern is defined at that kernel radius and this project never rescales patterns, so a URL
that changes it (for example `?radius=10`) shows the random-noise start instead, with a note on screen saying why. `?seed=` only
affects the noise start. The default grid is 128 (Orbium is 20 cells wide, so it is twice as large on screen as on 256, and a step
costs a quarter as much). With the noise start the guided tour is not offered, because its experiment is written for Orbium.

## Architecture

```text
index.html, styles.css      page shell, panel and tour markup (strict CSP meta tag, no inline scripts/styles)
src/main.js                 bootstrap: parse params, create App, Controls and Tour, show fatal errors
src/app.js                  owns GPU resources + the single animation loop; play/pause/step/reset, live params, speed, palette
                            (fixed step rate, GPU back-pressure, context loss); UI listens via onStatus()
src/config.js               limits and defaults
src/gl/                     context + capability probe, program compile/link, textures/FBOs, frame fence
src/shaders/                GLSL ES 3.00 as JS string modules (no fetch, no bundler)
src/simulation/             kernel/growth math, params validation, seeds, CPU reference  (pure JS, Node-testable)
                            patterns.js = verified upstream organism data (Orbium O2u); rle.js = strict decoder for it
                            startup.js = decides the starting state + parameters (Orbium, or noise if the URL is incompatible)
                            lenia.js = GPU simulation (ping-pong R32F textures, one fragment pass per step)
src/render/renderer.js      display pass (colour map, smooth magnification) + drawing-buffer sizing
src/simulation/scheduler.js pure per-frame step planning (play / pause / single-step), unit-tested without WebGL
src/ui/                     hud.js (status), controls.js (panel wiring), tour.js (Guided Discovery), experiment.js (tour progress
                            logic), storage.js (first-visit flag), fatal.js. All text via textContent, never innerHTML
tests/unit/                 Node tests for the pure modules (incl. decoder, pattern provenance, placement)
tests/fixtures/             reference decode of O2u produced by the literal upstream decoder
tests/browser/              in-browser GPU-vs-CPU parity check
tools/serve.js              zero-dependency localhost dev server
```

Startup flow: `main.js` -> `planStartup(URL params)` -> `App({ params, initialState })`; `App` uploads `initialState`
to the GPU, and again after a context restore.

Step: `U = K * A` (periodic convolution with a normalised single-ring kernel held in a texture),
`A' = clamp(A + (1/T) * G(U), 0, 1)`, `G(u) = 2 exp(-(u-mu)^2 / (2 sigma^2)) - 1`.
State never leaves the GPU during stepping.

## Security / robustness notes

- No network requests, storage, analytics or secrets. CSP (meta tag in `index.html`):
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`.
  Response-header CSP and other security headers are Phase 6.
- All parameters are validated; kernel radius is lowered automatically to keep `grid^2 * (2R+1)^2` under a cap.
- Drawing buffer is capped at 4096x2160 pixels. WebGL2 absence, float-target absence, shader compile/link failure,
  GPU allocation failure and context loss all produce a user-facing message or recovery, never a silent failure.
- The only persisted data is the tour flag above. Fonts are system stacks (Bengali: Noto Sans Bengali, Nirmala UI, ...), so no font
  files or network requests are needed. The CSP is unchanged.
- Dev server binds to 127.0.0.1, blocks path traversal and dotfiles. Production hosting is Phase 6.

## Third-party data

The Orbium unicaudatus pattern (`src/simulation/patterns.js`) is data from Bert Chan's MIT-licensed Lenia repository,
used verbatim at a pinned commit. See `THIRD_PARTY_NOTICES.md` for the licence text, source file and how to re-verify it.
