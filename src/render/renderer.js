import { createProgram } from '../gl/program.js';
import { LIMITS } from '../config.js';
import fullscreenVert from '../shaders/fullscreen.vert.js';
import displayFrag from '../shaders/display.frag.js';

const DEFAULT_VIEW = Object.freeze({ offsetX: 0, offsetY: 0, zoom: 1 });

/** Draws the simulation state texture to the canvas and owns drawing-buffer sizing. */
export class Renderer {
  constructor(gl, canvas, caps) {
    this.gl = gl;
    this.canvas = canvas;
    this.caps = caps;
    this.program = createProgram(gl, 'display', fullscreenVert, displayFrag, [
      'uState', 'uGridSize', 'uCanvasSize', 'uPalette', 'uZoom', 'uOffset',
    ]);
    this.vao = gl.createVertexArray();
    this.palette = 0; // viridis; the app selects its own default through setPalette()
  }

  /** 'viridis' or 'observatory'. Display only. */
  setPalette(name) {
    this.palette = name === 'observatory' ? 1 : 0;
  }

  /**
   * Resize the drawing buffer to cssWidth x cssHeight (CSS px) * devicePixelRatio,
   * bounded by GPU viewport limits and LIMITS.maxCanvasPixels. Returns true if it changed.
   */
  resize(cssWidth, cssHeight, devicePixelRatio = 1) {
    const [maxW, maxH] = this.caps.maxViewport;
    let w = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    let h = Math.max(1, Math.round(cssHeight * devicePixelRatio));
    const scale = Math.min(1, maxW / w, maxH / h, Math.sqrt(LIMITS.maxCanvasPixels / (w * h)));
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
    if (w === this.canvas.width && h === this.canvas.height) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  /** `view` is { offsetX, offsetY, zoom } from viewUniforms() (src/ui/view-math.js); omitted = the default fit. */
  draw(stateTexture, gridSize, view = DEFAULT_VIEW) {
    const { gl, program, canvas } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    program.use();
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateTexture);
    gl.uniform1i(program.uniforms.uState, 0);
    gl.uniform1i(program.uniforms.uGridSize, gridSize);
    gl.uniform2f(program.uniforms.uCanvasSize, canvas.width, canvas.height);
    gl.uniform1i(program.uniforms.uPalette, this.palette);
    gl.uniform1f(program.uniforms.uZoom, view.zoom);
    gl.uniform2f(program.uniforms.uOffset, view.offsetX, view.offsetY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    this.program.dispose();
    this.gl.deleteVertexArray(this.vao);
  }
}
