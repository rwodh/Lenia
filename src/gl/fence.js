/**
 * Bounds how many frames of GPU work may be queued, using non-blocking WebGL2 fence syncs.
 * Without this, a GPU slower than the loop silently accumulates a deep command queue:
 * the UI lags, the HUD overstates performance, and long stalls can trigger driver resets.
 */
export class FrameFence {
  constructor(gl, maxInFlight = 2) {
    this.gl = gl;
    this.maxInFlight = maxInFlight;
    this.pending = [];
  }

  /** Retire finished frames (never blocks). True if another frame may be submitted now. */
  canSubmit() {
    const { gl, pending } = this;
    while (pending.length && gl.getSyncParameter(pending[0], gl.SYNC_STATUS) === gl.SIGNALED) {
      gl.deleteSync(pending.shift());
    }
    return pending.length < this.maxInFlight;
  }

  /** Call once after submitting all commands for a frame. */
  mark() {
    const { gl } = this;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (sync) this.pending.push(sync);
    gl.flush(); // fences only make progress once the commands are flushed
  }

  dispose() {
    for (const s of this.pending) this.gl.deleteSync(s);
    this.pending.length = 0;
  }
}
