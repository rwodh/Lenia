import test from 'node:test';
import assert from 'node:assert/strict';
import fullscreenVert from '../../src/shaders/fullscreen.vert.js';
import stepFrag from '../../src/shaders/lenia-step.frag.js';
import displayFrag from '../../src/shaders/display.frag.js';
import overlayFrag from '../../src/shaders/overlay-accumulate.frag.js';
import stampFrag from '../../src/shaders/stamp.frag.js';

// "#version" must be the very first characters of a GLSL ES 3.00 shader; a stray
// leading newline from a template literal is a classic compile failure.
test('shader sources start with #version 300 es and declare precision', () => {
  for (const [name, src] of Object.entries({ fullscreenVert, stepFrag, displayFrag, overlayFrag, stampFrag })) {
    assert.ok(src.startsWith('#version 300 es\n'), `${name} must start with #version 300 es`);
    assert.match(src, /precision highp float;/, `${name} declares float precision`);
    assert.match(src, /void main\s*\(\s*\)/, `${name} has main()`);
  }
});

// GLSL ES 3.00 leaves `%` undefined when an operand is negative. Every integer remainder in the shaders must add the
// modulus first (or otherwise keep the left operand provably non-negative); the bare "x % n" with a possibly negative x
// (e.g. the old ((c % n) + n) % n) is not allowed. The bounds are argued next to each use.
test('integer remainders in the shaders keep both operands non-negative', () => {
  for (const [name, src] of Object.entries({ stepFrag, displayFrag, overlayFrag, stampFrag })) {
    const code = src.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\(\s*c\s*%\s*n\s*\)/, `${name}: remainder of an unshifted, possibly negative index`);
    for (const m of code.matchAll(/\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*%/g)) {
      assert.match(m[1], /\+\s*(n|ivec2\(n\))\s*$/, `${name}: "(${m[1].trim()}) %" must add the modulus before the remainder`);
    }
  }
});
