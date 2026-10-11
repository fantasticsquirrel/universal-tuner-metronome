package app.tunera.pitch

import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin
import org.junit.Assert.*

/** Shared deterministic PCM and bit-exact assertions; no detector algorithm here. */
internal object PitchTestSignals {
  fun tone(frequency: Double, count: Int, offset: Int = 0, harmonics: Boolean = false): ShortArray =
    ShortArray(count) { i ->
      val p = 2.0 * PI * frequency * (i + offset) / 48_000.0
      val value = if (harmonics) 0.4 * sin(p) + 0.2 * sin(2 * p) + 0.1 * sin(3 * p) else 0.7 * sin(p)
      (value * 32767.0).roundToInt().toShort()
    }

  fun assertExact(label: String, expected: NativePitchResult?, actual: NativePitchResult?) {
    if (expected == null) {
      assertNull(label, actual)
      return
    }
    assertNotNull(label, actual)
    actual!!
    assertEquals("$label frequency bits", expected.frequency?.toRawBits(), actual.frequency?.toRawBits())
    assertEquals("$label confidence bits", expected.confidence.toRawBits(), actual.confidence.toRawBits())
    assertEquals("$label RMS bits", expected.rms.toRawBits(), actual.rms.toRawBits())
    assertEquals("$label clipping", expected.clipping, actual.clipping)
    assertEquals("$label timestamp", expected.timestamp, actual.timestamp)
  }
}
