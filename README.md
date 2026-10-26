# Lenia: Continuous Artificial Life Explorer

An interactive WebGL2 simulation of [Lenia](https://chakazul.github.io/lenia.html), a continuous cellular
automaton, built as a static, client-side web app (no backend, no build step, no runtime dependencies).
Computer Graphics Lab project, R. P. Shaha University.

## Run it

Requires Node 18+ only to serve files and run tests (ES modules do not load from `file://`).

```bash
npm start        # http://localhost:8080/   (PORT=9000 npm start to change)
npm test         # unit tests (node:test, no dependencies)
```

Browser GPU checks (the last line of each must read `ALL PASS`):

- `http://localhost:8080/tests/browser/gpu-parity.html` - GPU shaders vs the CPU reference, colour map, shader-error reporting.
- `http://localhost:8080/tests/browser/orbium-gpu.html` - the verified Orbium organism on the GPU: parity after 1/5/20 steps,
  a long run (`?long=1000`), observable parity with the CPU, and grid-size independence. Takes about a minute on a software GPU.

URL options (validated and clamped; see `src/simulation/params.js`):
`?grid=64|128|256|512`  `?radius=3..24`  `?seed=<integer>`  `?debug` (exposes `window.leniaApp`).

What you see at startup: the verified Orbium organism, run with its own parameters (radius 13, T=10, mu 0.15,
sigma 0.015). Orbium only exists at that kernel radius, and patterns are never rescaled, so a URL that changes it
(for example `?radius=10`) shows the random-noise start instead, with a note on screen saying why. `?seed=` only
affects the noise start. Orbium is 20 cells wide, so `?grid=64` shows it much larger than the default 256 grid.

## Architecture

```text
index.html, styles.css      page shell (strict CSP meta tag, no inline scripts/styles)
src/main.js                 bootstrap: parse params, create App, show fatal errors
src/app.js                  owns GPU resources + animation loop (fixed step rate, GPU back-pressure, context loss)
src/config.js               limits and defaults
src/gl/                     context + capability probe, program compile/link, textures/FBOs, frame fence
src/shaders/                GLSL ES 3.00 as JS string modules (no fetch, no bundler)
src/simulation/             kernel/growth math, params validation, seeds, CPU reference  (pure JS, Node-testable)
                            patterns.js = verified upstream organism data (Orbium O2u); rle.js = strict decoder for it
                            startup.js = decides the starting state + parameters (Orbium, or noise if the URL is incompatible)
                            lenia.js = GPU simulation (ping-pong R32F textures, one fragment pass per step)
src/render/renderer.js      display pass (colour map, smooth magnification) + drawing-buffer sizing
src/ui/                     HUD and fatal-error panel (textContent only)
tests/unit/                 Node tests for the pure modules (incl. decoder, pattern provenance, placement)
tests/fixtures/             reference decode of O2u produced by the literal upstream decoder
tests/browser/              in-browser GPU-vs-CPU parity check
tools/serve.js              zero-dependency localhost dev server
```

Step: `U = K * A` (periodic convolution with a normalised single-ring kernel held in a texture),
`A' = clamp(A + (1/T) * G(U), 0, 1)`, `G(u) = 2 exp(-(u-mu)^2 / (2 sigma^2)) - 1`.
State never leaves the GPU during stepping.

## Security / robustness notes

- No network requests, storage, analytics or secrets. CSP: `default-src 'none'; script-src 'self'; style-src 'self'`.
- All parameters are validated; kernel radius is lowered automatically to keep `grid^2 * (2R+1)^2` under a cap.
- Drawing buffer is capped at 4096x2160 pixels. WebGL2 absence, float-target absence, shader compile/link failure,
  GPU allocation failure and context loss all produce a user-facing message or recovery, never a silent failure.
- Dev server binds to 127.0.0.1, blocks path traversal and dotfiles. Production hosting is Phase 6.

## Third-party data

The Orbium unicaudatus pattern (`src/simulation/patterns.js`) is data from Bert Chan's MIT-licensed Lenia repository,
used verbatim at a pinned commit. See `THIRD_PARTY_NOTICES.md` for the licence text, source file and how to re-verify it.
