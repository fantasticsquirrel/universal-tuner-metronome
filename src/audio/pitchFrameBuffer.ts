/**
 * Fixed-size audio history for live pitch analysis.
 *
 * Audio callbacks can arrive faster than pitch detection runs. Keep only the
 * newest samples and reuse the ordered output buffer so a delayed JS thread
 * neither builds a backlog nor creates a full-frame allocation every tick.
 */
export class PitchFrameBuffer {
  private readonly ring: Float32Array;
  private readonly ordered: Float32Array;
  private writeIndex = 0;
  private sampleCount = 0;

  constructor(readonly frameSize: number) {
    if (!Number.isInteger(frameSize) || frameSize <= 0) {
      throw new RangeError('Pitch frame size must be a positive integer.');
    }
    this.ring = new Float32Array(frameSize);
    this.ordered = new Float32Array(frameSize);
  }

  get ready(): boolean {
    return this.sampleCount === this.frameSize;
  }

  reset(): void {
    this.writeIndex = 0;
    this.sampleCount = 0;
  }

  push(samples: Float32Array): void {
    if (samples.length === 0) return;

    // A large native callback supersedes all existing history. Copying only
    // its tail bounds callback work even if Android batches after a JS stall.
    if (samples.length >= this.frameSize) {
      this.ring.set(samples.subarray(samples.length - this.frameSize));
      this.writeIndex = 0;
      this.sampleCount = this.frameSize;
      return;
    }

    const firstLength = Math.min(samples.length, this.frameSize - this.writeIndex);
    this.ring.set(samples.subarray(0, firstLength), this.writeIndex);
    const secondLength = samples.length - firstLength;
    if (secondLength > 0) this.ring.set(samples.subarray(firstLength), 0);

    this.writeIndex = (this.writeIndex + samples.length) % this.frameSize;
    this.sampleCount = Math.min(this.frameSize, this.sampleCount + samples.length);
  }

  latest(): Float32Array | null {
    if (!this.ready) return null;

    if (this.writeIndex === 0) {
      this.ordered.set(this.ring);
    } else {
      const firstLength = this.frameSize - this.writeIndex;
      this.ordered.set(this.ring.subarray(this.writeIndex), 0);
      this.ordered.set(this.ring.subarray(0, this.writeIndex), firstLength);
    }
    return this.ordered;
  }
}
