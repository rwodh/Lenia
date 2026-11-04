# Deployment

The site is the repository's static files: no build step, no backend, no dependencies (`DECISIONS.md` 1 and 27). Nothing in
this document has been deployed yet; the owner performs and verifies the deployment.

## What is published
The repository root, as tracked by Git, is the site (owner decision D3, 3 Nov 2026; to be revisited before any public
announcement). That includes `index.html`, `styles.css`, `src/`, the browser check pages under `tests/browser/` (useful for
checking the live host), `tests/unit/`, `tools/`, `docs/`, the Markdown files and `.claude/skills/`. All of it becomes public.

- Deploy from Git (the host clones tracked files only). Local files such as `.claude/settings.local.json`, `.claude/launch.json`
  and `.vscode/` are ignored by the repository's `.gitignore`, so they are then not published. A direct upload of the working
  folder would still include them; if a direct upload is ever used, upload a clean export (`git archive`) instead.
- `?debug` exposes `window.leniaApp` (needed by `tests/browser/ui-flow.html`). It reads and drives the page's own state only.
- `_headers` is read by the host and not served (the local server mimics this).

## Host
Chosen provisionally: Cloudflare (owner decision D2). Re-checked on 3 Nov 2026: Cloudflare's Pages documentation now says
"Start new projects with Workers". Both products read the same `_headers` file (at most 100 rules, 2,000 characters per line):

| | Cloudflare Pages (Git integration) | Cloudflare Workers with static assets |
|---|---|---|
| Repository config needed | None beyond `_headers` | A `wrangler.jsonc` (assets directory) and an `.assetsignore` (Workers does not skip `.git`, `node_modules` and similar automatically, unlike Pages); **not prepared**: ask for it if this path is chosen |
| Settings | Framework preset: none. Build command: blank (or `exit 0`; the documentation gives both). Build output directory: `/` (repository root). Production branch: `main` after the phase branches are merged | Static-assets Worker pointing at the repository root |
| Default browser cache | `public, max-age=0, must-revalidate` (documented) | Not checked |

Sources: developers.cloudflare.com/pages/ (callout "Are you sure you want to use Pages?"), /pages/configuration/headers/,
/pages/configuration/build-configuration/, /pages/configuration/serving-pages/, /workers/static-assets/headers/,
/workers/static-assets/migration-guides/migrate-from-pages/ (read 3 Nov 2026).

## Headers (`_headers`)
Every path gets: the CSP from `index.html`'s meta tag plus `frame-ancestors 'self'` (a meta tag cannot set it; `'self'`, not
`'none'`, because `ui-flow.html` drives `index.html` in a same-origin iframe), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, a `Permissions-Policy` that denies sensors, camera, microphone, geolocation, payment and USB,
and `Cache-Control: no-cache`. The modules are unhashed, so every load revalidates them (cheap 304s) and a page never mixes
modules from two deployments, except for a load that overlaps the moment a deployment goes live.
`tests/unit/headers.test.js` fails if the header CSP and the meta CSP drift apart, if the CSP gains inline, eval or remote
sources, or if any shipped HTML page gains an inline script or style.

## Before deploying (local, already done for each phase)
```bash
npm test
npm start -- --headers=prod --base=Lenia
```
Then open `http://localhost:8080/Lenia/` and the three pages under `/Lenia/tests/browser/`; each must end with `ALL PASS`.
(`--base=Lenia` checks that nothing assumes the site lives at the root; in Git Bash write `Lenia`, not `/Lenia/`, because Git
Bash rewrites arguments that start with `/` into Windows paths.)

## After deploying: verification checklist
Replace `SITE` with the deployed origin.
1. HTTPS: `http://SITE/` redirects to `https://`; the certificate is valid.
2. Headers: `curl -sI https://SITE/` and `curl -sI https://SITE/src/main.js` show all five headers above with the values in
   `_headers`. Note the exact `cache-control` value: the host may join its default with ours.
3. Module MIME type: `src/main.js` is served as `text/javascript` (or `application/javascript`).
4. `curl -sI https://SITE/_headers` returns 404.
5. The app loads without console errors and without CSP violation reports; the HUD shows the generation advancing.
6. WebGL error panel: in a browser with WebGL2 disabled (or hardware acceleration off where that removes WebGL2), the
   "Lenia could not start" panel appears with a readable message.
7. Observatory: mass, active area and centroid show values within a few seconds (or "waiting" with the GPU-behind note).
8. Tour: `https://SITE/?tour` opens it; Skip returns to a running Orbium.
9. `https://SITE/tests/browser/gpu-parity.html`, `orbium-gpu.html` and `ui-flow.html` end with `ALL PASS`.

## Real-browser results (to be filled in by the owner)
No performance figure is claimed until this table is filled. Record the renderer string exactly; never call a software renderer
(SwiftShader, llvmpipe, "Basic Render Driver") a hardware GPU result.

| Date | Site URL | Browser and version | OS | Renderer string (HUD or `gpu-parity.html` first line) | HUD render rate (fps) at grid 128 | State format | Observatory samples arriving? | Touch device? Pan/zoom/tour usable? | Tour completed? | Test pages ALL PASS? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | |
