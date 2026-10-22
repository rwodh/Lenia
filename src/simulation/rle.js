import { LeniaError } from '../errors.js';
import { LIMITS } from '../config.js';

/**
 * Decoder for the Lenia 2D run-length format used by the upstream catalogue
 * (Chakazul/Lenia Python/LeniaND.py, Board.rle2arr with DIM = 2).
 *
 * Grammar (strict; anything else is rejected rather than guessed at):
 *   pattern := token* '!'?
 *   token   := count? cell | count? '$'
 *   cell    := '.' | 'b'            level 0
 *            | 'o'                  level 255
 *            | 'A'..'X'             levels 1..24
 *            | ('p'..'y') 'A'..'X'  levels 25..255   (level = (prefix-'p')*24 + (letter-'A') + 25)
 *   count   := decimal integer >= 1 (repeat count; for '$', number of row ends)
 *
 * A cell level L means state L / 255. Rows are listed top to bottom and padded with zeros on the
 * right to the widest row. A '$' ends the current row; "n$" ends it and adds n-1 blank rows.
 * Deliberate difference from upstream: a trailing '$' does not create an extra blank row.
 *
 * Returns { width, height, data } with data a row-major Float32Array (row 0 = first RLE row).
 * Throws LeniaError('PATTERN_INVALID') for malformed or over-limit input.
 */
export function decodeRle(text, {
  maxDimension = LIMITS.pattern.maxDimension,
  maxLength = LIMITS.pattern.maxRleLength,
} = {}) {
  const fail = (reason, at) => {
    throw new LeniaError('PATTERN_INVALID', 'The pattern data is not valid.', {
      detail: at === undefined ? reason : `${reason} (at character ${at})`,
    });
  };

  if (typeof text !== 'string') fail('pattern must be a string');
  if (text.length === 0) fail('pattern is empty');
  if (text.length > maxLength) fail(`pattern is longer than ${maxLength} characters`);

  const end = text.endsWith('!') ? text.length - 1 : text.length;
  const rows = [];
  let row = [];
  let count = 0; // 0 = no explicit count
  let prefix = -1; // index 0..9 of 'p'..'y', or -1

  for (let i = 0; i < end; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);

    if (code >= 48 && code <= 57) { // '0'..'9'
      if (prefix >= 0) fail('a count must come before a level prefix', i);
      count = count * 10 + (code - 48);
      if (count > maxDimension) fail(`repeat count exceeds ${maxDimension}`, i);
      if (count === 0) fail('repeat count must be at least 1', i); // rejects "0..." leading zero
      continue;
    }

    if (ch === '$') {
      if (prefix >= 0) fail('level prefix without a level letter', i);
      const n = count || 1;
      if (rows.length + n > maxDimension) fail(`pattern is taller than ${maxDimension} rows`, i);
      rows.push(row);
      for (let k = 1; k < n; k++) rows.push([]);
      row = [];
      count = 0;
      continue;
    }

    let level;
    if (code >= 112 && code <= 121 && prefix < 0) { // 'p'..'y'
      prefix = code - 112;
      continue;
    } else if (prefix >= 0) {
      if (code < 65 || code > 88) fail('level prefix must be followed by a letter A-X', i);
      level = prefix * 24 + (code - 65) + 25;
      if (level > 255) fail(`level ${level} is out of range 0-255`, i);
    } else if (ch === '.' || ch === 'b') {
      level = 0;
    } else if (ch === 'o') {
      level = 255;
    } else if (code >= 65 && code <= 88) { // 'A'..'X'
      level = code - 65 + 1;
    } else {
      fail(`unexpected character ${JSON.stringify(ch)}`, i);
    }

    const n = count || 1;
    if (row.length + n > maxDimension) fail(`pattern is wider than ${maxDimension} columns`, i);
    for (let k = 0; k < n; k++) row.push(level);
    count = 0;
    prefix = -1;
  }

  if (count !== 0) fail('repeat count at end of pattern has nothing to repeat', end);
  if (prefix >= 0) fail('level prefix at end of pattern has no level letter', end);
  if (row.length > 0) {
    if (rows.length + 1 > maxDimension) fail(`pattern is taller than ${maxDimension} rows`, end);
    rows.push(row);
  }

  const height = rows.length;
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (height < 1 || width < 1) fail('pattern has no cells');

  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) data[y * width + x] = r[x] / 255;
  }
  return { width, height, data };
}
