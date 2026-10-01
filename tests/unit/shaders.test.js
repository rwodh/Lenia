import test from 'node:test';
import assert from 'node:assert/strict';
import fullscreenVert from '../../src/shaders/fullscreen.vert.js';
import stepFrag from '../../src/shaders/lenia-step.frag.js';
import displayFrag from '../../src/shaders/display.frag.js';

// "#version" must be the very first characters of a GLSL ES 3.00 shader; a stray
// leading newline from a template literal is a classic compile failure.
test('shader sources start with #version 300 es and declare precision', () => {
  for (const [name, src] of Object.entries({ fullscreenVert, stepFrag, displayFrag })) {
    assert.ok(src.startsWith('#version 300 es\n'), `${name} must start with #version 300 es`);
    assert.match(src, /precision highp float;/, `${name} declares float precision`);
    assert.match(src, /void main\s*\(\s*\)/, `${name} has main()`);
  }
});
