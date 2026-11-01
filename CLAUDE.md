# Lenia: Continuous Artificial Life Explorer

Static, client-side WebGL2 app (no backend, no build step, no runtime dependencies). Node is used only to serve files
and run tests.

## Read first (do not duplicate these here)

- `README.md`: architecture map, run/test commands, URL options, security notes.
- `DECISIONS.md`: numbered design decisions, each marked Verified / Decided / Policy. Check it before changing behaviour.
- `progress.md`: phase status, verified facts, unresolved items, planned work. Update it when a claim changes.
- `THIRD_PARTY_NOTICES.md`: provenance and licence of the Orbium data.

## Engineering principles

- WebGL2 is the primary graphics technology. Browser-first; must deploy as plain static files.
- Lightweight: the dev machine has 8 GB RAM. Respect `LIMITS` in `src/config.js` (grid, radius, `maxTapsPerStep`, canvas cap).
- Correct Lenia and honest visualization. Display-only changes (colour maps) must never alter simulation state.
- Secure and modular: validate all external input against `LIMITS`; UI text via `textContent`, never `innerHTML`;
  keep the strict CSP (no inline scripts/styles, no network requests).
- Minimal dependencies, no unnecessary backend. Adding a dependency or build step needs explicit approval.
- Pure simulation code stays in `src/simulation/` (Node-testable); GL code stays in `src/gl/`, `src/render/`, `src/shaders/`.
- Prefer minimal, targeted changes over rewrites. Match the surrounding style and comment density.

## Working rules

- Inspect the actual code before making claims about it. Cite file paths; do not rely on memory of this file or the docs.
- Never describe software-renderer results as hardware-GPU results (`DECISIONS.md` 14), and record the exact renderer string
  with every browser result. Earlier results were from a software renderer (ANGLE with SwiftShader); the results recorded from
  31 Oct 2026 report an AMD Radeon through ANGLE/Direct3D 11 (see `progress.md`). Claim no more than the string shows.
- Patterns are never rescaled (`DECISIONS.md` 10). Do not change Orbium data; its RLE hash is checked by a unit test.
- Any change to simulation maths, shaders, or parameters needs a matching test, and the GPU parity page must still pass.

- Before implementing a requested task, inspect the relevant code and present a concise plan with affected files and expected changes. Wait for explicit approval before modifying project files.

## Git safety

Never commit, push, merge, rebase, reset, or delete branches or files without explicit approval for that specific action.
Approval for one action does not carry over to the next. Check `git status` before and after changes. Report differences
rather than fixing them silently.

## Commands

```bash
npm start     # dev server at http://localhost:8080/
npm test      # unit tests (node:test)
```

Browser GPU checks (open with the dev server running; the last line of each must read `ALL PASS`):
`/tests/browser/gpu-parity.html`, `/tests/browser/orbium-gpu.html`, `/tests/browser/ui-flow.html`.
These are run by hand today; they are not wired into automation.

## Skills

- `lenia-validation`: use when touching the kernel, growth, update rule, shaders, patterns, or parity tests.
- `security-deployment-review`: use for CSP/headers, hosting, input validation, or anything Phase 6.
