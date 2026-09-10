package com.example.autodlh3

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.FFprobeSession
import com.arthenica.ffmpegkit.ReturnCode
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

data class CompatibleVideoRequest(
  val sourceUri: String, val sourceSha256: String, val operationId: String,
  val operationAttempt: Int, val maxBytes: Long,
)
data class CompatibleVideoResult(val partUri: String, val mime: String, val byteSize: Long, val sha256: String)
class VideoCompatibilityException(
  val diagnosticCode: String, val stage: String? = null, val detail: String? = null,
) : IllegalArgumentException(diagnosticCode)

/** No network input, no mutation of the original, and no publication before complete validation. */
class VideoCompatibility(private val context: Context) {
  class Work internal constructor(val request: CompatibleVideoRequest) {
    @Volatile internal var stage: String = "sourceSnapshot"
    @Volatile internal var failure: String? = null
    @Volatile internal var sessionId: Long? = null
    internal var terminal = false
    @Synchronized internal fun stop(code: String): Boolean {
      if (terminal) return false
      if (failure == null) failure = code
      sessionId?.let(FFmpegKit::cancel)
      return true
    }
    @Synchronized internal fun attach(id: Long) { sessionId = id }
    @Synchronized internal fun finish() {
      failure?.let { throw VideoCompatibilityException(it) }
      terminal = true
      sessionId = null
    }
  }
  companion object {
    private val busy = AtomicBoolean(false)
    private const val MAX_INPUT = 1024L * 1024 * 1024
    private const val MAX_RUNTIME_MS = 15L * 60 * 1000
    private fun hash(value: ByteArray) = MessageDigest.getInstance("SHA-256").digest(value)
      .joinToString("") { "%02x".format(it) }
  }
  private val active = ConcurrentHashMap<Pair<String, Int>, Work>()
  private fun fail(code: String): Nothing = throw VideoCompatibilityException(code)
  private fun check(work: Work) {
    work.failure?.let(::fail)
    if (Thread.currentThread().isInterrupted) fail("MEDIA_COMPATIBILITY_CANCELLED")
  }

  // Registration happens on the bridge thread, so a queued operation is cancellable too.
  fun register(request: CompatibleVideoRequest): Work {
    val uri = Uri.parse(request.sourceUri)
    if (uri.scheme !in setOf("file", "content") ||
      (uri.scheme == "file" && (!uri.authority.isNullOrEmpty() || uri.path.isNullOrBlank())) ||
      request.operationId.isBlank() || request.operationId.length > 512 || request.operationAttempt < 0 ||
      request.maxBytes !in 1..MAX_INPUT || !request.sourceSha256.matches(Regex("[a-f0-9]{64}"))) {
      fail("MEDIA_COMPATIBILITY_REQUEST_INVALID")
    }
    val work = Work(request)
    if (active.putIfAbsent(request.operationId to request.operationAttempt, work) != null) {
      fail("MEDIA_COMPATIBILITY_ACTIVE")
    }
    return work
  }
  fun cancel(operationId: String, attempt: Int): Boolean =
    active[operationId to attempt]?.stop("MEDIA_COMPATIBILITY_CANCELLED") ?: false
  fun close() { active.values.forEach { it.stop("MEDIA_COMPATIBILITY_CANCELLED") } }

  private fun probe(file: File, work: Work, countFrames: Boolean = false): JSONObject {
    check(work)
    val session = FFprobeSession.create((listOf("-v", "error", "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm", "-max_alloc", "268435456",
      "-threads", "2") + (if (countFrames) listOf("-count_frames") else emptyList()) +
      listOf("-show_streams", "-show_format", "-of", "json", file.absolutePath)).toTypedArray())
    work.attach(session.sessionId)
    check(work)
    FFmpegKitConfig.ffprobeExecute(session)
    check(work)
    if (!ReturnCode.isSuccess(session.returnCode)) sessionFailure(work, session.returnCode?.value, session.output)
    return JSONObject(session.output)
  }

  private fun run(arguments: List<String>, work: Work) {
    check(work)
    val session = FFmpegSession.create(arguments.toTypedArray())
    work.attach(session.sessionId)
    check(work)
    FFmpegKitConfig.ffmpegExecute(session)
    check(work)
    if (!ReturnCode.isSuccess(session.returnCode)) sessionFailure(work, session.returnCode?.value, session.allLogsAsString)
  }

  private fun sessionFailure(work: Work, returnCode: Int?, output: String?): Nothing {
    val detail = CompatibilityDiagnostics.sanitize("exit=$returnCode ${output.orEmpty()}")
    android.util.Log.w("AutoDLMedia", "compatibility stage=${work.stage} $detail")
    val code = when (work.stage) {
      "sourceProbe", "sourceFrames" -> "MEDIA_COMPATIBILITY_SOURCE_PROBE_FAILED"
      "sourceDecode" -> "MEDIA_COMPATIBILITY_DECODE_FAILED"
      "encode" -> "MEDIA_COMPATIBILITY_ENCODE_FAILED"
      else -> "MEDIA_COMPATIBILITY_OUTPUT_INVALID"
    }
    throw VideoCompatibilityException(code, work.stage, detail)
  }

  fun prepare(work: Work): CompatibleVideoResult {
    val request = work.request
    val key = request.operationId to request.operationAttempt
    var acquired = false
    var ownsPart = false
    var complete = false
    val parts = File(context.filesDir, "cas/parts")
    val basename = hash((request.operationId + "\u0000" + request.operationAttempt).toByteArray(Charsets.UTF_8))
    val part = File(parts, "$basename.part")
    var input: File? = null
    val watchdog = Executors.newSingleThreadScheduledExecutor()
    val started = SystemClock.elapsedRealtime()
    try {
      check(work)
      acquired = busy.compareAndSet(false, true)
      if (!acquired) fail("MEDIA_COMPATIBILITY_BUSY")
      // This module is process-wide serialized; older snapshots can only be crash leftovers.
      context.cacheDir.listFiles()?.filter { it.name.startsWith("compatible-input-") && it.name.endsWith(".media") }
        ?.forEach { it.delete() }
      parts.mkdirs()
      // Never replace another attempt's part or a completed operation's part.
      if (!part.createNewFile()) fail("MEDIA_COMPATIBILITY_PART_EXISTS")
      ownsPart = true
      watchdog.scheduleAtFixedRate({
        if (SystemClock.elapsedRealtime() - started >= MAX_RUNTIME_MS) work.stop("MEDIA_COMPATIBILITY_TIMEOUT")
        if (part.length() >= request.maxBytes) work.stop("MEDIA_COMPATIBILITY_SIZE_LIMIT")
        // Retry cancellation to cover FFmpeg's brief session registration/start race.
        if (work.failure != null) work.sessionId?.let(FFmpegKit::cancel)
      }, 0, 100, TimeUnit.MILLISECONDS)
      input = File.createTempFile("compatible-input-", ".media", context.cacheDir)
      val digest = MessageDigest.getInstance("SHA-256")
      val source = Uri.parse(request.sourceUri)
      val stream = if (source.scheme == "file") File(requireNotNull(source.path)).inputStream()
        else context.contentResolver.openInputStream(source) ?: fail("MEDIA_COMPATIBILITY_SOURCE_UNAVAILABLE")
      stream.use { from ->
        input.outputStream().use { to ->
          val buffer = ByteArray(64 * 1024)
          var bytes = 0L
          while (true) {
            check(work)
            val count = from.read(buffer)
            if (count < 0) break
            bytes += count
            if (bytes > MAX_INPUT) fail("MEDIA_COMPATIBILITY_SIZE_LIMIT")
            digest.update(buffer, 0, count)
            to.write(buffer, 0, count)
          }
        }
      }
      if (digest.digest().joinToString("") { "%02x".format(it) } != request.sourceSha256) {
        fail("MEDIA_COMPATIBILITY_SOURCE_CHANGED")
      }
      work.stage = "sourceProbe"
      val metadata = probe(input, work)
      val streams = metadata.getJSONArray("streams")
      val videos = (0 until streams.length()).map(streams::getJSONObject).filter { it.optString("codec_type") == "video" }
      if (videos.size != 1) fail("MEDIA_COMPATIBILITY_UNSUPPORTED")
      val video = videos.single()
      val codec = video.optString("codec_name")
      if (codec !in setOf("h264", "hevc", "vp9")) fail("MEDIA_COMPATIBILITY_UNSUPPORTED")
      val transfer = video.optString("color_transfer")
      if (transfer in setOf("smpte2084", "arib-std-b67") ||
        video.optString("color_primaries") == "bt2020" ||
        video.optString("color_space").startsWith("bt2020") ||
        video.optJSONArray("side_data_list")?.toString()?.let {
          it.contains("DOVI", true) || it.contains("Mastering display", true) || it.contains("Content light", true)
        } == true) fail("MEDIA_COMPATIBILITY_HDR_UNSUPPORTED")
      val duration = metadata.optJSONObject("format")?.optString("duration")?.toDoubleOrNull() ?: 0.0
      if (!duration.isFinite() || duration <= 0 || duration > 600 ||
        video.optInt("width") !in 2..4096 || video.optInt("height") !in 2..4096) {
        fail("MEDIA_COMPATIBILITY_LIMIT")
      }
      // Explicit named software decoder: a hardware decoder's High10 limits cannot leak into this path.
      val decode = listOf("-v", "error", "-nostdin", "-xerror", "-err_detect", "explode",
        "-max_alloc", "268435456", "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm", "-threads", "2", "-c:v", codec,
        "-i", input.absolutePath, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn")
      // Decode the entire source before encoding; byte limits must never turn a truncated decode into success.
      work.stage = "sourceDecode"
      run(decode + listOf("-f", "null", "-"), work)
      work.stage = "sourceFrames"
      val sourceVideo = probe(input, work, true).getJSONArray("streams").let { list ->
        (0 until list.length()).map(list::getJSONObject).single { it.optString("codec_type") == "video" }
      }
      work.stage = "encode"
      fun ratio(value: String, separator: String, fallback: Double): Double {
        val parts = value.split(separator)
        val result = if (parts.size == 2) (parts[0].toDoubleOrNull() ?: 0.0) / (parts[1].toDoubleOrNull() ?: 0.0) else fallback
        return if (result.isFinite() && result > 0) result else fallback
      }
      var displayWidth = video.optInt("width") * ratio(video.optString("sample_aspect_ratio"), ":", 1.0)
      var displayHeight = video.optInt("height").toDouble()
      val sideData = video.optJSONArray("side_data_list")
      val rotated = sideData != null && (0 until sideData.length()).any {
        kotlin.math.abs(sideData.getJSONObject(it).optDouble("rotation", 0.0)) % 180.0 == 90.0
      }
      if (rotated) { val previous = displayWidth; displayWidth = displayHeight; displayHeight = previous }
      val plans = VideoEncodingPlans.candidates(displayWidth, displayHeight, ratio(video.optString("avg_frame_rate"), "/", 24.0))
      if (plans.isEmpty()) fail("MEDIA_COMPATIBILITY_ENCODER_UNAVAILABLE")
      var encoded = false
      var lastError: VideoCompatibilityException? = null
      for (plan in plans) {
        check(work)
        try {
          android.util.Log.i("AutoDLMedia", "compatibility encoder=${plan.codecName} size=${plan.width}x${plan.height}")
          run(decode + listOf("-filter_threads", "1", "-vf", plan.filter,
            "-c:v", "h264_mediacodec", "-codec_name", plan.codecName, "-pix_fmt", "yuv420p", "-profile:v", "baseline", "-bf", "0",
            "-b:v", plan.bitrate.toString(), "-g", "60", "-fps_mode", "passthrough", "-c:a", "aac", "-b:a", "128000", "-ac", "2",
            "-threads", "2", "-map_metadata", "-1", "-movflags", "+faststart", "-fs", request.maxBytes.toString(),
            "-f", "mp4", "-y", part.absolutePath), work)
          encoded = true
          break
        } catch (error: VideoCompatibilityException) {
          if (error.diagnosticCode != "MEDIA_COMPATIBILITY_ENCODE_FAILED") throw error
          lastError = error
        }
      }
      if (!encoded) throw requireNotNull(lastError)
      if (part.length() <= 0 || part.length() >= request.maxBytes) fail("MEDIA_COMPATIBILITY_SIZE_LIMIT")
      work.stage = "outputProbe"
      val output = probe(part, work, true)
      val outStreams = output.getJSONArray("streams")
      val outVideo = (0 until outStreams.length()).map(outStreams::getJSONObject).first { it.optString("codec_type") == "video" }
      val outDuration = output.getJSONObject("format").optString("duration").toDoubleOrNull() ?: 0.0
      if (outVideo.optString("codec_name") != "h264" || outVideo.optString("pix_fmt") != "yuv420p" ||
        sourceVideo.optString("nb_read_frames").toLongOrNull().let { it == null || it <= 0 || it != outVideo.optString("nb_read_frames").toLongOrNull() } ||
        kotlin.math.abs(outDuration - duration) > kotlin.math.max(0.5, duration * 0.02)) {
        fail("MEDIA_COMPATIBILITY_OUTPUT_INVALID")
      }
      work.stage = "outputDecode"
      run(listOf("-v", "error", "-nostdin", "-xerror", "-err_detect", "explode", "-threads", "2",
        "-protocol_whitelist", "file", "-i", part.absolutePath, "-map", "0:v:0", "-map", "0:a:0?", "-f", "null", "-"), work)
      val integrity = MediaIntegrity(context)
      work.stage = "platformPlaybackProbe"
      integrity.probeVideo(part.toURI().toString())
      val sha = integrity.sha256(part.toURI().toString()) { check(work) }
      work.finish()
      complete = true
      return CompatibleVideoResult(part.toURI().toString(), "video/mp4", part.length(), sha)
    } catch (error: VideoCompatibilityException) {
      throw if (error.stage != null) error else VideoCompatibilityException(error.diagnosticCode, work.stage)
    } catch (error: MediaIntegrityException) {
      throw VideoCompatibilityException("MEDIA_COMPATIBILITY_OUTPUT_INVALID", work.stage, error.diagnosticCode)
    } finally {
      watchdog.shutdownNow()
      input?.delete()
      if (ownsPart && !complete) part.delete()
      synchronized(work) { work.terminal = true; work.sessionId = null }
      active.remove(key, work)
      if (acquired) busy.set(false)
    }
  }
}
