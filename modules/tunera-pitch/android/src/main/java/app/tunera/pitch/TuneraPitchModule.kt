package app.tunera.pitch

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

private class PitchPermissionException : CodedException("Microphone permission is required.")
private class PitchRecorderException(message: String) : CodedException(message)

class TuneraPitchModule : Module() {
  private val running = AtomicBoolean(false)
  private val pitchMailbox = NativePitchMailbox()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val recorderLock = Object()
  private var audioRecord: AudioRecord? = null
  private var recordingThread: Thread? = null
  private var detector = NativePitchDetector(
    profileName = "general",
    threshold = 0.15,
    minimumRms = 0.0028
  )

  override fun definition() = ModuleDefinition {
    Name("TuneraPitch")
    Events(PITCH_EVENT, PITCH_AVAILABLE_EVENT, ERROR_EVENT)

    AsyncFunction("start") { options: Map<String, Any?> ->
      startCapture(options)
    }

    AsyncFunction("updateSettings") { options: Map<String, Any?> ->
      detector.configure(
        profileName = options.string("profile", "general"),
        threshold = options.number("threshold", 0.15),
        minimumRms = options.number("minimumRms", 0.0028)
      )
    }

    AsyncFunction("stop") {
      stopCapture()
    }

    Function("isRunning") {
      running.get()
    }

    // Only the constant-time mailbox is read on JS's thread, never the detector
    // monitor or AudioRecord. A null return means no current-session result.
    Function("takeLatestPitch") { session: Long ->
      if (running.get()) pitchMailbox.take(session, SystemClock.elapsedRealtime())?.toPayload() else null
    }

    OnActivityEntersBackground {
      stopCapture()
    }

    OnDestroy {
      stopCapture()
    }
  }

  private fun startCapture(options: Map<String, Any?>) {
    val context = appContext.reactContext ?: throw PitchRecorderException("Audio context is unavailable.")
    if (
      ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      throw PitchPermissionException()
    }

    stopCapture()
    detector = NativePitchDetector(
      profileName = options.string("profile", "general"),
      threshold = options.number("threshold", 0.15),
      minimumRms = options.number("minimumRms", 0.0028)
    )
    val captureDetector = detector
    val latestDelivery = options.string("deliveryMode", "legacy") == "latest"

    val minimumBufferBytes = AudioRecord.getMinBufferSize(
      NativePitchDetector.CAPTURE_SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    if (minimumBufferBytes <= 0) {
      throw PitchRecorderException("This device does not support tuner microphone capture.")
    }
    val capturePlan = NativeCapturePlan(minimumBufferBytes)
    val nextRecorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      NativePitchDetector.CAPTURE_SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      capturePlan.bufferCapacityBytes
    )
    if (nextRecorder.state != AudioRecord.STATE_INITIALIZED) {
      nextRecorder.release()
      throw PitchRecorderException("The tuner microphone could not be initialized.")
    }

    try {
      nextRecorder.startRecording()
    } catch (error: Exception) {
      nextRecorder.release()
      throw PitchRecorderException(error.message ?: "The tuner microphone could not be started.")
    }
    if (nextRecorder.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      nextRecorder.release()
      throw PitchRecorderException("The tuner microphone did not begin recording.")
    }

    synchronized(recorderLock) {
      audioRecord = nextRecorder
      val session = pitchMailbox.reset()
      running.set(true)
      recordingThread = thread(name = "TuneraPitchCapture", start = true) {
        captureLoop(nextRecorder, capturePlan.readSamples, captureDetector, session, latestDelivery)
      }
    }
  }

  private fun captureLoop(
    recorder: AudioRecord,
    readSamples: Int,
    captureDetector: NativePitchDetector,
    session: Long,
    latestDelivery: Boolean
  ) {
    Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
    val samples = ShortArray(readSamples)
    try {
      while (running.get() && pitchMailbox.isCurrent(session) && !Thread.currentThread().isInterrupted) {
        val read = recorder.read(samples, 0, samples.size, AudioRecord.READ_BLOCKING)
        if (!running.get() || !pitchMailbox.isCurrent(session)) break
        if (read > 0) {
          captureDetector.accept(samples, read)
          captureDetector.analyzeIfDue(SystemClock.elapsedRealtime())?.let {
            queuePitchEvent(it, session, latestDelivery)
          }
        } else if (read < 0 && running.get()) {
          queueErrorEvent("Microphone capture failed ($read).", session)
          break
        }
      }
    } catch (error: Exception) {
      if (running.get()) queueErrorEvent(error.message ?: "Microphone capture stopped unexpectedly.", session)
    } finally {
      synchronized(recorderLock) {
        // A late worker must not mark a replacement capture session stopped.
        if (pitchMailbox.isCurrent(session)) running.set(false)
      }
    }
  }

  private fun queuePitchEvent(result: NativePitchResult, session: Long, latestDelivery: Boolean) {
    if (!pitchMailbox.publish(session, result)) return
    mainHandler.post {
      if (!running.get() || !pitchMailbox.isCurrent(session)) return@post
      if (latestDelivery) {
        // Keep the wake outstanding across the bridge until JS pulls. Capture
        // can keep replacing the slot without queueing more JS work.
        sendEvent(PITCH_AVAILABLE_EVENT, mapOf("session" to session))
      } else {
        val latest = pitchMailbox.take(session, SystemClock.elapsedRealtime()) ?: return@post
        sendEvent(PITCH_EVENT, latest.toPayload())
      }
    }
  }

  private fun NativePitchDelivery.toPayload(): Map<String, Any?> = mapOf(
    "detected" to (result.frequency != null),
    "frequency" to result.frequency,
    "confidence" to result.confidence,
    "rms" to result.rms,
    "clipping" to result.clipping,
    "timestamp" to result.timestamp,
    "ageMs" to ageMs
  )

  private fun queueErrorEvent(message: String, session: Long) {
    mainHandler.post {
      if (!pitchMailbox.isCurrent(session)) return@post
      sendEvent(ERROR_EVENT, mapOf("message" to message))
    }
  }

  private fun stopCapture() {
    val recorder: AudioRecord?
    val worker: Thread?
    synchronized(recorderLock) {
      running.set(false)
      pitchMailbox.reset()
      recorder = audioRecord
      worker = recordingThread
      audioRecord = null
      recordingThread = null
    }

    try {
      recorder?.stop()
    } catch (_: Exception) {
      // AudioRecord can already be stopped after an Android route change.
    }
    worker?.interrupt()
    if (worker != Thread.currentThread()) {
      try {
        worker?.join(500)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
    recorder?.release()
  }

  private fun Map<String, Any?>.string(key: String, fallback: String): String =
    this[key] as? String ?: fallback

  private fun Map<String, Any?>.number(key: String, fallback: Double): Double =
    (this[key] as? Number)?.toDouble() ?: fallback

  companion object {
    private const val PITCH_EVENT = "onPitch"
    private const val PITCH_AVAILABLE_EVENT = "onPitchAvailable"
    private const val ERROR_EVENT = "onError"
  }
}
