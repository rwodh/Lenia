import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseHeadersFile, headersFor, metaCsp, parseCsp, HEADERS_FILE_LIMITS } from '../../tools/headers.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const rules = parseHeadersFile(read('_headers'));
const forPath = (p) => headersFor(rules, p);
const sorted = (csp) => [...csp].sort();
const testPages = readdirSync(new URL('../browser/', import.meta.url)).filter((f) => f.endsWith('.html'));
// Every HTML page the site serves, as the host may request it (Cloudflare also serves pages without the .html extension).
const appPaths = ['/', '/index.html'];
// The not-found page as requested directly (a host serves it at unknown paths, where only the /* rule matches).
const notFoundPaths = ['/404.html', '/404'];
const testPaths = testPages.flatMap((f) => [`/tests/browser/${f}`, `/tests/browser/${f.slice(0, -5)}`]);

test('the production CSP header for the app equals the meta CSP in index.html, plus frame-ancestors only', () => {
  const meta = parseCsp(metaCsp(read('index.html')));
  for (const p of appPaths) {
    const header = parseCsp(forPath(p).get('content-security-policy'));
    assert.equal(header.get('frame-ancestors'), "'self'", `${p}: frame-ancestors is set by the header (a meta tag cannot set it)`);
    header.delete('frame-ancestors');
    assert.deepEqual(sorted(header), sorted(meta), p);
  }
});

test('the not-found page: its meta CSP equals the app\'s, and a direct request gets the app\'s header CSP', () => {
  assert.deepEqual(sorted(parseCsp(metaCsp(read('404.html')))), sorted(parseCsp(metaCsp(read('index.html')))));
  const app = sorted(parseCsp(forPath('/').get('content-security-policy')));
  for (const p of notFoundPaths) assert.deepEqual(sorted(parseCsp(forPath(p).get('content-security-policy'))), app, p);
  // At an unknown path the host serves this page with the headers of that path: no CSP header, only the common ones.
  assert.equal(forPath('/no-such-page').get('content-security-policy'), undefined);
  assert.equal(forPath('/no-such-page').get('x-content-type-options'), 'nosniff');
  // Root-relative links, because a host serves the page at any depth.
  const html = read('404.html');
  assert.match(html, /href="\/404\.css"/);
  assert.match(html, /<a href="\/">/);
});

test('the browser check pages get the app CSP plus frame-src \'self\' only (ui-flow.html frames index.html)', () => {
  const app = parseCsp(forPath('/').get('content-security-policy'));
  for (const p of testPaths) {
    const header = parseCsp(forPath(p).get('content-security-policy'));
    assert.equal(header.get('frame-src'), "'self'", p);
    header.delete('frame-src');
    assert.deepEqual(sorted(header), sorted(app), p);
  }
});

test('each HTML page matches exactly one CSP rule (the host would enforce two CSP headers together)', () => {
  for (const p of [...appPaths, ...notFoundPaths, ...testPaths]) {
    const n = rules.filter((r) => headersFor([r], p).has('content-security-policy')).length;
    assert.equal(n, 1, p);
  }
});

test('every CSP stays strict: no inline or eval sources, no remote origins', () => {
  for (const p of [...appPaths, ...notFoundPaths, ...testPaths]) {
    const csp = forPath(p).get('content-security-policy');
    assert.match(csp, /default-src 'none'/, p);
    assert.doesNotMatch(csp, /unsafe-|https?:|\*|blob:/, p);
  }
});

test('every path gets the security and cache headers', () => {
  for (const p of ['/', '/index.html', '/src/main.js', '/styles.css', '/tests/browser/ui-flow.html', '/404.html', '/404.css', '/no-such-page']) {
    const h = forPath(p);
    assert.equal(h.get('x-content-type-options'), 'nosniff', p);
    assert.equal(h.get('referrer-policy'), 'no-referrer', p);
    assert.match(h.get('permissions-policy'), /camera=\(\)/, p);
    assert.equal(h.get('cache-control'), 'no-cache', p); // revalidate every load: unhashed modules never mix across deploys
  }
});

test('the _headers file stays within the host limits', () => {
  assert.ok(rules.length <= HEADERS_FILE_LIMITS.maxRules);
  for (const line of read('_headers').split(/\r?\n/)) assert.ok(line.length <= HEADERS_FILE_LIMITS.maxLineLength);
});

test('no shipped HTML page uses inline scripts or styles (the CSP would block them)', () => {
  const pages = ['index.html', '404.html', ...testPages.map((f) => `tests/browser/${f}`)];
  for (const p of pages) {
    const html = read(p);
    assert.doesNotMatch(html, /<style[\s>]/i, `${p}: <style> block`);
    assert.doesNotMatch(html, /\sstyle=/i, `${p}: style attribute`);
    assert.doesNotMatch(html, /\son[a-z]+=/i, `${p}: inline event handler`);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.match(m[1], /\ssrc=/, `${p}: inline script`);
      assert.equal(m[2].trim(), '', `${p}: inline script body`);
    }
  }
});

test('the headers parser rejects what it cannot interpret and joins repeated headers', () => {
  assert.throws(() => parseHeadersFile('/:id\n  X-A: 1'), SyntaxError);
  assert.throws(() => parseHeadersFile('/*\n  ! X-A'), SyntaxError);
  assert.throws(() => parseHeadersFile('  X-A: 1'), SyntaxError);
  assert.throws(() => parseHeadersFile(`/*\n  X-A: ${'a'.repeat(2000)}`), RangeError);
  const r = parseHeadersFile('# c\n/*\n  X-A: 1\n/a.html\n  X-A: 2\n  X-B: 3\n');
  assert.equal(headersFor(r, '/a.html').get('x-a'), '1, 2');
  assert.equal(headersFor(r, '/b.html').get('x-b'), undefined);
});
