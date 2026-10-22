import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRle } from '../../src/simulation/rle.js';
import { LeniaError } from '../../src/errors.js';
import { mulberry32 } from '../../src/simulation/seed.js';

const levels = (d) => Array.from(d.data, (v) => Math.round(v * 255));
const rejects = (input, opts) =>
  assert.throws(() => decodeRle(input, opts), (e) => e instanceof LeniaError && e.code === 'PATTERN_INVALID' && typeof e.userMessage === 'string',
    `expected PATTERN_INVALID for ${JSON.stringify(typeof input === 'string' ? input.slice(0, 40) : input)}`);

test('single-letter, dot and b/o levels', () => {
  const d = decodeRle('.AXbo!');
  assert.deepEqual([d.width, d.height], [5, 1]);
  assert.deepEqual(levels(d), [0, 1, 24, 0, 255]);
});

test('prefixed levels follow level = (prefix-p)*24 + (letter-A) + 25, max yO = 255', () => {
  assert.deepEqual(levels(decodeRle('pA pX qA rA yN yO'.replaceAll(' ', '') + '!')), [25, 48, 49, 73, 254, 255]);
});

test('repeat counts, row ends, and zero padding to the widest row', () => {
  const d = decodeRle('3A$.2B!');
  assert.deepEqual([d.width, d.height], [3, 2]);
  assert.deepEqual(levels(d), [1, 1, 1, 0, 2, 2]);
  const e = decodeRle('AAA$A!');
  assert.deepEqual([e.width, e.height], [3, 2]);
  assert.deepEqual(levels(e), [1, 1, 1, 1, 0, 0]);
  assert.deepEqual(levels(decodeRle('2pA!')), [25, 25]);
});

test('"n$" ends a row and adds n-1 blank rows; a trailing $ adds no extra row', () => {
  const d = decodeRle('A3$B!');
  assert.deepEqual([d.width, d.height], [1, 4]);
  assert.deepEqual(levels(d), [1, 0, 0, 2]);
  assert.equal(decodeRle('A$B$!').height, 2);
  assert.equal(decodeRle('A$B$').height, 2);
});

test('"$$" is two row ends: a blank second row, so ..$$ is a valid 2x2 all-zero pattern', () => {
  const d = decodeRle('..$$');
  assert.deepEqual([d.width, d.height], [2, 2]);
  assert.deepEqual(levels(d), [0, 0, 0, 0]);
});

test('"." is a zero cell, not a decimal point: 1.5A is one zero then five A cells', () => {
  const d = decodeRle('1.5A');
  assert.deepEqual([d.width, d.height], [6, 1]);
  assert.deepEqual(levels(d), [0, 1, 1, 1, 1, 1]);
});

test('the terminating "!" is optional', () => {
  assert.deepEqual(levels(decodeRle('2A$B')), levels(decodeRle('2A$B!')));
});

test('values are state = level / 255 as Float32 in [0, 1]', () => {
  const d = decodeRle('oA.!');
  assert.ok(d.data instanceof Float32Array);
  assert.deepEqual(Array.from(d.data), [1, Math.fround(1 / 255), 0]);
});

test('malformed input is rejected with PATTERN_INVALID and a character position', () => {
  const bad = ['', '!', '$', '$!', 'Z', 'a', 'AB C', 'A\nB', '-1A', '1,5A', '0A', '05A', '3', 'A5', 'A5$$7', 'p', 'A$p', 'pp', 'pZ', 'p.', 'p3A',
    'yP', 'yX', '3p$', '@A', '%', '#', 'A\u00e9', 'A\u0000'];
  for (const s of bad) rejects(s);
  for (const x of [null, undefined, 5, {}, [], Symbol.iterator]) rejects(x);
  try { decodeRle('AAA#'); assert.fail('should throw'); } catch (e) { assert.match(e.detail, /at character 3/); }
});

test('limits: counts, width, height and total length are bounded before allocating', () => {
  rejects('257A');
  rejects('99999999999999999999A');
  rejects('200A200A');
  rejects('A200$A200$');
  rejects('A257$');
  rejects('A'.repeat(100_001));
  rejects('A$'.repeat(257));
  rejects('4A', { maxDimension: 3 });
  rejects('A$A$A$A', { maxDimension: 3 });
  rejects('AAAA', { maxLength: 3 });
  assert.equal(decodeRle('256A!').width, 256);
  assert.equal(decodeRle('A256$').height, 256);
  const big = decodeRle(('256A$'.repeat(255)) + '256A!');
  assert.deepEqual([big.width, big.height, big.data.length], [256, 256, 65536]);
});

test('fuzz: arbitrary strings either decode within limits or throw LeniaError, never anything else', () => {
  const rand = mulberry32(12345);
  const alphabet = '0123456789.$!AXbopqyyOZ@ \n-';
  let decoded = 0;
  for (let n = 0; n < 4000; n++) {
    const len = 1 + Math.floor(rand() * 40);
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
    try {
      const d = decodeRle(s);
      decoded++;
      assert.ok(d.width >= 1 && d.height >= 1 && d.width <= 256 && d.height <= 256);
      assert.equal(d.data.length, d.width * d.height);
      assert.ok(d.data.every((v) => v >= 0 && v <= 1));
    } catch (e) {
      assert.ok(e instanceof LeniaError && e.code === 'PATTERN_INVALID', `unexpected ${e && e.name}: ${e && e.message} for ${JSON.stringify(s)}`);
    }
  }
  assert.ok(decoded > 50, `fuzz should exercise the success path too (decoded=${decoded})`);
});
