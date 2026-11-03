import { createProgram } from './program.js';
import { createStateTexture, createFramebuffer } from './targets.js';
import fullscreenVert from '../shaders/fullscreen.vert.js';
import accumulateFrag from '../shaders/overlay-accumulate.frag.js';

/** Overlay modes: 0 = off (nothing allocated, no pass), 1 = trails, 2 = activity. */
export const OVERLAY_MODE = Object.freeze({ off: 0, trails: 1, activity: 2 });

/**
 * Accumulates a visualization aid from the simulation state, one pass per simulation step (src/shaders/overlay-accumulate.frag.js).
 * Read-only towards the simulation: it samples the state textures and renders only into its own ping-pong pair, which uses the
 * state's probed renderable format. Allocated when constructed (the App creates it only when a mode is switched on).
 */
export class OverlayAccumulator {
  constructor(gl, caps, size) {
    this.gl = gl;
    this.size = size;
    this.program = createProgram(gl, 'overlay-accumulate', fullscreenVert, accumulateFrag, [
      'uAccum', 'uState', 'uPrevState', 'uMode', 'uDecay',
    ]);
    this.vao = gl.createVertexArray();
    this.targets = [0, 1].map(() => {
      const tex = createStateTexture(gl, caps.stateFormat, size);
      return { tex, fbo: createFramebuffer(gl, tex) };
    });
    this.read = 0;
    this.steps = 0; // accumulation passes since the last clear (tests compare it with the generation)
    this.clear();
  }

  get texture() {
    return this.targets[this.read].tex;
  }

  /** Zero both accumulation textures. */
  clear() {
    const { gl } = this;
    for (const t of this.targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.steps = 0;
  }

  /** One accumulation pass: `stateTex` is the state after the step, `prevStateTex` the state before it. */
  accumulate(stateTex, prevStateTex, mode, decay) {
    const { gl, size, program } = this;
    const src = this.targets[this.read], dst = this.targets[1 - this.read];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, size, size);
    program.use();
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, stateTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, prevStateTex);
    gl.uniform1i(program.uniforms.uAccum, 0);
    gl.uniform1i(program.uniforms.uState, 1);
    gl.uniform1i(program.uniforms.uPrevState, 2);
    gl.uniform1i(program.uniforms.uMode, mode);
    gl.uniform1f(program.uniforms.uDecay, decay);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    this.read = 1 - this.read;
    this.steps += 1;
  }

  /** Copy of the accumulated values (tests and diagnostics only: stalls the GPU pipeline). */
  readValues() {
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
    for (const t of this.targets) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
  }
}
