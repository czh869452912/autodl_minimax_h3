package com.example.autodlh3

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import java.io.File
import java.io.FileOutputStream

internal fun validPreview(file: File): Boolean {
  if (!file.isFile || file.length() == 0L) return false
  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  BitmapFactory.decodeFile(file.absolutePath, bounds)
  return bounds.outWidth in 1..640 && bounds.outHeight in 1..640
}

internal fun imageThumbnail(context: Context, source: String, key: String, cache: PreviewDiskCache): String {
  val uri = Uri.parse(source)
  require(uri.scheme in setOf("file", "content"))
  val file = cache.file(source, key, "png")
  if (validPreview(file)) { file.setLastModified(System.currentTimeMillis()); return file.toURI().toString() }
  val part = File(file.parentFile, "${file.name}-${java.util.UUID.randomUUID()}.part")
  var bitmap: Bitmap? = null
  try {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(requireNotNull(it), null, bounds) }
    val options = BitmapFactory.Options().apply { inSampleSize = PreviewDiskCache.sampleSize(bounds.outWidth, bounds.outHeight) }
    bitmap = context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(requireNotNull(it), null, options) } ?: error("decode failed")
    val orientation = try { context.contentResolver.openInputStream(uri).use { ExifInterface(requireNotNull(it)).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) } } catch (_: Exception) { 1 }
    val transform = Matrix().apply {
      when (orientation) {
        2 -> setScale(-1f, 1f)
        3 -> setRotate(180f)
        4 -> setScale(1f, -1f)
        5 -> { setRotate(90f); postScale(-1f, 1f) }
        6 -> setRotate(90f)
        7 -> { setRotate(-90f); postScale(-1f, 1f) }
        8 -> setRotate(-90f)
      }
      val scale = minOf(1f, 640f / maxOf(bitmap!!.width, bitmap!!.height))
      postScale(scale, scale)
    }
    val small = Bitmap.createBitmap(bitmap!!, 0, 0, bitmap!!.width, bitmap!!.height, transform, true)
    if (small !== bitmap) { bitmap!!.recycle(); bitmap = small }
    FileOutputStream(part).use { check(bitmap!!.compress(Bitmap.CompressFormat.PNG, 100, it)); it.fd.sync() }
    check(part.renameTo(file))
    cache.trim(file)
    return file.toURI().toString()
  } finally { bitmap?.recycle(); part.delete() }
}
