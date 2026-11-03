// Minimal zero-dependency static file server for local development (ES modules need http://, not file://).
// Usage: npm start   (PORT=9000 npm start to change the port). Binds to localhost only.
// Options (after `npm start --`):
//   --headers=prod   send the production headers from `_headers` (as the host would) instead of the dev `no-store`
//   --base=/Lenia/   serve the site under a subpath, to check that nothing assumes it is hosted at the root
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHeadersFile, headersFor } from './headers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8080;
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const prodRules = args.headers === 'prod' ? parseHeadersFile(readFileSync(path.join(root, '_headers'), 'utf8')) : null;
const base = `/${(args.base || '').split('/').filter(Boolean).join('/')}/`.replace('//', '/');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  let sitePath = '/';
  const send = (code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
    const headers = prodRules
      ? Object.fromEntries(headersFor(prodRules, sitePath))
      : { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    res.writeHead(code, { ...headers, ...extra, 'Content-Type': type });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath === base.slice(0, -1)) return send(301, '', undefined, { Location: base });
    if (!urlPath.startsWith(base)) return send(404, 'Not found');
    sitePath = '/' + urlPath.slice(base.length);
    if (prodRules && sitePath === '/_headers') return send(404, 'Not found'); // hosts read it but do not serve it
    let file = path.resolve(root, '.' + (sitePath.endsWith('/') ? sitePath + 'index.html' : sitePath));
    const rel = path.relative(root, file);
    // Stay inside the repo; never serve dotfiles/dot-directories (.git) or node_modules.
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some((s) => s.startsWith('.') || s === 'node_modules')) {
      return send(403, 'Forbidden');
    }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    send(200, await readFile(file), types[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(404, 'Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Lenia dev server: http://localhost:${port}${base}${prodRules ? '  (production headers from _headers)' : ''}`);
});
