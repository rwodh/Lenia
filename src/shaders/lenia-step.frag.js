// One Lenia step: U = K * A (periodic convolution), A' = clamp(A + dt * G(U), 0, 1).
// State is a single-channel float texture; the kernel is a (2R+1)^2 float texture.
export default /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform sampler2D uKernel;
uniform int uGridSize;
uniform int uRadius;
uniform float uMu;
uniform float uSigma;
uniform float uDt;

out vec4 outState;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int n = uGridSize;
  int k = 2 * uRadius + 1;

  float u = 0.0;
  for (int j = 0; j < k; ++j) {
    for (int i = 0; i < k; ++i) {
      float w = texelFetch(uKernel, ivec2(i, j), 0).r;
      if (w == 0.0) continue;
      // Offsets are >= -R and the grid is larger than R, so adding n keeps the modulo operand positive.
      ivec2 q = (p + ivec2(i - uRadius, j - uRadius) + ivec2(n)) % ivec2(n);
      u += w * texelFetch(uState, q, 0).r;
    }
  }

  float d = u - uMu;
  float g = 2.0 * exp(-(d * d) / (2.0 * uSigma * uSigma)) - 1.0;
  float a = texelFetch(uState, p, 0).r;
  outState = vec4(clamp(a + uDt * g, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;
