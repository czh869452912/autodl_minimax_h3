package com.example.autodlh3

import android.content.ContentResolver
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.InputStream

private const val VIDEO_RELATIVE_PATH = "Movies/AutoDL-H3/"

data class PublishedVideo(
  val uri: String,
  val displayName: String,
  val alreadyExisted: Boolean,
)

class MediaStorePublisher internal constructor(
  private val gateway: MediaStoreGateway,
  private val sourceOpener: (String) -> InputStream,
) {
  constructor(resolver: ContentResolver) : this(
    AndroidMediaStoreGateway(resolver),
    { source -> openSource(resolver, source) },
  )

  fun publish(source: String, mediaId: String, requestedName: String): PublishedVideo {
    val displayName = sanitizeFileName(requestedName.ifBlank { "$mediaId.mp4" })
    val sourceHash = sourceOpener(source).use(MediaIntegrity::sha256)
    var reusable: String? = null
    for (entry in gateway.query(displayName, VIDEO_RELATIVE_PATH)) {
      val matching = !entry.pending && runCatching {
        gateway.openInput(entry.uri)?.use(MediaIntegrity::sha256) == sourceHash
      }.getOrDefault(false)
      if (matching && reusable == null) reusable = entry.uri else gateway.delete(entry.uri)
    }
    reusable?.let { return PublishedVideo(it, displayName, true) }

    val target = gateway.insert(displayName, "video/mp4", VIDEO_RELATIVE_PATH)
    try {
      gateway.openOutput(target).use { output ->
        requireNotNull(output) { "无法写入系统媒体文件" }
        sourceOpener(source).use { input -> input.copyTo(output) }
      }
      gateway.finalize(target)
      return PublishedVideo(target, displayName, false)
    } catch (error: Exception) {
      gateway.delete(target)
      throw error
    }
  }

  private fun sanitizeFileName(requestedName: String): String {
    val stem = requestedName.substringBeforeLast('.').replace(Regex("[^A-Za-z0-9._-]"), "_").trim('_', '.')
    return "${stem.ifBlank { "video" }}.mp4"
  }

  companion object {
    private fun openSource(resolver: ContentResolver, source: String): InputStream {
      val uri = Uri.parse(source)
      return when (uri.scheme?.lowercase()) {
        "content" -> resolver.openInputStream(uri)
        "file" -> uri.path?.let { FileInputStream(File(it)) }
        null -> FileInputStream(File(source))
        else -> null
      } ?: throw IllegalArgumentException("视频源文件不可用")
    }
  }
}
