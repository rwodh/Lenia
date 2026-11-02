/**
 * Asynchronous GPU -> CPU copy of the simulation state: readPixels into a PIXEL_PACK_BUFFER, a fence sync, and a later
 * getBufferSubData once the fence has signalled. Nothing here ever waits for the GPU: request() only queues commands,
 * poll() only asks whether the fence has signalled (like FrameFence) and copies the data out when it has. That final
 * copy is synchronous CPU work on the main thread (see poll()).
 *
 * Each request carries a caller-supplied `tag` (the app passes the simulation generation and an epoch, captured when
 * the request is made), so a result always describes the state at submission, however late it is retrieved.
 * At most one request is in flight. Buffers are allocated once per instance; poll() reuses the same output array.
 */
export class AsyncReadback {
  constructor(gl, size, { maxPolls = 600 } = {}) {
    this.gl = gl;
    this.size = size;
    this.maxPolls = maxPolls; // a fence that never signals within this many polls is treated as a failure
    this.buffer = gl.createBuffer();
    if (!this.buffer) throw new Error('could not create the readback buffer');
    this.format = null; // chosen on the first request, from the framebuffer's preferred read format
    this.components = 0;
    this.raw = null;
    this.out = new Float32Array(size * size);
    this.pending = null;
    this.failed = null; // reason string once the readback cannot be used any more
  }

  get busy() {
    return this.pending !== null;
  }

  /**
   * Prefer a single-channel float read (4 bytes per cell) when the framebuffer reports it as its implementation read
   * format; otherwise read RGBA/FLOAT, which WebGL2 allows for every float colour buffer (EXT_color_buffer_float).
   * A float16 state reports RED/HALF_FLOAT, so it is read as RGBA/FLOAT and no half-float decoding is needed.
   */
  chooseFormat() { // called with the source bound to READ_FRAMEBUFFER and this.buffer bound to PIXEL_PACK_BUFFER
    const { gl } = this;
    const red = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) === gl.RED
      && gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) === gl.FLOAT;
    this.format = red ? gl.RED : gl.RGBA;
    this.components = red ? 1 : 4;
    gl.bufferData(gl.PIXEL_PACK_BUFFER, this.size * this.size * this.components * 4, gl.STREAM_READ);
    this.raw = red ? this.out : new Float32Array(this.size * this.size * 4);
  }

  /**
   * Queue a copy of `framebuffer` (size x size). Returns false, doing nothing, while a request is in flight or after failure.
   * Only READ_FRAMEBUFFER and PIXEL_PACK_BUFFER are touched, and both are restored to what they were, even if a call throws.
   */
  request(framebuffer, tag) {
    if (this.pending || this.failed) return false;
    const { gl, size } = this;
    const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    try {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);
      if (!this.format) this.chooseFormat();
      gl.readPixels(0, 0, size, size, this.format, gl.FLOAT, 0);
    } finally {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      this.failed = 'fence could not be created';
      return false;
    }
    gl.flush(); // the fence only progresses once the commands are flushed
    this.pending = { sync, tag, polls: 0 };
    return true;
  }

  /**
   * Never blocks. Returns { tag, state } once the requested copy is complete (state is a Float32Array of size*size that
   * is reused by the next result: read it before the next poll), or null while it is not.
   */
  poll() {
    const p = this.pending;
    if (!p) return null;
    const { gl } = this;
    if (gl.getSyncParameter(p.sync, gl.SYNC_STATUS) !== gl.SIGNALED) {
      if (++p.polls > this.maxPolls) {
        this.cancel();
        this.failed = 'the GPU did not complete the copy';
      }
      return null;
    }
    gl.deleteSync(p.sync);
    this.pending = null;
    // Synchronous CPU copy of data the GPU has already finished writing (the fence has signalled). Measured at grid 512
    // on the reported AMD renderer: about 2 to 9 ms once warm, about 45 ms for the first copy (DECISIONS.md 24).
    const prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    try {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.raw);
    } finally {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
    }
    if (this.components === 4) {
      const { raw, out } = this;
      for (let i = 0; i < out.length; i++) out[i] = raw[i * 4];
    }
    return { tag: p.tag, state: this.out };
  }

  /** Forget the in-flight request (its result is no longer wanted). */
  cancel() {
    if (this.pending) this.gl.deleteSync(this.pending.sync);
    this.pending = null;
  }

  dispose() {
    this.cancel();
    this.gl.deleteBuffer(this.buffer);
  }
}
