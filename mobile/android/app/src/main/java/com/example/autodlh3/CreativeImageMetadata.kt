package com.example.autodlh3

import android.media.ExifInterface
import org.json.JSONObject
import java.io.InputStream

/** Official downloads can be WebP with a JSON EXIF UserComment, as well as PNG. */
object CreativeImageMetadata {
  fun read(open: () -> InputStream): Map<String, String> {
    val png = open().use { CreativePngMetadata.read(it) }
    if (png.isNotEmpty()) return png
    val comment = open().use { ExifInterface(it).getAttribute(ExifInterface.TAG_USER_COMMENT) } ?: return emptyMap()
    require(comment.length <= CreativePngMetadata.MAX_TEXT) { "METADATA_TOO_LARGE" }
    val json = try { JSONObject(comment) } catch (_: Exception) { JSONObject(comment.replace("\\\\\"", "\\\"")) }
    require(json.length() <= 64)
    return json.keys().asSequence().associateWith { key -> require(key.length <= 79); json.getString(key) }
  }
}
