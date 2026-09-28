import { PitchFrameBuffer } from '../pitchFrameBuffer';

describe('pitch frame buffering', () => {
  it('orders fragmented native callbacks from oldest to newest', () => {
    const buffer = new PitchFrameBuffer(6);
    buffer.push(new Float32Array([1, 2]));
    expect(buffer.latest()).toBeNull();

    buffer.push(new Float32Array([3, 4, 5, 6]));
    expect([...buffer.latest()!]).toEqual([1, 2, 3, 4, 5, 6]);

    buffer.push(new Float32Array([7, 8]));
    expect([...buffer.latest()!]).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('bounds callback work by discarding the stale prefix of an oversized batch', () => {
    const buffer = new PitchFrameBuffer(4);
    const delayedAndroidBatch = Float32Array.from({ length: 10_000 }, (_, index) => index);

    buffer.push(delayedAndroidBatch);

    expect([...buffer.latest()!]).toEqual([9_996, 9_997, 9_998, 9_999]);
  });

  it('reuses its analysis frame and resets readiness without clearing memory', () => {
    const buffer = new PitchFrameBuffer(4);
    buffer.push(new Float32Array([1, 2, 3, 4]));
    const firstFrame = buffer.latest();

    buffer.push(new Float32Array([5]));
    expect(buffer.latest()).toBe(firstFrame);
    expect([...firstFrame!]).toEqual([2, 3, 4, 5]);

    buffer.reset();
    expect(buffer.ready).toBe(false);
    expect(buffer.latest()).toBeNull();
  });
});
