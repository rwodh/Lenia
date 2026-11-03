// Reads the `_headers` file (the subset of the Cloudflare/Netlify format this project uses) so the dev server can send the
// production headers locally and the unit tests can check them. Pure: no file or network access.

/** Host limits for `_headers` (Cloudflare): at most 100 rules, at most 2,000 characters per line. */
export const HEADERS_FILE_LIMITS = Object.freeze({ maxRules: 100, maxLineLength: 2000 });

/**
 * Parse `_headers` text into [{ pattern, headers: [[name, value], ...] }]. A rule is an unindented path pattern followed by
 * indented `Name: value` lines; `#` starts a comment line. Only exact paths and a trailing `*` splat are supported; anything
 * else (placeholders, `!` detach lines, limits exceeded) throws, so a file the local server cannot interpret is never ignored.
 */
export function parseHeadersFile(text) {
  const rules = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.length > HEADERS_FILE_LIMITS.maxLineLength) throw new RangeError(`_headers line ${i + 1} is longer than ${HEADERS_FILE_LIMITS.maxLineLength} characters`);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    if (!/^\s/.test(line)) {
      if (!trimmed.startsWith('/') || trimmed.includes(':') || trimmed.slice(0, -1).includes('*')) {
        throw new SyntaxError(`_headers line ${i + 1}: unsupported path pattern "${trimmed}"`);
      }
      rules.push({ pattern: trimmed, headers: [] });
      return;
    }
    const m = /^([A-Za-z0-9-]+):\s*(.+)$/.exec(trimmed);
    if (!m || !rules.length) throw new SyntaxError(`_headers line ${i + 1}: expected "Name: value" under a path`);
    rules[rules.length - 1].headers.push([m[1], m[2].trim()]);
  });
  if (rules.length > HEADERS_FILE_LIMITS.maxRules) throw new RangeError(`_headers has more than ${HEADERS_FILE_LIMITS.maxRules} rules`);
  return rules;
}

/** Headers for `urlPath` (site-relative, starting with "/"), merged over all matching rules in file order. */
export function headersFor(rules, urlPath) {
  const out = new Map();
  for (const { pattern, headers } of rules) {
    const match = pattern.endsWith('*') ? urlPath.startsWith(pattern.slice(0, -1)) : urlPath === pattern;
    if (!match) continue;
    for (const [name, value] of headers) {
      const key = name.toLowerCase();
      out.set(key, out.has(key) ? `${out.get(key)}, ${value}` : value); // hosts join repeated headers with a comma
    }
  }
  return out;
}

/** The `content` of the Content-Security-Policy meta tag in an HTML document, or null. */
export function metaCsp(html) {
  const tag = /<meta\s[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(html);
  if (!tag) return null;
  const content = /content=(["'])(.*?)\1/is.exec(tag[0]); // the policy itself contains the other quote character
  return content ? content[2].replace(/\s+/g, ' ').trim() : null;
}

/** A CSP as a Map of directive -> sorted source list, so two policies can be compared regardless of order and spacing. */
export function parseCsp(policy) {
  const out = new Map();
  for (const part of String(policy).split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out.set(name.toLowerCase(), sources.sort().join(' '));
  }
  return out;
}
