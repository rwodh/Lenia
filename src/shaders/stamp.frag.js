// Phase 4b: add a copy of a pattern into the live state. Every cell covered by the pattern (placed with its origin at
// uOrigin, wrapping across the world's edges) becomes max(state, pattern); every other cell is copied unchanged.
// Rendered into the other ping-pong target; it is not a simulation step. CPU twin: stampMax() in src/simulation/seed.js.
export default /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform sampler2D uPattern;
uniform ivec2 uOrigin;      // grid cell of pattern cell (0, 0), in [0, n)
uniform ivec2 uPatternSize;
uniform int uGridSize;

out vec4 outState;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 n = ivec2(uGridSize);
  float a = texelFetch(uState, p, 0).r;
  ivec2 local = (p - uOrigin + n) % n; // both operands non-negative: GLSL leaves % undefined for negative ones
  if (local.x < uPatternSize.x && local.y < uPatternSize.y) a = max(a, texelFetch(uPattern, local, 0).r);
  outState = vec4(a, 0.0, 0.0, 1.0);
}
`;
