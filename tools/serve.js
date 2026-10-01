// Minimal zero-dependency static file server for local development (ES modules need http://, not file://).
// Usage: npm start   (PORT=9000 npm start to change the port). Binds to localhost only.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const send = (code, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + (urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath));
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

server.listen(port, '127.0.0.1', () => console.log(`Lenia dev server: http://localhost:${port}/`));
