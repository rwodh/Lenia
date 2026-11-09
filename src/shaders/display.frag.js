// Draws the simulation state to the screen: aspect-correct square fit, smooth
// (manual bilinear) magnification, and a selectable colour map (0 = viridis, 1 = observatory).
// Colour is display only; the simulation state is never modified. Cell (0,0) is bottom-left.
// World View (src/render/view-math.js has the same mapping in JS): uZoom magnifies about the canvas centre and uOffset (cells)
// shifts the world; one period of the periodic world is drawn around the view centre, wrapping seamlessly across its edges.
// The default view (zoom 1, offset 0) evaluates exactly the original expressions, so it draws the same bytes as before.
export default /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform int uGridSize;
uniform vec2 uCanvasSize;
uniform int uPalette;
uniform float uZoom;
uniform vec2 uOffset;
// Visualization aid (src/gl/overlay.js): 0 = off (the state itself, as before), 1 = trails, 2 = activity. When on, the overlay
// texture is drawn instead of the state, multiplied by uOverlayScale (1 for trails; (1 - decay) / dt for activity, which maps
// the largest possible sustained change to 1).
uniform sampler2D uOverlay;
uniform int uOverlayMode;
uniform float uOverlayScale;

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

// Dark navy -> ocean -> teal -> pale aqua -> amber. A mild gamma lifts the faint outer cells of an organism.
vec3 observatory(float v) {
  float t = pow(v, 0.75);
  vec3 c = vec3(0.035, 0.070, 0.135);
  c = mix(c, vec3(0.040, 0.230, 0.400), clamp(t / 0.25, 0.0, 1.0));
  c = mix(c, vec3(0.090, 0.560, 0.650), clamp((t - 0.25) / 0.25, 0.0, 1.0));
  c = mix(c, vec3(0.590, 0.910, 0.830), clamp((t - 0.50) / 0.25, 0.0, 1.0));
  c = mix(c, vec3(1.000, 0.850, 0.520), clamp((t - 0.75) / 0.25, 0.0, 1.0));
  return c;
}

// c >= -1: inside the drawn square pos = uv * n + uOffset with uv in [0, 1) and uOffset in [0, n) (viewUniforms), so the
// bilinear footprint starts at floor(pos - 0.5) >= -1. c + n is then >= n - 1 >= 0, and both operands of % are non-negative
// (GLSL ES leaves % undefined for a negative operand). Same index as the old ((c % n) + n) % n wherever that was defined.
float cell(ivec2 c) {
  ivec2 n = ivec2(uGridSize);
  return texelFetch(uState, (c + n) % n, 0).r;
}

// Bilinear sample at a position in cell units (cell centres at +0.5), periodic.
float sampleState(vec2 pos) {
  vec2 p = pos - 0.5;
  ivec2 i0 = ivec2(floor(p));
  vec2 f = fract(p);
  return mix(mix(cell(i0), cell(i0 + ivec2(1, 0)), f.x),
             mix(cell(i0 + ivec2(0, 1)), cell(i0 + ivec2(1, 1)), f.x), f.y);
}

float overlayCell(ivec2 c) { // same index range and reasoning as cell()
  ivec2 n = ivec2(uGridSize);
  return texelFetch(uOverlay, (c + n) % n, 0).r;
}

// Same bilinear, periodic sampling as sampleState, from the overlay texture.
float sampleOverlay(vec2 pos) {
  vec2 p = pos - 0.5;
  ivec2 i0 = ivec2(floor(p));
  vec2 f = fract(p);
  return mix(mix(overlayCell(i0), overlayCell(i0 + ivec2(1, 0)), f.x),
             mix(overlayCell(i0 + ivec2(0, 1)), overlayCell(i0 + ivec2(1, 1)), f.x), f.y);
}

void main() {
  float side = min(uCanvasSize.x, uCanvasSize.y) * uZoom;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uCanvasSize) / side + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) {
    outColor = vec4(BACKGROUND, 1.0);
    return;
  }
  vec2 pos = uv * float(uGridSize) + uOffset;
  float v = uOverlayMode == 0 ? clamp(sampleState(pos), 0.0, 1.0) : clamp(sampleOverlay(pos) * uOverlayScale, 0.0, 1.0);
  outColor = vec4(clamp(uPalette == 1 ? observatory(v) : viridis(v), 0.0, 1.0), 1.0);
}
`;
