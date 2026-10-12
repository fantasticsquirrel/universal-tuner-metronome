package app.tunera.pitch

import kotlin.random.Random
import org.junit.Assert.*
import org.junit.Test

class NativePitchWorkTest {
  @Test
  fun `periodic inputs stop YIN search after first trough plus right neighbor`() {
    for ((profile, hz, maxFraction) in listOf(Triple("low", 41.2, 0.7), Triple("general", 440.0, 0.2), Triple("high", 4400.0, 0.1))) {
      val detector = NativePitchDetector(profileName = profile, threshold = 0.19, minimumRms = 0.0008)
      val baseline = BaselinePitchDetector0a88025(profileName = profile, threshold = 0.19, minimumRms = 0.0008)
      val pcm = PitchTestSignals.tone(hz, 8192)
      detector.accept(pcm, pcm.size)
      baseline.accept(pcm, pcm.size)
      val actual = detector.analyzeIfDue(1000)
      PitchTestSignals.assertExact(profile, baseline.analyzeIfDue(1000), actual)
      assertNotNull(actual!!.frequency)
      assertTrue("$profile must perform real comparisons", detector.lastYinComparisonCount > 0)
      assertTrue("$profile comparisons=${detector.lastYinComparisonCount} full=${detector.estimatedComparisonCount()}",
        detector.lastYinComparisonCount < detector.estimatedComparisonCount() * maxFraction)
      println("WORK profile=$profile yin_comparisons=${detector.lastYinComparisonCount} full=${detector.estimatedComparisonCount()}")
    }
  }

  @Test
  fun `noise and zero energy fallback retain full search and null pitch`() {
    for (profile in listOf("low", "general", "high")) {
      val rng = Random(651)
      for (pcm in listOf(ShortArray(8192), ShortArray(8192) { rng.nextInt(-25000, 25000).toShort() }, ShortArray(8192) { 22000 })) {
        val candidate = NativePitchDetector(profileName = profile, threshold = 0.01, minimumRms = 0.0)
        val baseline = BaselinePitchDetector0a88025(profileName = profile, threshold = 0.01, minimumRms = 0.0)
        baseline.accept(pcm, pcm.size)
        candidate.accept(pcm, pcm.size)
        val result = candidate.analyzeIfDue(1000)
        PitchTestSignals.assertExact(profile, baseline.analyzeIfDue(1000), result)
        assertNull(result!!.frequency)
        assertEquals("no threshold hit must scan to end", candidate.estimatedComparisonCount(), candidate.lastYinComparisonCount)
      }
    }
  }

  @Test
  fun `RMS gate skips all YIN work and retains clipping and threshold equality`() {
    val d = NativePitchDetector(profileName = "general", threshold = 0.19, minimumRms = 0.0)
    val tone = PitchTestSignals.tone(440.0, 4096)
    d.accept(tone, tone.size)
    val first = d.analyzeIfDue(1000)!!
    d.configure("general", 0.19, first.rms)
    assertNotNull("RMS equal to minimum is not gated", d.analyzeIfDue(1050)!!.frequency)
    d.configure("general", 0.19, Math.nextUp(first.rms))
    assertNull(d.analyzeIfDue(1100)!!.frequency)
    assertEquals(0, d.lastYinComparisonCount)
    d.configure("general", 0.19, 2.0)
    val clipped = ShortArray(4096) { Short.MAX_VALUE }
    d.accept(clipped, clipped.size)
    val result = d.analyzeIfDue(1150)!!
    assertTrue(result.clipping)
    assertNull(result.frequency)
    assertEquals(0.0, result.confidence, 0.0)
    assertEquals(0, d.lastYinComparisonCount)
    d.configure("low", 0.19, 0.0)
    assertNull("profile switch must refill the bass window", d.analyzeIfDue(1200))
    assertEquals(0, d.lastYinComparisonCount)
  }
}
