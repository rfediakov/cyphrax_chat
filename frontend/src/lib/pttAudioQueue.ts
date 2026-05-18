/**
 * PTTAudioQueue — queues and plays incoming PTT audio chunks in order.
 * Uses the Web Audio API to decode and schedule opus/webm buffers.
 */
export class PTTAudioQueue {
  private ctx: AudioContext | null = null;
  private queue: AudioBuffer[] = [];
  private playing = false;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  async enqueue(chunk: ArrayBuffer): Promise<void> {
    try {
      const ctx = this.getContext();

      // AudioContext may be suspended until user gesture on some browsers
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const buffer = await ctx.decodeAudioData(chunk.slice(0));
      this.queue.push(buffer);
      if (!this.playing) {
        this.playNext();
      }
    } catch (err) {
      console.warn('[PTTAudioQueue] Failed to decode chunk:', err);
    }
  }

  private playNext(): void {
    const ctx = this.getContext();
    if (!this.queue.length) {
      this.playing = false;
      return;
    }
    this.playing = true;
    const src = ctx.createBufferSource();
    src.buffer = this.queue.shift()!;
    src.connect(ctx.destination);
    src.onended = () => this.playNext();
    src.start();
  }

  /** Clear pending queue (e.g. when PTT session ends abruptly). */
  flush(): void {
    this.queue = [];
    this.playing = false;
  }

  destroy(): void {
    this.flush();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}
