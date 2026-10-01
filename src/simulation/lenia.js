import { createProgram } from '../gl/program.js';
import { createStateTexture, createKernelTexture, createFramebuffer } from '../gl/targets.js';
import fullscreenVert from '../shaders/fullscreen.vert.js';
import stepFrag from '../shaders/lenia-step.frag.js';
import { buildKernel } from './kernel.js';

/**
 * GPU Lenia simulation. State lives in two textures used as ping-pong buffers;
 * one fragment-shader pass per step. No CPU<->GPU transfer happens during stepping.
 * `params` must come from normalizeParams().
 */
export class LeniaSimulation {
  constructor(gl, caps, params) {
    this.gl = gl;
    this.caps = caps;
    this.params = params;
    this.size = params.gridSize;
    this.generation = 0;

    this.program = createProgram(gl, 'lenia-step', fullscreenVert, stepFrag, [
      'uState', 'uKernel', 'uGridSize', 'uRadius', 'uMu', 'uSigma', 'uDt',
    ]);
    this.vao = gl.createVertexArray(); // attribute-less draw still wants a VAO bound in some drivers

    const kernel = buildKernel(params.radius);
    this.kernelTex = createKernelTexture(gl, kernel);

    this.targets = [0, 1].map(() => {
      const tex = createStateTexture(gl, caps.stateFormat, this.size);
      return { tex, fbo: createFramebuffer(gl, tex) };
    });
    this.read = 0; // index of the texture holding the current state
  }

  get stateTexture() {
    return this.targets[this.read].tex;
  }

  /** Replace the state with `data` (Float32Array of size*size, row-major, values in [0,1]) and restart counting. */
  reset(data) {
    const { gl, size } = this;
    if (!(data instanceof Float32Array) || data.length !== size * size) {
      throw new RangeError(`initial state must be a Float32Array of ${size * size} values`);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.stateTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RED, gl.FLOAT, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.generation = 0;
  }

  /** Advance the simulation by one step. */
  step() {
    const { gl, size, params, program } = this;
    const src = this.targets[this.read];
    const dst = this.targets[1 - this.read];

    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, size, size);
    program.use();
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.kernelTex);
    gl.uniform1i(program.uniforms.uState, 0);
    gl.uniform1i(program.uniforms.uKernel, 1);
    gl.uniform1i(program.uniforms.uGridSize, size);
    gl.uniform1i(program.uniforms.uRadius, params.radius);
    gl.uniform1f(program.uniforms.uMu, params.mu);
    gl.uniform1f(program.uniforms.uSigma, params.sigma);
    gl.uniform1f(program.uniforms.uDt, 1 / params.timeSteps);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.read = 1 - this.read;
    this.generation += 1;
  }

  /**
   * Read the current state back to the CPU. Stalls the GPU pipeline: for tests and
   * diagnostics only, never call it from the render loop.
   */
  readState() {
    const { gl, size } = this;
    const buf = new Float32Array(size * size * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[this.read].fbo);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const out = new Float32Array(size * size);
    for (let i = 0; i < out.length; i++) out[i] = buf[i * 4];
    return out;
  }

  dispose() {
    const { gl } = this;
    this.program.dispose();
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.kernelTex);
    for (const t of this.targets) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
  }
}
