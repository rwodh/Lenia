---
name: security-deployment-review
description: Review Lenia's security posture and static-hosting readiness: CSP and response headers, input validation, third-party data, dev server hardening, and Phase 6 deployment. Use before deploying, when changing index.html, tools/serve.js, URL parameter handling, or adding any dependency or network access.
---

# Security and deployment review

Context: `README.md` "Security / robustness notes", `progress.md` Phase 6 and "Unresolved", `DECISIONS.md` 1.
The app is static files with no backend; keep it that way unless explicitly told otherwise.

## Review checklist (verify in the code, do not assume)
1. **CSP.** Currently a meta tag in `index.html`. Confirm the policy still matches what is shipped (no inline scripts or
   styles, no remote origins). Production should also send it as a response header; meta cannot set `frame-ancestors`.
2. **Other headers for the chosen host:** `X-Content-Type-Options: nosniff`, `Referrer-Policy`, a framing policy, and
   correct MIME types for `.js` modules. Hosts and header syntax differ; check the chosen host's documentation.
3. **Input validation.** URL params (`?grid`, `?radius`, `?seed`, `?tour`, `?debug`) go through `src/simulation/params.js`
   and are bounded by `LIMITS` in `src/config.js`. Confirm any new input is validated there, including decoded pattern
   size (`LIMITS.pattern`). Note `?debug` exposes `window.leniaApp`; decide whether it should ship.
4. **DOM safety.** Text via `textContent`; no `innerHTML`, `eval`, or dynamic script injection (grep to confirm).
5. **Dependencies and network.** No runtime dependencies, fetches, analytics, or secrets. Flag anything new. Check
   `package.json` and run a grep for `fetch(`, `XMLHttpRequest`, `WebSocket`, `import(` and external URLs.
   Inspect matches in context. A URL in documentation or a comment is not automatically a runtime network request.
6. **Third-party data.** `THIRD_PARTY_NOTICES.md` must cover every bundled pattern or asset, with licence text and
   pinned source.
7. **Dev server** (`tools/serve.js`): localhost-only, blocks traversal and dotfiles. It is not a production server.
8. **Deploy readiness.** Everything under the served root is public. Confirm tests, `.git`, `.claude`, and docs you do
   not want published are excluded by the host's publish settings. There is no build step: the deployed artifact is the repo's
   static files.

## Rules
- Do not deploy, change hosting accounts, or modify headers on a live site without explicit approval.
- Report findings by severity with file and line references, and state what you could not verify (for example live
  response headers before a deploy exists).
