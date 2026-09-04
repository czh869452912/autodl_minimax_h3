package com.example.autodlh3

import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import java.io.InputStream
import java.io.OutputStream

data class MediaStoreEntry(val uri: String, val pending: Boolean)

interface MediaStoreGateway {
  fun query(displayName: String, relativePath: String): List<MediaStoreEntry>
  fun insert(displayName: String, mime: String, relativePath: String): String
  fun openInput(uri: String): InputStream?
  fun openOutput(uri: String): OutputStream?
  fun finalize(uri: String)
  fun delete(uri: String)
}

class AndroidMediaStoreGateway(private val resolver: ContentResolver) : MediaStoreGateway {
  override fun query(displayName: String, relativePath: String): List<MediaStoreEntry> {
    val results = mutableListOf<MediaStoreEntry>()
    resolver.query(
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
      arrayOf(MediaStore.Video.Media._ID, MediaStore.Video.Media.IS_PENDING),
      "${MediaStore.Video.Media.DISPLAY_NAME} = ? AND ${MediaStore.Video.Media.RELATIVE_PATH} = ?",
      arrayOf(displayName, relativePath),
      null,
    )?.use { cursor ->
      val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
      val pendingColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.IS_PENDING)
      while (cursor.moveToNext()) {
        results += MediaStoreEntry(
          ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, cursor.getLong(idColumn)).toString(),
          cursor.getInt(pendingColumn) != 0,
        )
      }
    }
    return results
  }

  override fun insert(displayName: String, mime: String, relativePath: String): String {
    val values = ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
      put(MediaStore.Video.Media.MIME_TYPE, mime)
      put(MediaStore.Video.Media.RELATIVE_PATH, relativePath)
      put(MediaStore.Video.Media.IS_PENDING, 1)
    }
    return resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)?.toString()
      ?: throw IllegalStateException("无法创建系统媒体文件")
  }

  override fun openInput(uri: String): InputStream? = resolver.openInputStream(Uri.parse(uri))
  override fun openOutput(uri: String): OutputStream? = resolver.openOutputStream(Uri.parse(uri), "w")
  override fun finalize(uri: String) {
    resolver.update(Uri.parse(uri), ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
  }
  override fun delete(uri: String) { resolver.delete(Uri.parse(uri), null, null) }
}
