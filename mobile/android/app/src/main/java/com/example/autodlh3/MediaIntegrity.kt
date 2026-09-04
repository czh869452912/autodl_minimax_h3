package com.example.autodlh3

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.security.MessageDigest

data class VideoProbeResult(
  val durationMs: Long,
  val videoTrackCount: Int,
  val decodedFrames: Int,
  val sampleCount: Long,
)

object MediaValidationPolicy {
  fun errorCode(result: VideoProbeResult): String? = when {
    result.videoTrackCount <= 0 -> "MEDIA_NO_VIDEO_TRACK"
    result.durationMs <= 0 -> "MEDIA_DURATION_INVALID"
    result.sampleCount <= 0 -> "MEDIA_SAMPLE_INVALID"
    result.decodedFrames < 3 -> "MEDIA_DECODE_FAILED"
    else -> null
  }
}

class MediaIntegrityException(val diagnosticCode: String, cause: Throwable? = null) :
  IllegalArgumentException(diagnosticCode, cause)

class MediaIntegrity(private val context: Context) {
  private fun localFile(source: String): File? {
    val uri = Uri.parse(source)
    return when {
      uri.scheme == null -> File(source)
      uri.scheme == "file" -> uri.path?.let(::File)
      else -> null
    }
  }

  private fun openInput(source: String): InputStream {
    localFile(source)?.let { return FileInputStream(it) }
    val uri = Uri.parse(source)
    if (uri.scheme != "content") throw MediaIntegrityException("MEDIA_SOURCE_UNSUPPORTED")
    return context.contentResolver.openInputStream(uri) ?: throw MediaIntegrityException("MEDIA_SOURCE_MISSING")
  }

  fun sha256(source: String): String {
    if (source.isBlank()) throw MediaIntegrityException("MEDIA_SOURCE_INVALID")
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(64 * 1024)
    openInput(source).use { input ->
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        if (count > 0) digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun <T> withExtractor(source: String, block: (MediaExtractor) -> T): T {
    val extractor = MediaExtractor()
    try {
      val file = localFile(source)
      if (file != null) {
        extractor.setDataSource(file.absolutePath)
        return block(extractor)
      }
      val uri = Uri.parse(source)
      if (uri.scheme != "content") throw MediaIntegrityException("MEDIA_SOURCE_UNSUPPORTED")
      context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
        extractor.setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
        return block(extractor)
      }
      throw MediaIntegrityException("MEDIA_SOURCE_MISSING")
    } finally {
      extractor.release()
    }
  }

  private fun <T> withRetriever(source: String, block: (MediaMetadataRetriever) -> T): T {
    val retriever = MediaMetadataRetriever()
    try {
      val file = localFile(source)
      if (file != null) {
        retriever.setDataSource(file.absolutePath)
        return block(retriever)
      }
      val uri = Uri.parse(source)
      if (uri.scheme != "content") throw MediaIntegrityException("MEDIA_SOURCE_UNSUPPORTED")
      context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
        retriever.setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
        return block(retriever)
      }
      throw MediaIntegrityException("MEDIA_SOURCE_MISSING")
    } finally {
      retriever.release()
    }
  }

  fun probeVideo(source: String): VideoProbeResult {
    if (source.isBlank()) throw MediaIntegrityException("MEDIA_SOURCE_INVALID")
    try {
      val container = withExtractor(source) { extractor ->
        val videoTracks = mutableSetOf<Int>()
        var durationUs = 0L
        for (index in 0 until extractor.trackCount) {
          val format = extractor.getTrackFormat(index)
          val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
          if (!mime.startsWith("video/")) continue
          videoTracks += index
          extractor.selectTrack(index)
          if (format.containsKey(MediaFormat.KEY_DURATION)) durationUs = maxOf(durationUs, format.getLong(MediaFormat.KEY_DURATION))
        }
        var sampleCount = 0L
        while (extractor.sampleTrackIndex >= 0) {
          if (extractor.sampleTrackIndex in videoTracks) {
            if (extractor.sampleSize < 0) throw MediaIntegrityException("MEDIA_SAMPLE_INVALID")
            sampleCount += 1
          }
          if (!extractor.advance()) break
        }
        Triple(videoTracks.size, durationUs, sampleCount)
      }
      val durationMs = container.second / 1_000L
      val preliminary = VideoProbeResult(durationMs, container.first, 0, container.third)
      MediaValidationPolicy.errorCode(preliminary)?.takeIf { it != "MEDIA_DECODE_FAILED" }?.let { throw MediaIntegrityException(it) }
      val durationUs = durationMs * 1_000L
      val positions = longArrayOf(0L, durationUs / 2L, maxOf(0L, durationUs - 100_000L))
      val decodedFrames = withRetriever(source) { retriever ->
        positions.count { position ->
          retriever.getFrameAtTime(position, MediaMetadataRetriever.OPTION_CLOSEST)?.let { bitmap ->
            bitmap.recycle()
            true
          } ?: false
        }
      }
      val result = VideoProbeResult(durationMs, container.first, decodedFrames, container.third)
      MediaValidationPolicy.errorCode(result)?.let { throw MediaIntegrityException(it) }
      return result
    } catch (error: MediaIntegrityException) {
      throw error
    } catch (error: Exception) {
      throw MediaIntegrityException("MEDIA_CONTAINER_INVALID", error)
    }
  }
}
