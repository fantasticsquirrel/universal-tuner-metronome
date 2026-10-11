package app.tunera.pitch

import org.junit.Assert.*
import org.junit.Test

class NativeCapturePlanTest {
  @Test
  fun `blocking capture reads permit 50ms analyses after full profile warmup`() {
    for (minimumBytes in listOf(1, 3840, 4096, 9600)) {
      val plan = NativeCapturePlan(minimumBytes)
      for ((profile, firstExpected) in listOf("low" to 180L, "general" to 90L, "high" to 50L)) {
        val detector = NativePitchDetector(profileName = profile, threshold = 0.19, minimumRms = 0.0028)
        val samples = ShortArray(plan.readSamples)
        val emissions = mutableListOf<Long>()
        var captured = 0L
        while (captured < 48_000) {
          captured += samples.size
          val now = captured * 1000 / NativePitchDetector.CAPTURE_SAMPLE_RATE
          detector.accept(samples, samples.size)
          detector.analyzeIfDue(now)?.let { emissions.add(it.timestamp) }
        }
        val gaps = emissions.zipWithNext { a, b -> b - a }.distinct()
        assertEquals("$profile minimumBytes=$minimumBytes analysis gaps", listOf(50L), gaps)
        assertEquals("$profile must fill the unchanged analysis window", firstExpected, emissions.first())
      }
    }
  }

  @Test
  fun `read quantum is independent of unchanged recorder safety capacity`() {
    for ((minimum, capacity) in listOf(1 to 7680, 3840 to 7680, 4096 to 8192, 9600 to 19200)) {
      val plan = NativeCapturePlan(minimum)
      assertEquals("preserve AudioRecord safety bytes", capacity, plan.bufferCapacityBytes)
      assertEquals("10ms mono PCM16 at 48kHz", 480, plan.readSamples)
    }
  }

  @Test
  fun `late or partial arrivals do not burst or analyze early`() {
    val plan = NativeCapturePlan(9600)
    val detector = NativePitchDetector(profileName = "high", threshold = 0.19, minimumRms = 0.0028)
    val pcm = ShortArray(plan.readSamples)
    detector.accept(ShortArray(2048), 2048)
    assertNotNull(detector.analyzeIfDue(1000))
    for (now in listOf(1000L, 1001L, 1010L, 1049L)) {
      detector.accept(pcm, 1)
      assertNull(detector.analyzeIfDue(now))
    }
    assertNotNull(detector.analyzeIfDue(1050))
    assertNotNull(detector.analyzeIfDue(1247))
    assertNull("no catch-up burst", detector.analyzeIfDue(1247))
    assertNull(detector.analyzeIfDue(1296))
    assertNotNull(detector.analyzeIfDue(1297))
  }
}
