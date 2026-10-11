package app.tunera.pitch

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.sin
import kotlin.random.Random
import org.junit.Assert.*
import org.junit.Test

class NativePitchParityTest {
  @Test
  fun `4500 streaming calls preserve all baseline result bits`() {
    var calls = 0
    var results = 0
    for (profile in listOf("low", "general", "high")) {
      for (threshold in listOf(0.05, 0.15, 0.3)) {
        val baseline = BaselinePitchDetector0a88025(profileName = profile, threshold = threshold, minimumRms = 0.0028)
        val candidate = NativePitchDetector(profileName = profile, threshold = threshold, minimumRms = 0.0028)
        val rng = Random(105)
        var offset = 0
        repeat(500) { index ->
          val frequency = when (profile) {
            "low" -> 25.0 + index % 475
            "high" -> 150.0 + (index * 31) % 4350
            else -> 48.0 + (index * 17) % 2152
          }
          val harmonic = PitchTestSignals.tone(frequency, 2400, offset, true)
          val pcm = when (index % 10) {
            0 -> ShortArray(2400)
            1 -> ShortArray(2400) { rng.nextInt(-25000, 25000).toShort() }
            2 -> ShortArray(2400) { (harmonic[it].toInt() + rng.nextInt(-1500, 1500)).coerceIn(-32768, 32767).toShort() }
            3 -> ShortArray(2400) { if (sin(2 * PI * frequency * (it + offset) / 48000.0) > 0) 22000 else -22000 }
            else -> harmonic
          }
          offset += pcm.size
          baseline.accept(pcm, pcm.size)
          candidate.accept(pcm, pcm.size)
          val now = (index + 1) * 50L
          val expected = baseline.analyzeIfDue(now)
          PitchTestSignals.assertExact("$profile threshold=$threshold frame=$index", expected, candidate.analyzeIfDue(now))
          if (expected != null) results++
          calls++
        }
      }
    }
    assertEquals(4500, calls)
    assertEquals(4488, results)
    println("PARITY streaming_calls=$calls completed_results=$results mismatches=0 (raw double bits)")
  }

  @Test
  fun `broad frequency characterization preserves existing baseline limitations`() {
    var cases = 0
    var accuracyFlags = 0
    for ((profile, frequencies) in listOf(
      "low" to listOf(25.0, 27.5, 30.87, 41.2, 55.0, 82.41, 110.0, 220.0, 440.0, 500.0),
      "general" to listOf(48.0, 55.0, 82.41, 110.0, 220.0, 440.0, 880.0, 1760.0, 2093.0, 2200.0),
      "high" to listOf(150.0, 220.0, 440.0, 880.0, 1760.0, 2093.0, 4186.0, 4400.0, 4500.0)
    )) {
      for (frequency in frequencies) for (harmonics in listOf(false, true)) for (offset in listOf(0, 317)) {
        val baseline = BaselinePitchDetector0a88025(profileName = profile, threshold = 0.19, minimumRms = 0.0008)
        val candidate = NativePitchDetector(profileName = profile, threshold = 0.19, minimumRms = 0.0008)
        val pcm = PitchTestSignals.tone(frequency, 8192, offset, harmonics)
        baseline.accept(pcm, pcm.size)
        candidate.accept(pcm, pcm.size)
        val expected = baseline.analyzeIfDue(1000)
        PitchTestSignals.assertExact("$profile $frequency harmonics=$harmonics offset=$offset", expected, candidate.analyzeIfDue(1000))
        val cents = expected?.frequency?.let { abs(1200 * log2(it / frequency)) }
        if (cents == null || cents > 1.0) accuracyFlags++
        cases++
      }
    }
    assertEquals(116, cases)
    // Characterization, NOT an accuracy target or an endorsement of these errors.
    assertEquals("leave unrelated baseline accuracy limitations unchanged", 16, accuracyFlags)
    println("PARITY broad_cases=$cases baseline_missing_or_over_1_cent=$accuracyFlags mismatches=0")
  }

  @Test
  fun `config changes partial decimation and irregular capture chunks match baseline`() {
    val baseline = BaselinePitchDetector0a88025(profileName = "low", threshold = 0.19, minimumRms = 0.0028)
    val candidate = NativePitchDetector(profileName = "low", threshold = 0.19, minimumRms = 0.0028)
    val rng = Random(72)
    var offset = 0
    var now = 0L
    var results = 0
    repeat(1600) { index ->
      if (index % 100 == 0) {
        val profile = listOf("low", "general", "high", "unknown")[(index / 100) % 4]
        val threshold = listOf(-2.0, 0.01, 0.19, 0.9, 2.0)[(index / 100) % 5]
        val rms = if (index % 300 == 0) -1.0 else 0.0028
        baseline.configure(profile, threshold, rms)
        candidate.configure(profile, threshold, rms)
      }
      if (index % 100 == 55) {
        // Same profile: change gates but retain ring, decimation remainder, and clock.
        val profile = listOf("low", "general", "high", "unknown")[(index / 100) % 4]
        baseline.configure(profile, 0.08, 0.8)
        candidate.configure(profile, 0.08, 0.8)
      }
      val size = listOf(1, 479, 480, 481, 997, 2400)[index % 6]
      val pcm = if (index % 7 == 0) ShortArray(size) { rng.nextInt(-32768, 32768).toShort() }
                else PitchTestSignals.tone(41.2 + index % 4500, size, offset, true)
      // Includes short reads, empty reads, and oversize length clamping.
      val length = when (index % 11) { 0 -> 0; 1 -> size + 37; 2 -> size / 2; else -> size }
      offset += size
      baseline.accept(pcm, length)
      candidate.accept(pcm, length)
      now += listOf(0L, 1L, 10L, 49L, 50L, 91L)[index % 6]
      val expected = baseline.analyzeIfDue(now)
      PitchTestSignals.assertExact("configuration streaming index=$index", expected, candidate.analyzeIfDue(now))
      if (expected != null) results++
      assertTrue(candidate.lastYinComparisonCount <= candidate.estimatedComparisonCount())
    }
    assertTrue("must exercise completed analyses, not only warmup nulls", results > 300)
    println("PARITY config_calls=1600 completed_results=$results mismatches=0")
  }

  @Test
  fun `threshold equality is strict at an observed noisy trough`() {
    val rng = Random(92)
    val pcm = PitchTestSignals.tone(440.0, 4096)
    for (i in pcm.indices) pcm[i] = (pcm[i].toInt() / 2 + rng.nextInt(-12000, 12000)).toShort()
    val probe = BaselinePitchDetector0a88025(profileName = "general", threshold = 0.5, minimumRms = 0.0)
    probe.accept(pcm, pcm.size)
    val initial = probe.analyzeIfDue(1000)!!
    assertNotNull(initial.frequency)
    val boundary = 1.0 - initial.confidence
    assertTrue("exercise an unclamped threshold boundary: $boundary", boundary > 0.01 && boundary < 0.5)
    val frequencies = mutableSetOf<Long?>()
    for (threshold in listOf(Math.nextDown(boundary), boundary, Math.nextUp(boundary))) {
      val a = BaselinePitchDetector0a88025(profileName = "general", threshold = threshold, minimumRms = 0.0)
      val b = NativePitchDetector(profileName = "general", threshold = threshold, minimumRms = 0.0)
      a.accept(pcm, pcm.size)
      b.accept(pcm, pcm.size)
      val expected = a.analyzeIfDue(1000)
      PitchTestSignals.assertExact("strict threshold=$threshold", expected, b.analyzeIfDue(1000))
      frequencies.add(expected!!.frequency?.toRawBits())
    }
    assertTrue("boundary must actually change selection", frequencies.size > 1)
  }

  @Test
  fun `strict threshold neighboring doubles and search tail preserve selection`() {
    for ((profile, hz) in listOf("low" to 25.0, "general" to 48.0, "high" to 150.0)) {
      val rng = Random(990)
      val pcm = PitchTestSignals.tone(hz, 8192)
      for (i in pcm.indices) pcm[i] = (pcm[i].toInt() / 2 + rng.nextInt(-8000, 8000)).toShort()
      val probe = BaselinePitchDetector0a88025(profileName = profile, threshold = 0.9, minimumRms = 0.0)
      probe.accept(pcm, pcm.size)
      val confidence = probe.analyzeIfDue(1000)!!.confidence
      val boundary = (1.0 - confidence).coerceIn(0.01, 0.9)
      for (threshold in listOf(-1.0, 0.01, Math.nextDown(boundary), boundary, Math.nextUp(boundary), 0.9, 2.0)) {
        val a = BaselinePitchDetector0a88025(profileName = profile, threshold = threshold, minimumRms = 0.0)
        val b = NativePitchDetector(profileName = profile, threshold = threshold, minimumRms = 0.0)
        a.accept(pcm, pcm.size)
        b.accept(pcm, pcm.size)
        PitchTestSignals.assertExact("tail $profile threshold=$threshold", a.analyzeIfDue(1000), b.analyzeIfDue(1000))
      }
    }
  }
}
