// Frozen test-only oracle from 0a88025be4832fd62b2362fdc56e46247d7189e5
// Original NativePitchDetector.kt SHA-256: e90dcee42981918d03e11d800e436e513d8890d97a98e96a8af3a5a9abc0aa91
// Only detector/profile names changed and the shared result DTO removed.
// Do not optimize or fix this fixture when production changes.
package app.tunera.pitch

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

internal enum class BaselinePitchProfile0a88025(
  val analysisSampleRate: Int,
  val frameSize: Int,
  val minimumFrequency: Double,
  val maximumFrequency: Double
) {
  LOW(12_000, 2_048, 25.0, 500.0),
  GENERAL(24_000, 2_048, 48.0, 2_200.0),
  // High notes need enough samples per cycle for sub-cent interpolation. The
  // short frame keeps work bounded even without decimation.
  HIGH(48_000, 2_048, 150.0, 4_500.0);

  companion object {
    fun from(value: String): BaselinePitchProfile0a88025 = when (value) {
      "low" -> LOW
      "high" -> HIGH
      else -> GENERAL
    }
  }
}

/**
 * Allocation-stable streaming YIN detector.
 *
 * PCM is decimated as it arrives, so Android never constructs or sends a raw
 * audio payload to JavaScript. The frame and YIN workspaces are retained for
 * the life of a profile and reused for every analysis.
 */
internal class BaselinePitchDetector0a88025(
  private val captureSampleRate: Int = CAPTURE_SAMPLE_RATE,
  profileName: String,
  threshold: Double,
  minimumRms: Double
) {
  private var profile = BaselinePitchProfile0a88025.from(profileName)
  private var threshold = threshold.coerceIn(0.01, 0.9)
  private var minimumRms = minimumRms.coerceAtLeast(0.0)
  private var decimationFactor = max(1, captureSampleRate / profile.analysisSampleRate)
  private var ring = FloatArray(profile.frameSize)
  private var frame = FloatArray(profile.frameSize)
  private var differences = FloatArray(differenceLimit(profile))
  private var normalizedDifferences = FloatArray(differenceLimit(profile))
  private var writeIndex = 0
  private var filled = 0
  private var decimationSum = 0.0
  private var decimationCount = 0
  private var lastAnalysisAt = -ANALYSIS_INTERVAL_MS

  @Synchronized
  fun configure(profileName: String, threshold: Double, minimumRms: Double) {
    val nextProfile = BaselinePitchProfile0a88025.from(profileName)
    this.threshold = threshold.coerceIn(0.01, 0.9)
    this.minimumRms = minimumRms.coerceAtLeast(0.0)
    if (nextProfile == profile) return

    profile = nextProfile
    decimationFactor = max(1, captureSampleRate / profile.analysisSampleRate)
    ring = FloatArray(profile.frameSize)
    frame = FloatArray(profile.frameSize)
    differences = FloatArray(differenceLimit(profile))
    normalizedDifferences = FloatArray(differenceLimit(profile))
    writeIndex = 0
    filled = 0
    decimationSum = 0.0
    decimationCount = 0
    lastAnalysisAt = -ANALYSIS_INTERVAL_MS
  }

  @Synchronized
  fun accept(samples: ShortArray, length: Int) {
    val safeLength = min(length, samples.size)
    for (index in 0 until safeLength) {
      decimationSum += samples[index].toDouble() / 32_768.0
      decimationCount += 1
      if (decimationCount < decimationFactor) continue

      ring[writeIndex] = (decimationSum / decimationCount).toFloat()
      writeIndex = (writeIndex + 1) % ring.size
      filled = min(ring.size, filled + 1)
      decimationSum = 0.0
      decimationCount = 0
    }
  }

  @Synchronized
  fun analyzeIfDue(nowMs: Long, intervalMs: Long = ANALYSIS_INTERVAL_MS): NativePitchResult? {
    if (filled < ring.size || nowMs - lastAnalysisAt < intervalMs) return null
    lastAnalysisAt = nowMs

    val tailLength = ring.size - writeIndex
    ring.copyInto(frame, 0, writeIndex, ring.size)
    ring.copyInto(frame, tailLength, 0, writeIndex)
    return analyzeFrame(nowMs)
  }

  internal fun estimatedComparisonCount(): Int {
    val limit = differenceLimit(profile)
    return (limit - 1) * (profile.frameSize - (limit - 1))
  }

  private fun analyzeFrame(timestamp: Long): NativePitchResult {
    var squaredSum = 0.0
    var peak = 0.0
    for (sample in frame) {
      val value = sample.toDouble()
      squaredSum += value * value
      peak = max(peak, abs(value))
    }
    val rms = sqrt(squaredSum / frame.size)
    val clipping = peak >= 0.99
    if (rms < minimumRms) {
      return NativePitchResult(null, 0.0, rms, clipping, timestamp)
    }

    val limit = differences.size
    val window = frame.size - (limit - 1)
    differences.fill(0f)
    normalizedDifferences.fill(0f)

    for (lag in 1 until limit) {
      var sum = 0.0
      for (index in 0 until window) {
        val difference = frame[index] - frame[index + lag]
        sum += difference * difference
      }
      differences[lag] = sum.toFloat()
    }

    normalizedDifferences[0] = 1f
    var running = 0.0
    for (lag in 1 until limit) {
      running += differences[lag]
      normalizedDifferences[lag] = if (running > 0.0) {
        (differences[lag] * lag / running).toFloat()
      } else {
        1f
      }
    }

    var lag = 2
    while (lag < limit - 1) {
      if (normalizedDifferences[lag] < threshold) {
        while (
          lag + 1 < limit - 1 &&
          normalizedDifferences[lag + 1] < normalizedDifferences[lag]
        ) {
          lag += 1
        }
        break
      }
      lag += 1
    }
    if (lag >= limit - 1) {
      return NativePitchResult(null, 0.0, rms, clipping, timestamp)
    }

    val left = normalizedDifferences[lag - 1].toDouble()
    val middle = normalizedDifferences[lag].toDouble()
    val right = normalizedDifferences[lag + 1].toDouble()
    val denominator = left - 2.0 * middle + right
    val shift = if (denominator == 0.0) 0.0 else (left - right) / (2.0 * denominator)
    val period = lag + shift.coerceIn(-1.0, 1.0)
    val roughFrequency = profile.analysisSampleRate / period
    val frequency = refineFrequency(roughFrequency)
    if (frequency < profile.minimumFrequency || frequency > profile.maximumFrequency) {
      return NativePitchResult(null, 0.0, rms, clipping, timestamp)
    }

    return NativePitchResult(
      frequency = frequency,
      confidence = (1.0 - middle).coerceIn(0.0, 1.0),
      rms = rms,
      clipping = clipping,
      timestamp = timestamp
    )
  }

  private fun refineFrequency(roughFrequency: Double): Double {
    val center = (profile.analysisSampleRate / roughFrequency).roundToInt()
    if (center < 2 || center + 2 >= frame.size) return roughFrequency
    val window = frame.size - (center + 2)

    fun squaredDifference(lag: Int): Double {
      var sum = 0.0
      for (index in 0 until window) {
        val difference = frame[index] - frame[index + lag]
        sum += difference * difference
      }
      return sum
    }

    val left = squaredDifference(center - 1)
    val middle = squaredDifference(center)
    val right = squaredDifference(center + 1)
    val denominator = left - 2.0 * middle + right
    val shift = if (denominator == 0.0) 0.0 else (left - right) / (2.0 * denominator)
    if (!shift.isFinite() || abs(shift) > 1.0) return roughFrequency
    return profile.analysisSampleRate / (center + shift)
  }

  private fun differenceLimit(profile: BaselinePitchProfile0a88025): Int = min(
    profile.frameSize / 2,
    ceil(profile.analysisSampleRate / profile.minimumFrequency).toInt() + 2
  )

  companion object {
    const val CAPTURE_SAMPLE_RATE = 48_000
    const val ANALYSIS_INTERVAL_MS = 50L
  }
}
