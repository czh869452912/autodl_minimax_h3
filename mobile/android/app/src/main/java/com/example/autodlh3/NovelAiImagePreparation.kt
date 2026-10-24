package com.example.autodlh3

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.Matrix
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.File

/** Local source files remain immutable. Only normalized PNG bytes enter the request. */
class NovelAiImagePreparation(private val privateRoot: File) {
  fun prepare(source: String, width: Int, height: Int, mask: Boolean, strokesJson: String): String {
    require(width >= 64 && height >= 64 && width % 64 == 0 && height % 64 == 0 && width.toLong() * height <= 3145728) { "NOVELAI_IMAGE_DIMENSIONS_INVALID" }
    require(strokesJson.length <= 256 * 1024) { "NOVELAI_MASK_TOO_LARGE" }
    val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    try {
      val canvas = Canvas(output)
      val strokes = JSONArray(strokesJson)
      require(strokes.length() <= 100) { "NOVELAI_MASK_TOO_LARGE" }
      if (mask && strokes.length() > 0) {
        canvas.drawColor(Color.BLACK)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
        var pointCount = 0
        repeat(strokes.length()) { index ->
          val stroke = strokes.getJSONObject(index)
          val radius = stroke.getDouble("radius")
          require(radius.isFinite() && radius in 0.005..0.25)
          paint.strokeWidth = (radius * 2 * minOf(width, height)).toFloat()
          val points = stroke.getJSONArray("points")
          pointCount += points.length()
          require(points.length() in 1..2048 && pointCount <= 4096) { "NOVELAI_MASK_TOO_LARGE" }
          val path = Path()
          repeat(points.length()) { n ->
            val p = points.getJSONObject(n)
            val x = p.getDouble("x"); val y = p.getDouble("y")
            require(x.isFinite() && y.isFinite() && x in 0.0..1.0 && y in 0.0..1.0)
            if (n == 0) path.moveTo((x * width).toFloat(), (y * height).toFloat()) else path.lineTo((x * width).toFloat(), (y * height).toFloat())
            if (points.length() == 1) canvas.drawPoint((x * width).toFloat(), (y * height).toFloat(), paint)
          }
          canvas.drawPath(path, paint)
        }
      } else {
        val uri = Uri.parse(source)
        require(uri.scheme == "file") { "NOVELAI_SOURCE_INVALID" }
        val file = File(requireNotNull(uri.path)).canonicalFile
        require(file.path.startsWith(privateRoot.canonicalPath + File.separator) && file.length() in 1..(25L * 1024 * 1024)) { "NOVELAI_SOURCE_INVALID" }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 16777216) { "NOVELAI_SOURCE_TOO_LARGE" }
        val bitmap = requireNotNull(BitmapFactory.decodeFile(file.path)) { "NOVELAI_SOURCE_INVALID" }
        try {
          if (mask) canvas.drawColor(Color.BLACK)
          val orientation = try { ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) } catch (_: Exception) { ExifInterface.ORIENTATION_NORMAL }
          val matrix = Matrix().apply { when (orientation) {
            2 -> setScale(-1f, 1f); 3 -> setRotate(180f); 4 -> setScale(1f, -1f)
            5 -> { setRotate(90f); postScale(-1f, 1f) }; 6 -> setRotate(90f)
            7 -> { setRotate(90f); postScale(1f, -1f) }; 8 -> setRotate(270f)
          } }
          val oriented = if (matrix.isIdentity) bitmap else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
          try {
            val paint = Paint(Paint.FILTER_BITMAP_FLAG).apply { if (mask) colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) }) }
            canvas.drawBitmap(oriented, null, Rect(0, 0, width, height), paint)
          } finally { if (oriented !== bitmap) oriented.recycle() }
        } finally { bitmap.recycle() }
      }
      val bytes = ByteArrayOutputStream().use { stream ->
        check(output.compress(Bitmap.CompressFormat.PNG, 100, stream)) { "NOVELAI_SOURCE_INVALID" }
        stream.toByteArray()
      }
      require(bytes.size <= 12 * 1024 * 1024) { "NOVELAI_SOURCE_TOO_LARGE" }
      return Base64.encodeToString(bytes, Base64.NO_WRAP)
    } finally { output.recycle() }
  }
}
