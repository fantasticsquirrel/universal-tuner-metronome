package app.tunera.pitch

import kotlin.math.max

/** AudioRecord capacity and blocking read size are separate capture choices. */
internal class NativeCapturePlan(minimumBufferBytes: Int) {
  init {
    require(minimumBufferBytes > 0)
  }

  val bufferCapacityBytes = max(minimumBufferBytes, NativePitchDetector.CAPTURE_SAMPLE_RATE / 25 * 2) * 2
  // 480 mono PCM16 samples = 10ms at 48kHz: five reads per 50ms analysis
  // hop, without the old 40ms read rounding that hop up to 80ms. Keep the
  // larger AudioRecord safety capacity above; it need not equal a read.
  // This is a scheduling opportunity, not a device real-time guarantee.
  val readSamples = NativePitchDetector.CAPTURE_SAMPLE_RATE / 100
}
