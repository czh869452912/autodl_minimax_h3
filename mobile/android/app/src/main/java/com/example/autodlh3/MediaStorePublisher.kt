package com.example.autodlh3

import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream
import java.io.InputStream

private const val VIDEO_RELATIVE_PATH = "Movies/AutoDL-H3/"

data class PublishedVideo(
  val uri: Uri,
  val displayName: String,
  val alreadyExisted: Boolean,
)

class MediaStorePublisher(private val resolver: ContentResolver) {
  fun publish(source: String, mediaId: String, requestedName: String): PublishedVideo {
    val displayName = sanitizeFileName(requestedName.ifBlank { "$mediaId.mp4" })
    findCompleted(displayName)?.let { return PublishedVideo(it, displayName, true) }
    deletePending(displayName)

    val values = ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
      put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
      put(MediaStore.Video.Media.RELATIVE_PATH, VIDEO_RELATIVE_PATH)
      put(MediaStore.Video.Media.IS_PENDING, 1)
    }
    val target = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("无法创建系统媒体文件")
    try {
      resolver.openOutputStream(target, "w").use { output ->
        requireNotNull(output) { "无法写入系统媒体文件" }
        openSource(source).use { input -> input.copyTo(output) }
      }
      resolver.update(target, ContentValues().apply {
        put(MediaStore.Video.Media.IS_PENDING, 0)
      }, null, null)
      return PublishedVideo(target, displayName, false)
    } catch (error: Exception) {
      resolver.delete(target, null, null)
      throw error
    }
  }

  private fun findCompleted(displayName: String): Uri? = query(displayName) { id, pending ->
    if (!pending) ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id) else null
  }.firstOrNull()

  private fun deletePending(displayName: String) {
    query(displayName) { id, pending ->
      if (pending) ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id) else null
    }.forEach { resolver.delete(it, null, null) }
  }

  private fun query(displayName: String, map: (Long, Boolean) -> Uri?): List<Uri> {
    val results = mutableListOf<Uri>()
    resolver.query(
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
      arrayOf(MediaStore.Video.Media._ID, MediaStore.Video.Media.IS_PENDING),
      "${MediaStore.Video.Media.DISPLAY_NAME} = ? AND ${MediaStore.Video.Media.RELATIVE_PATH} = ?",
      arrayOf(displayName, VIDEO_RELATIVE_PATH),
      null,
    )?.use { cursor ->
      val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
      val pendingColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.IS_PENDING)
      while (cursor.moveToNext()) {
        map(cursor.getLong(idColumn), cursor.getInt(pendingColumn) != 0)?.let(results::add)
      }
    }
    return results
  }

  private fun openSource(source: String): InputStream {
    val uri = Uri.parse(source)
    return when (uri.scheme?.lowercase()) {
      "content" -> resolver.openInputStream(uri)
      "file" -> uri.path?.let { FileInputStream(File(it)) }
      null -> FileInputStream(File(source))
      else -> null
    } ?: throw IllegalArgumentException("视频源文件不可用")
  }

  private fun sanitizeFileName(requestedName: String): String {
    val stem = requestedName.substringBeforeLast('.').replace(Regex("[^A-Za-z0-9._-]"), "_").trim('_', '.')
    return "${stem.ifBlank { "video" }}.mp4"
  }
}
