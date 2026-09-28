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
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import kotlin.math.max

private class PitchPermissionException : CodedException("Microphone permission is required.")
private class PitchRecorderException(message: String) : CodedException(message)

class TuneraPitchModule : Module() {
  private val running = AtomicBoolean(false)
  private val eventScheduled = AtomicBoolean(false)
  private val pendingResult = AtomicReference<NativePitchResult?>(null)
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
    Events(PITCH_EVENT, ERROR_EVENT)

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

    val minimumBufferBytes = AudioRecord.getMinBufferSize(
      NativePitchDetector.CAPTURE_SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    if (minimumBufferBytes <= 0) {
      throw PitchRecorderException("This device does not support tuner microphone capture.")
    }
    val bufferBytes = max(minimumBufferBytes, NativePitchDetector.CAPTURE_SAMPLE_RATE / 25 * 2)
    val nextRecorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      NativePitchDetector.CAPTURE_SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      bufferBytes * 2
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
      running.set(true)
      recordingThread = thread(name = "TuneraPitchCapture", start = true) {
        captureLoop(nextRecorder, bufferBytes / 2)
      }
    }
  }

  private fun captureLoop(recorder: AudioRecord, bufferSamples: Int) {
    Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
    val samples = ShortArray(bufferSamples)
    try {
      while (running.get() && !Thread.currentThread().isInterrupted) {
        val read = recorder.read(samples, 0, samples.size, AudioRecord.READ_BLOCKING)
        if (read > 0) {
          detector.accept(samples, read)
          detector.analyzeIfDue(SystemClock.elapsedRealtime())?.let(::queuePitchEvent)
        } else if (read < 0 && running.get()) {
          queueErrorEvent("Microphone capture failed ($read).")
          break
        }
      }
    } catch (error: Exception) {
      if (running.get()) queueErrorEvent(error.message ?: "Microphone capture stopped unexpectedly.")
    } finally {
      running.set(false)
    }
  }

  private fun queuePitchEvent(result: NativePitchResult) {
    pendingResult.set(result)
    if (!eventScheduled.compareAndSet(false, true)) return
    mainHandler.post {
      eventScheduled.set(false)
      val latest = pendingResult.getAndSet(null) ?: return@post
      if (!running.get()) return@post
      sendEvent(
        PITCH_EVENT,
        mapOf(
          "detected" to (latest.frequency != null),
          "frequency" to latest.frequency,
          "confidence" to latest.confidence,
          "rms" to latest.rms,
          "clipping" to latest.clipping,
          "timestamp" to latest.timestamp
        )
      )
    }
  }

  private fun queueErrorEvent(message: String) {
    mainHandler.post {
      sendEvent(ERROR_EVENT, mapOf("message" to message))
    }
  }

  private fun stopCapture() {
    running.set(false)
    pendingResult.set(null)
    val recorder: AudioRecord?
    val worker: Thread?
    synchronized(recorderLock) {
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
    private const val ERROR_EVENT = "onError"
  }
}
