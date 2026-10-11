package app.tunera.pitch

import java.util.Locale

/** Advisory warmed host-JVM timing. Never a wall-clock CI pass/fail gate. */
fun main() {
  Locale.setDefault(Locale.US)
  println("HOST_BENCH JVM=${System.getProperty("java.version")} arch=${System.getProperty("os.arch")} NOT Android ART/device latency or energy")
  for ((profile, hz, count) in listOf(Triple("low", 41.2, 8192), Triple("general", 440.0, 4096), Triple("high", 4400.0, 2048))) {
    val baseline = BaselinePitchDetector0a88025(profileName = profile, threshold = 0.19, minimumRms = 0.0008)
    val candidate = NativePitchDetector(profileName = profile, threshold = 0.19, minimumRms = 0.0008)
    val pcm = PitchTestSignals.tone(hz, count)
    baseline.accept(pcm, pcm.size)
    candidate.accept(pcm, pcm.size)
    var now = 1000L
    repeat(600) {
      now += 50
      PitchTestSignals.assertExact("warmup", baseline.analyzeIfDue(now), candidate.analyzeIfDue(now))
    }
    val before = DoubleArray(1500)
    val after = DoubleArray(1500)
    repeat(before.size) { i ->
      now += 50
      val a: NativePitchResult?
      val b: NativePitchResult?
      if (i % 2 == 0) {
        var start = System.nanoTime()
        a = baseline.analyzeIfDue(now)
        before[i] = (System.nanoTime() - start) / 1e6
        start = System.nanoTime()
        b = candidate.analyzeIfDue(now)
        after[i] = (System.nanoTime() - start) / 1e6
      } else {
        var start = System.nanoTime()
        b = candidate.analyzeIfDue(now)
        after[i] = (System.nanoTime() - start) / 1e6
        start = System.nanoTime()
        a = baseline.analyzeIfDue(now)
        before[i] = (System.nanoTime() - start) / 1e6
      }
      PitchTestSignals.assertExact("timed $profile $i", a, b)
    }
    before.sort()
    after.sort()
    println("BENCH profile=$profile hz=$hz warmup=600 samples=1500 baseline_p50_ms=${"%.4f".format(before[750])} optimized_p50_ms=${"%.4f".format(after[750])} ratio=${"%.2f".format(before[750] / after[750])} baseline_p95_ms=${"%.4f".format(before[1425])} optimized_p95_ms=${"%.4f".format(after[1425])} yin_comparisons=${candidate.lastYinComparisonCount} full=${candidate.estimatedComparisonCount()}")
    for (readSamples in listOf(1920, NativeCapturePlan(3840).readSamples)) {
      val detector = NativePitchDetector(profileName = profile, threshold = 0.19, minimumRms = 0.0008)
      val emissions = mutableListOf<Long>()
      var captured = 0
      while (captured < 48000) {
        val chunk = PitchTestSignals.tone(hz, readSamples, captured)
        detector.accept(chunk, chunk.size)
        captured += chunk.size
        detector.analyzeIfDue(captured * 1000L / 48000)?.let { emissions.add(it.timestamp) }
      }
      println("SIMULATED_CAPTURE profile=$profile read_samples=$readSamples first_result_ms=${emissions.first()} subsequent_gaps_ms=${emissions.zipWithNext { a, b -> b - a }.distinct()} results=${emissions.size}")
    }
  }
}
