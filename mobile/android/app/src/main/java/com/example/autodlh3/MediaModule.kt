package com.example.autodlh3

import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments

class MediaModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  private val publisher = MediaStorePublisher(context.contentResolver)
  private val integrity = MediaIntegrity(context)
  override fun getName() = "AutoDLMedia"

  @ReactMethod
  fun openVideo(source: String) {
    if (source.isBlank()) return
    val intent = Intent(context, Media3PlayerActivity::class.java).apply {
      putExtra(Media3PlayerActivity.EXTRA_SOURCE, source)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
  }

  @ReactMethod
  fun extractPoster(source: String, key: String, promise: Promise) {
    if (source.isBlank()) { promise.reject("INVALID_SOURCE", "视频地址为空"); return }
    executor.execute {
      val retriever = MediaMetadataRetriever()
      try {
        if (source.startsWith("http://") || source.startsWith("https://")) retriever.setDataSource(source, emptyMap()) else retriever.setDataSource(source)
        val bitmap = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: throw IllegalStateException("无法读取视频首帧")
        val dir = File(context.filesDir, "posters").apply { mkdirs() }
        val file = File(dir, key.replace(Regex("[^A-Za-z0-9_.-]"), "_") + ".jpg")
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 88, it) }
        bitmap.recycle(); promise.resolve(file.toURI().toString())
      } catch (error: Exception) { promise.reject("POSTER_FAILED", error.message, error) } finally { retriever.release() }
    }
  }

  @ReactMethod
  fun exportVideo(source: String, mediaId: String, displayName: String, promise: Promise) {
    executor.execute {
      try {
        val result = publisher.publish(source, mediaId, displayName)
        promise.resolve(Arguments.createMap().apply {
          putString("uri", result.uri.toString())
          putString("displayName", result.displayName)
          putString("relativePath", "Movies/AutoDL-H3/")
          putBoolean("alreadyExisted", result.alreadyExisted)
        })
      } catch (error: Exception) {
        promise.reject("EXPORT_FAILED", error.message ?: "保存到系统相册失败", error)
      }
    }
  }

  @ReactMethod
  fun sha256File(source: String, promise: Promise) {
    if (source.isBlank()) { promise.reject("MEDIA_SOURCE_INVALID", "媒体 URI 为空"); return }
    executor.execute {
      try { promise.resolve(integrity.sha256(source)) }
      catch (error: Exception) { promise.reject("MEDIA_INTEGRITY_FAILED", error.message, error) }
    }
  }

  @ReactMethod
  fun probeVideo(source: String, promise: Promise) {
    if (source.isBlank()) { promise.reject("MEDIA_SOURCE_INVALID", "媒体 URI 为空"); return }
    executor.execute {
      try {
        val result = integrity.probeVideo(source)
        promise.resolve(Arguments.createMap().apply {
          putDouble("durationMs", result.durationMs.toDouble())
          putInt("videoTrackCount", result.videoTrackCount)
          putInt("decodedFrames", result.decodedFrames)
          putDouble("sampleCount", result.sampleCount.toDouble())
        })
      } catch (error: Exception) {
        val diagnostic = (error as? MediaIntegrityException)?.diagnosticCode ?: "MEDIA_CONTAINER_INVALID"
        promise.reject("MEDIA_INVALID", diagnostic, error)
      }
    }
  }
}
