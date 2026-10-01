import { LeniaError } from '../errors.js';

function checkAlloc(gl, what) {
  const err = gl.getError();
  if (err !== gl.NO_ERROR) {
    throw new LeniaError(
      'GPU_ALLOC',
      'The GPU could not allocate the memory needed for the simulation. Try a smaller grid (e.g. ?grid=128).',
      { detail: `${what}: GL error 0x${err.toString(16)}` },
    );
  }
}

function newTexture(gl, internalFormat, width, height, data, what) {
  const tex = gl.createTexture();
  if (!tex) throw new LeniaError('GPU_ALLOC', 'The GPU could not create a texture.', { detail: what });
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // exact texelFetch reads; no filtering extension needed
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
  if (data) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  checkAlloc(gl, what);
  return tex;
}

/** Square single-channel state texture in the probed renderable format, optionally initialised from Float32Array. */
export function createStateTexture(gl, format, size, data = null) {
  return newTexture(gl, gl[format.internalFormat], size, size, data, `state ${size}x${size} ${format.name}`);
}

/** Single-channel 32-bit float texture for the (read-only) convolution kernel. */
export function createKernelTexture(gl, kernel) {
  return newTexture(gl, gl.R32F, kernel.size, kernel.size, kernel.data, `kernel ${kernel.size}x${kernel.size}`);
}

/** Framebuffer rendering into `tex`; throws if the GPU rejects the combination. */
export function createFramebuffer(gl, tex) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fbo);
    throw new LeniaError('FRAMEBUFFER_INCOMPLETE', 'The GPU rejected the simulation render target.', {
      detail: `status 0x${status.toString(16)}`,
    });
  }
  return fbo;
}
