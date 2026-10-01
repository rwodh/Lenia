import { LeniaError } from '../errors.js';

/** Candidate formats for the simulation state, best first. Each is verified by building a real FBO. */
const STATE_FORMATS = [
  { name: 'float32', internalFormat: 'R32F' },
  { name: 'float16', internalFormat: 'R16F' },
];

function probeStateFormat(gl) {
  // Rendering to float textures needs one of these (WebGL2 does not make it core).
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');

  for (const fmt of STATE_FORMATS) {
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let ok = false;
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl[fmt.internalFormat], 4, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      while (gl.getError() !== gl.NO_ERROR); // drain, so probing never leaks errors into later checks
    }
    if (ok) return fmt;
  }
  return null;
}

/**
 * Create a WebGL2 context and report what the GPU supports.
 * Throws LeniaError with a user-presentable message when the app cannot run.
 */
export function createGLContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    throw new LeniaError(
      'WEBGL2_UNAVAILABLE',
      'WebGL2 is not available in this browser or on this device. Try a current version of Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is enabled.',
    );
  }

  const stateFormat = probeStateFormat(gl);
  if (!stateFormat) {
    throw new LeniaError(
      'FLOAT_TARGETS_UNSUPPORTED',
      'This GPU cannot render to floating-point textures, which the simulation requires.',
    );
  }

  let renderer = 'unknown';
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  } catch {
    /* privacy settings may hide it; informational only */
  }

  return {
    gl,
    caps: {
      stateFormat,
      renderer,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxViewport: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
    },
  };
}
