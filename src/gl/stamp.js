import { createProgram } from './program.js';
import { createPatternTexture } from './targets.js';
import fullscreenVert from '../shaders/fullscreen.vert.js';
import stampFrag from '../shaders/stamp.frag.js';

/**
 * Phase 4b: adds a copy of a decoded pattern into a running simulation's state, combined with `max`
 * (src/shaders/stamp.frag.js). One pass into the other ping-pong target; nothing is read back to the CPU and no state is
 * uploaded. Pattern textures are uploaded once per pattern and kept. Not a step: the generation is unchanged.
 */
export class StampPass {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, 'stamp', fullscreenVert, stampFrag, ['uState', 'uPattern', 'uOrigin', 'uPatternSize', 'uGridSize']);
    this.vao = gl.createVertexArray();
    this.textures = new Map(); // pattern key -> texture
  }

  /** Add `pattern` (decoded, { width, height, data }) with its centre cell on (x, y) of `sim`; `key` caches its texture. */
  apply(sim, key, pattern, x, y) {
    const { gl, program } = this;
    const n = sim.size;
    if (![x, y].every((v) => Number.isInteger(v) && v >= 0 && v < n)) throw new RangeError(`cell (${x}, ${y}) is not in the grid`);
    if (pattern.width > n || pattern.height > n) throw new RangeError('pattern does not fit in the grid');
    let tex = this.textures.get(key);
    if (!tex) {
      tex = createPatternTexture(gl, pattern);
      this.textures.set(key, tex);
    }
    const wrap = (v) => ((v % n) + n) % n;
    const ox = wrap(x - Math.floor(pattern.width / 2)), oy = wrap(y - Math.floor(pattern.height / 2));
    sim.replaceState((fbo, stateTex) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, n, n);
      program.use();
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(program.uniforms.uState, 0);
      gl.uniform1i(program.uniforms.uPattern, 1);
      gl.uniform2i(program.uniforms.uOrigin, ox, oy);
      gl.uniform2i(program.uniforms.uPatternSize, pattern.width, pattern.height);
      gl.uniform1i(program.uniforms.uGridSize, n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
    });
  }

  dispose() {
    const { gl } = this;
    this.program.dispose();
    gl.deleteVertexArray(this.vao);
    for (const t of this.textures.values()) gl.deleteTexture(t);
    this.textures.clear();
  }
}
