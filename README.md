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
- **Organisms**: an *Organism* card chooses between two verified organisms from Chan's Lenia catalogue, **Orbium unicaudatus (O2u)**,
  the default, and **Orbium bicaudatus (O2b)**. Choosing one loads its own seed and its own parameters (R, T, mu, sigma), updates the
  status label and the slider "(start: ...)" values, and restarts; Reset (and `R`) then restores the *selected* organism. Play/pause
  and speed are kept. The choice is locked while the guided tour is open (the tour always runs on O2u and ends with it selected) and
  when the URL changes the kernel radius (the noise start has no organisms).
- **Observatory** (read-only): a card with live measurements of the running state: mass (sum of all cell values), active area
  (cells above 0.01), the circular-mean centroid on the wrapping grid (shown only when the values are concentrated), the generation
  each value describes, and a mass-by-generation chart of the last 240 samples. The state is copied from the GPU asynchronously, at
  most every 250 ms (500 ms at grid 512) and not at all while the GPU is behind, so on a slow GPU or a large grid the card can
  stay at "waiting"; nothing waits for the GPU inside the animation frame (the final copy of finished data is synchronous CPU work). Reset, a pattern switch and a context loss clear the
  history.
- **Lenia Explorer**: Play/Pause, Step (exactly one step, paused only), Reset (initial organism *and* initial parameters; play state
  and speed are kept), Speed (0.25x to 2x of the 60 steps/s base rate), live sliders for mu, sigma and T, two colour maps
  (Ocean, Viridis; display only), status (Running/Paused, generation, pattern, world, render rate), and a
  "What are you observing?" explanation in English and Bangla. Keys: `Space` play/pause, `S` step, `R` reset.
- **World View** (display only): zoom with the wheel (about the cursor), a two-finger pinch, the + / - buttons or keys; pan by
  dragging, or with the arrow keys when the view has focus; `0` or *Reset view* shows the whole world again. The world wraps, so
  panning past an edge continues seamlessly. A "Cell (x, y)" readout names the cell under the pointer (cell (0, 0) is bottom-left).
  Reset, organism switches and a context restore keep the view; the guided tour resets it. Zoom never changes the simulation.
- **Overlay** (display only, off by default): *Trails* shows each cell's highest recent value; *Activity* shows how much each
  cell has been changing, scaled so 1 is the largest possible sustained change (1/T per step). Both fade by a chosen factor
  per simulation step (0.80 to 0.999; the half-life is shown) and are drawn instead of the state with the same colour map. They
  are computed from the state on the GPU, one extra pass per step, and never write it. Reset and organism switches clear
  them; the guided tour turns them off.
- **Placement**: *Place*, then click a cell in the view: the selected organism starts with its centre on that cell (copied
  unchanged, wrapping across the edges). Reset restores it there, switching organism keeps the cell, *Centre* returns to the
  launch position, and Escape cancels *Place*. The guided tour always starts and ends with the centred Orbium.
- **Add** (up to 8 per run): *Add*, then click a cell: a copy of the selected organism joins the running world there (where the
  world is not empty, each cell keeps the larger value). The generation does not change; the Observatory keeps its history,
  marks the addition on the chart and tells samples before and after it apart. Reset removes added copies; what happens when
  organisms meet is shown, not predicted.
- Kernel radius and grid size are shown but not adjustable (Orbium only exists at radius 13; see `DECISIONS.md` 10).

## Run it

Requires Node 18+ only to serve files and run tests (ES modules do not load from `file://`).

```bash
npm start        # http://localhost:8080/   (PORT=9000 npm start to change)
npm start -- --headers=prod --base=Lenia   # production headers from _headers, site under /Lenia/ (docs/DEPLOYMENT.md)
npm test         # unit tests (node:test, no dependencies)
```

Browser GPU checks (the last line of each must read `ALL PASS`):

- `http://localhost:8080/tests/browser/gpu-parity.html` - GPU shaders vs the CPU reference, colour map, shader-error reporting, and the
  asynchronous state readback (exact copy, tagged with the generation at submission, float32 and float16 states).
- `http://localhost:8080/tests/browser/ui-flow.html` - drives the real page: Play/Pause/Step/Reset/parameters/speed/colour, organism selection and switching, the
  Observatory (samples, generation tags, Reset/switch/restore clearing, GPU back-off, readback failure, narrow layout), a
  check that repeated interaction never creates a second animation loop, and the whole guided tour including its
  first-visit memory. Takes about a minute on a software GPU.
- `http://localhost:8080/tests/browser/orbium-gpu.html` - each library organism on the GPU (O2u, then O2b with `[O2b]` lines): parity after
  1/5/20 steps, a long run (`?long=1000`), observable parity with the CPU, grid-size independence, and the Observatory's sampled metrics
  against the CPU reference. Pointwise GPU-vs-CPU equality is
  asserted over a short horizon only (200 steps for O2u, 20 for O2b); long-term correctness is judged by behavioural metrics, and long-term
  pointwise equivalence is not claimed (`DECISIONS.md` 23). Takes about a minute on a software GPU.

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
src/gl/                     context + capability probe, program compile/link, textures/FBOs, frame fence,
                            readback.js = asynchronous state copy (pixel-pack buffer + fence; never waits on the GPU)
src/shaders/                GLSL ES 3.00 as JS string modules (no fetch, no bundler); overlay-accumulate.frag.js = trails/activity
src/gl/overlay.js           trails/activity accumulator: its own ping-pong textures, one pass per step, read-only towards the state
src/gl/stamp.js             adds a pattern copy into the live state (max), one pass; stamp.frag.js; CPU twin stampMax in seed.js
src/simulation/             kernel/growth math, params validation, seeds and placement (seed.js), CPU reference  (pure JS, Node-testable)
                            patterns.js = verified upstream organism data and the two-entry registry (O2u, O2b); rle.js = strict decoder
                            startup.js = decides the starting state + parameters (Orbium O2u, or noise if the URL is incompatible); planPattern() plans a selection
                            lenia.js = GPU simulation (ping-pong R32F textures, one fragment pass per step)
src/render/renderer.js      display pass (colour map, smooth magnification, World View uniforms) + drawing-buffer sizing
src/render/view-math.js     World View mapping screen <-> cell, zoom about a point, pan, wrap, limits (pure; same maths as the shader)
src/simulation/scheduler.js pure per-frame step planning (play / pause / single-step), unit-tested without WebGL
src/simulation/observables.js  mass, active area, circular centroid + validity (pure; used by the app and the tests)
src/simulation/sampler.js   when to sample (rate limit, GPU back-off, only on change) and the bounded sample history
src/ui/                     hud.js (status), controls.js (panel wiring), tour.js (Guided Discovery), experiment.js (tour progress
                            logic), storage.js (first-visit flag), observatory.js (Observatory card and chart), view-controls.js (World View
                            input and cell readout), fatal.js. All text via textContent, never innerHTML
tests/unit/                 Node tests for the pure modules (incl. decoder, pattern provenance, placement)
tests/fixtures/             reference decodes of O2u and O2b produced by the upstream decoder source; a frozen copy of the
                            pre-World-View display shader (gpu-parity checks the default view is byte-identical)
tests/browser/              in-browser GPU checks (parity, organisms, readback) and the UI flow; test-pages.css (no inline styles)
tools/serve.js              zero-dependency localhost dev server (optionally the production headers and a subpath)
tools/headers.js            reads _headers (pure; used by serve.js and tests/unit/headers.test.js)
_headers                    production response headers (CSP, nosniff, referrer, permissions, cache policy)
docs/DEPLOYMENT.md          what is published, host settings, post-deploy checklist, real-browser results template
```

Startup flow: `main.js` -> `planStartup(URL params)` -> `App({ params, initialState })`; `App` uploads `initialState`
to the GPU, and again after a context restore.

Step: `U = K * A` (periodic convolution with a normalised single-ring kernel held in a texture),
`A' = clamp(A + (1/T) * G(U), 0, 1)`, `G(u) = 2 exp(-(u-mu)^2 / (2 sigma^2)) - 1`.
State never leaves the GPU during stepping.

## Security / robustness notes

- No network requests, storage, analytics or secrets. CSP (meta tag in `index.html`):
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`.
  For production, `_headers` sends the same CSP as a response header plus `frame-ancestors 'self'`, with `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` and `Cache-Control: no-cache`; `tests/unit/headers.test.js` keeps the two CSPs
  equal. Not deployed yet: see `docs/DEPLOYMENT.md`.
- All parameters are validated; kernel radius is lowered automatically to keep `grid^2 * (2R+1)^2` under a cap.
- Drawing buffer is capped at 4096x2160 pixels. WebGL2 absence, float-target absence, shader compile/link failure,
  GPU allocation failure and context loss all produce a user-facing message or recovery, never a silent failure.
- The only persisted data is the tour flag above. Fonts are system stacks (Bengali: Noto Sans Bengali, Nirmala UI, ...), so no font
  files or network requests are needed. The CSP is unchanged.
- Dev server binds to 127.0.0.1, blocks path traversal and dotfiles; `--headers=prod` sends the production headers. Hosting:
  `docs/DEPLOYMENT.md`.

## Third-party data

The Orbium unicaudatus (O2u) and Orbium bicaudatus (O2b) patterns (`src/simulation/patterns.js`) are data from Bert Chan's MIT-licensed
Lenia repository, used verbatim at a pinned commit. See `THIRD_PARTY_NOTICES.md` for the licence text, source file and how to re-verify it.
