package com.example.autodlh3

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.util.UUID

internal data class PdfPreviewPage(val uri:String,val pageCount:Int,val width:Int,val height:Int)
internal class CreativePdfPreview(private val context:Context) {
  @Synchronized fun render(source:String,expectedHash:String,pageIndex:Int):PdfPreviewPage {
    require(expectedHash.matches(Regex("[a-f0-9]{64}"))) { "PDF_HASH_INVALID" }
    require(pageIndex>=0) { "PDF_PAGE_INVALID" }
    val uri=Uri.parse(source)
    require(uri.scheme=="file") { "PDF_PRIVATE_SOURCE_REQUIRED" }
    val file=File(requireNotNull(uri.path)).canonicalFile
    val allowed=listOf(context.filesDir,context.cacheDir).any { file.toPath().startsWith(it.canonicalFile.toPath()) }
    require(allowed&&file.isFile&&file.length() in 1..100L*1024*1024) { "PDF_SOURCE_INVALID" }
    require(file.inputStream().use(MediaIntegrity::sha256)==expectedHash) { "PDF_HASH_MISMATCH" }
    val directory=File(context.cacheDir,"creative-pdf").apply { mkdirs() }
    // Derived previews are disposable; keep only a bounded recent cache.
    directory.listFiles()?.sortedByDescending { it.lastModified() }?.drop(20)?.forEach { it.delete() }
    ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
      PdfRenderer(descriptor).use { renderer ->
        require(pageIndex<renderer.pageCount) { "PDF_PAGE_INVALID" }
        renderer.openPage(pageIndex).use { page ->
          val scale=1200.0/maxOf(page.width,page.height).coerceAtLeast(1)
          val width=(page.width*scale).toInt().coerceIn(1,1200)
          val height=(page.height*scale).toInt().coerceIn(1,1200)
          val output=File(directory,"$expectedHash-$pageIndex.png")
          if(!output.exists()) {
            val bitmap=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888)
            val part=File(directory,"${UUID.randomUUID()}.part")
            try {
              bitmap.eraseColor(Color.WHITE)
              page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              part.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG,100,it)) }
              check(part.renameTo(output)) { "PDF_PREVIEW_WRITE_FAILED" }
            } finally { bitmap.recycle();part.delete() }
          }
          output.setLastModified(System.currentTimeMillis())
          return PdfPreviewPage(Uri.fromFile(output).toString(),renderer.pageCount,width,height)
        }
      }
    }
  }
}
