package com.example.autodlh3

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.util.zip.CRC32

class CreativeImageInfo(private val root: File) {
  data class Info(val file: File, val width: Int, val height: Int, val mime: String, val orientation: Int, val metadata: Map<String,String>, val metadataError: Boolean)
  fun inspect(source: String): Info {
    val uri=Uri.parse(source)
    require(uri.scheme=="file") { "CREATIVE_IMAGE_SOURCE_INVALID" }
    val file=File(requireNotNull(uri.path)).canonicalFile
    require(file.path.startsWith(root.canonicalPath+File.separator) && file.isFile && file.length() in 1..(25L*1024*1024)) { "CREATIVE_IMAGE_SOURCE_INVALID" }
    val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true }
    BitmapFactory.decodeFile(file.path,bounds)
    require(bounds.outWidth>0 && bounds.outHeight>0 && bounds.outWidth.toLong()*bounds.outHeight<=16777216) { "CREATIVE_IMAGE_TOO_LARGE" }
    val orientation=try { ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION,1) } catch (_:Exception) { 1 }
    val swap=orientation in 5..8
    var metadataError=false
    val metadata=try { CreativeImageMetadata.read { file.inputStream() } } catch (_:Exception) { metadataError=true;emptyMap() }
    return Info(file,if(swap)bounds.outHeight else bounds.outWidth,if(swap)bounds.outWidth else bounds.outHeight,bounds.outMimeType?:"image/unknown",orientation,metadata,metadataError)
  }
  fun upscale(source:String):Triple<String,Int,Int> {
    val info=inspect(source)
    require(info.width.toLong()*info.height<=3145728) { "NOVELAI_UPSCALE_SOURCE_TOO_LARGE" }
    // Preserve original PNG chunks, including NovelAI metadata, whenever no rotation is needed.
    val bytes=if(info.mime=="image/png" && info.orientation in 0..1 && !info.metadataError)info.file.readBytes() else {
      val bitmap=requireNotNull(BitmapFactory.decodeFile(info.file.path)) { "CREATIVE_IMAGE_INVALID" }
      try {
        val matrix=Matrix().apply { when(info.orientation) {
          2->setScale(-1f,1f);3->setRotate(180f);4->setScale(1f,-1f)
          5->{setRotate(90f);postScale(-1f,1f)};6->setRotate(90f)
          7->{setRotate(90f);postScale(1f,-1f)};8->setRotate(270f)
        } }
        val oriented=if(matrix.isIdentity)bitmap else Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true)
        try { ByteArrayOutputStream().use { stream->check(oriented.compress(Bitmap.CompressFormat.PNG,100,stream));withMetadata(stream.toByteArray(),info.metadata) } }
        finally { if(oriented!==bitmap)oriented.recycle() }
      } finally { bitmap.recycle() }
    }
    require(bytes.size<=25*1024*1024) { "NOVELAI_UPSCALE_SOURCE_TOO_LARGE" }
    return Triple(Base64.encodeToString(bytes,Base64.NO_WRAP),info.width,info.height)
  }
  private fun withMetadata(png:ByteArray,metadata:Map<String,String>):ByteArray {
    return ByteArrayOutputStream().use { stream->
      stream.write(png,0,33)
      val data=DataOutputStream(stream)
      // UTF-8 uncompressed iTXt; never copy binary EXIF GPS or source file paths.
      for((key,value) in metadata)if(key in setOf("Software","Source","Description","Comment")) {
        val payload=key.toByteArray(Charsets.ISO_8859_1)+byteArrayOf(0,0,0,0,0)+value.toByteArray(Charsets.UTF_8)
        val type="iTXt".toByteArray(Charsets.US_ASCII)
        data.writeInt(payload.size);data.write(type);data.write(payload)
        val crc=CRC32();crc.update(type);crc.update(payload);data.writeInt(crc.value.toInt())
      }
      stream.write(png,33,png.size-33);stream.toByteArray()
    }
  }
}
