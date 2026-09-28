package app.tunera.pitch

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log
import kotlin.math.roundToInt
import kotlin.math.sin
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativePitchDetectorTest {
  @Test
  fun `preserves pitch accuracy across every detector profile`() {
    val cases = listOf(
      Triple("low", 41.2, 8192),
      Triple("general", 440.0, 4096),
      Triple("high", 4400.0, 2048)
    )

    for ((profile, frequency, sampleCount) in cases) {
      val detector = NativePitchDetector(
        profileName = profile,
        threshold = 0.19,
        minimumRms = 0.0008
      )
      detector.accept(sine(frequency, sampleCount), sampleCount)
      val result = detector.analyzeIfDue(1_000)

      assertNotNull("$profile should detect $frequency Hz", result?.frequency)
      val cents = abs(1200.0 * log(result!!.frequency!! / frequency, 2.0))
      assertTrue("$profile error was $cents cents", cents < 1.0)
      assertTrue("$profile confidence was ${result.confidence}", result.confidence > 0.85)
    }
  }

  @Test
  fun `bounds native YIN work on low end devices`() {
    for (profile in listOf("low", "general", "high")) {
      val detector = NativePitchDetector(profileName = profile, threshold = 0.19, minimumRms = 0.0008)
      assertTrue("$profile comparison budget", detector.estimatedComparisonCount() < 800_000)
    }
  }

  @Test
  fun `does not publish silence as pitch`() {
    val detector = NativePitchDetector(profileName = "general", threshold = 0.19, minimumRms = 0.0028)
    val silence = ShortArray(4096)
    detector.accept(silence, silence.size)
    val result = detector.analyzeIfDue(1_000)
    assertNotNull(result)
    assertTrue(result!!.frequency == null)
  }

  private fun sine(frequency: Double, sampleCount: Int): ShortArray = ShortArray(sampleCount) { index ->
    val phase = 2.0 * PI * frequency * index / NativePitchDetector.CAPTURE_SAMPLE_RATE
    (sin(phase) * 0.7 * Short.MAX_VALUE).roundToInt().toShort()
  }
}
