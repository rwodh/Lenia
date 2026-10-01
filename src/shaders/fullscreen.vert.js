// Attribute-less fullscreen triangle: draw with gl.drawArrays(TRIANGLES, 0, 3).
export default /* glsl */ `#version 300 es
precision highp float;

void main() {
  // gl_VertexID 0,1,2 -> (0,0), (2,0), (0,2): one oversized triangle covers the screen.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
