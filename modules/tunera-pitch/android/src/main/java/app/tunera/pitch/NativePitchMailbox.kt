package app.tunera.pitch

internal data class NativePitchDelivery(val result: NativePitchResult, val ageMs: Long)

/**
 * A latest-value slot with one outstanding consumer wake per capture session.
 *
 * The wake remains outstanding until take(), including while the JS thread is
 * busy. Producers overwrite the slot instead of building an event backlog.
 * All operations are constant-time; never hold this lock during DSP or I/O.
 */
internal class NativePitchMailbox {
  private var session = 0L
  private var latest: NativePitchResult? = null
  private var wakePending = false

  @Synchronized
  fun reset(): Long {
    session += 1
    latest = null
    wakePending = false
    return session
  }

  @Synchronized
  fun isCurrent(expectedSession: Long): Boolean = expectedSession == session

  /** Returns true only when the caller should schedule a new consumer wake. */
  @Synchronized
  fun publish(expectedSession: Long, result: NativePitchResult): Boolean {
    if (expectedSession != session) return false
    latest = result
    if (wakePending) return false
    wakePending = true
    return true
  }

  @Synchronized
  fun take(expectedSession: Long, nowMs: Long): NativePitchDelivery? {
    if (expectedSession != session) return null
    val result = latest
    latest = null
    wakePending = false
    return result?.let { NativePitchDelivery(it, (nowMs - it.timestamp).coerceAtLeast(0L)) }
  }
}
