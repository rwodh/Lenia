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
- `_headers` is a configuration file for the host. The local server (`--headers=prod`) answers 404 (the not-found page) for
  it; that is local behaviour and says nothing about a host, so check the live site (checklist step 4).

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

**Unmatched paths: needs live-host verification.** Nothing here has been observed on a live host. Cloudflare's Pages
documentation says a project with no top-level `404.html` is assumed to be a single-page application, and that the root is
served for a path that matches no asset (/pages/configuration/serving-pages/, read 5 Nov 2026). Since 8 Nov 2026 the repository
has a top-level `404.html` (decision 34), so a Pages deployment is expected to answer unknown paths with that page and status
404 instead of the app; this is an expectation from the documentation, not an observation. The default for Workers was not
confirmed. `404.html` is a static page with no script; its meta CSP is the app's, it links its stylesheet and the app with
root-relative URLs (`/404.css`, `/`), because a host serves it at any depth. At an unknown path no `_headers` path rule matches,
so the page gets only the common headers and relies on its meta CSP (no `frame-ancestors`; the page has no controls).
The local production server (`--headers=prod`) now also answers unknown paths with `404.html` and status 404. Under
`--base=Lenia` its root-relative links point outside the base, so the page shows unstyled and its link leads to a 404; that is
a local-subpath artefact (the chosen host serves the site at the root). Checklist step 4 records the real behaviour.

## Headers (`_headers`)
Which headers a response gets depends on its path, as set in `_headers`:

| Response | Paths | Headers |
|---|---|---|
| Every response | `/*` | The four common headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that denies sensors, camera, microphone, geolocation, payment and USB, and `Cache-Control: no-cache` |
| App document | `/`, `/index.html` | The common headers, plus a `Content-Security-Policy`: the policy in `index.html`'s meta tag plus `frame-ancestors 'self'` |
| Browser check pages | `/tests/browser/*` | The common headers, plus the app policy with `frame-src 'self'` added, because `ui-flow.html` frames `index.html` |
| Not-found page, requested directly | `/404.html`, `/404` | The common headers, plus the app policy (the same line as the app document) |
| Other JavaScript, CSS and static files | For example `/src/main.js`, `/styles.css`, `/docs/DEPLOYMENT.md` | The common headers only, with no CSP |
| Unknown path (the host serves `404.html` there) | For example `/no-such-page` | The common headers only; the page's meta CSP applies |

A CSP controls the document that carries it, so the JavaScript and CSS outside `/tests/browser/` need none: the policy of the
document that loads them applies. The `/tests/browser/*` rule is a wildcard, so the JavaScript and CSS in that folder also carry
the CSP; this is harmless.

`frame-ancestors` works only when delivered in an HTTP response header. Browsers ignore it in a meta CSP, so the meta tag in
`index.html` cannot supply it, and a response without the header has no `frame-ancestors` protection even though the meta tag
is present. The value is `'self'`, not `'none'`, because `ui-flow.html` drives `index.html` in a same-origin iframe.

The modules are unhashed, so every load revalidates them (cheap 304s) and a page never mixes modules from two deployments,
except for a load that overlaps the moment a deployment goes live.
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
Replace `SITE` with the deployed origin. To rehearse the `curl` commands in steps 2 to 4 locally, run the production-header
server above and use `http://localhost:8080/Lenia` in place of `https://SITE`; a local result in step 4 does not predict the host.
1. HTTPS: `http://SITE/` redirects to `https://`; the certificate is valid.
2. Headers, by response type. `-L` follows a redirect, which a host may send for `.html` paths; read the last response. Compare
   the values with `_headers`, and note the exact `cache-control` value: the host may join its default with ours.
   - App document: `curl -sIL https://SITE/` shows the four common headers and a `content-security-policy` that ends in
     `frame-ancestors 'self'`.
   - Check page: `curl -sIL https://SITE/tests/browser/ui-flow.html` shows the four common headers and the same policy with
     `frame-src 'self'` added.
   - JavaScript and CSS: `curl -sIL https://SITE/src/main.js` and `curl -sIL https://SITE/styles.css` show the four common headers
     and no `content-security-policy`. That absence is expected.
3. Module MIME type: `src/main.js` is served as `text/javascript` (or `application/javascript`).
4. Paths that are not site pages. Record each status code, content type and `content-security-policy` value in the Notes column
   of the results table.
   - `_headers`: `curl -sL https://SITE/_headers | grep -c X-Content-Type-Options` prints `0`, meaning the rules are not exposed.
     The status of `curl -sIL https://SITE/_headers` is recorded, not assumed: locally it is 404 with the not-found page, and a
     host may differ.
   - Unmatched path (see "Unmatched paths" under Host): run `curl -sIL https://SITE/no-such-page` and
     `curl -sL https://SITE/no-such-page | grep -c "<h1>Page not found</h1>"`. Expected from the documentation, not assumed: status 404
     and `1` (the not-found page). If it returns the app instead, check for `frame-ancestors`, which is present only if the
     header is sent, and raise it with the owner before any public announcement. Open the page in a browser once: its link
     leads to the app and it shows styled.
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
