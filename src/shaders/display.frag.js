// Draws the simulation state to the screen: aspect-correct square fit, smooth
// (manual bilinear) magnification, and a viridis colour map. Cell (0,0) is bottom-left.
export default /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform int uGridSize;
uniform vec2 uCanvasSize;

out vec4 outColor;

const vec3 BACKGROUND = vec3(0.043, 0.051, 0.071);

// Polynomial approximation of the viridis colour map (t in [0,1]).
vec3 viridis(float t) {
  const vec3 c0 = vec3(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
  const vec3 c1 = vec3(0.1050930431085774, 1.404613529898575, 1.384590162594685);
  const vec3 c2 = vec3(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
  const vec3 c3 = vec3(-4.634230498983486, -5.799100973351585, -19.33244095627987);
  const vec3 c4 = vec3(6.228269936347081, 14.17993336680509, 56.69055260068105);
  const vec3 c5 = vec3(4.776384997670288, -13.74514537774601, -65.35303263337234);
  const vec3 c6 = vec3(-5.435455855934631, 4.645852612178535, 26.3124352495832);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

float cell(ivec2 c) {
  ivec2 n = ivec2(uGridSize);
  return texelFetch(uState, ((c % n) + n) % n, 0).r;
}

// Bilinear sample at a position in cell units (cell centres at +0.5), periodic.
float sampleState(vec2 pos) {
  vec2 p = pos - 0.5;
  ivec2 i0 = ivec2(floor(p));
  vec2 f = fract(p);
  return mix(mix(cell(i0), cell(i0 + ivec2(1, 0)), f.x),
             mix(cell(i0 + ivec2(0, 1)), cell(i0 + ivec2(1, 1)), f.x), f.y);
}

void main() {
  float side = min(uCanvasSize.x, uCanvasSize.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uCanvasSize) / side + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) {
    outColor = vec4(BACKGROUND, 1.0);
    return;
  }
  float v = clamp(sampleState(uv * float(uGridSize)), 0.0, 1.0);
  outColor = vec4(clamp(viridis(v), 0.0, 1.0), 1.0);
}
`;
