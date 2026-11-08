// Visualization aid, one pass per simulation step (display only: it reads the state, never writes it).
// uMode 1 = trails:   H' = max(H * decay, A)            (the highest recent value of each cell, in [0, 1])
// uMode 2 = activity: H' = H * decay + |A - A_previous|  (a decaying sum of how much each cell changed per step)
// H is a separate texture pair (ping-pong); A and A_previous are the state textures after and before the step.
export default /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uAccum;
uniform sampler2D uState;
uniform sampler2D uPrevState;
uniform int uMode;
uniform float uDecay;

out vec4 outValue;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float h = texelFetch(uAccum, p, 0).r;
  float a = texelFetch(uState, p, 0).r;
  if (uMode == 1) {
    h = max(h * uDecay, a);
  } else {
    h = h * uDecay + abs(a - texelFetch(uPrevState, p, 0).r);
  }
  outValue = vec4(h, 0.0, 0.0, 1.0);
}
`;
