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
import com.facebook.react.bridge.ReadableMap
import okhttp3.OkHttpClient

class MediaModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newFixedThreadPool(2)
  private val publisher = MediaStorePublisher(context.contentResolver)
  private val integrity = MediaIntegrity(context)
  private val transferPolicy = ArtifactTransferPolicy()
  private val artifactTransfer = ArtifactTransfer(
    partsDir = File(context.filesDir, "cas/parts"),
    httpClient = OkHttpClient(),
    validator = transferPolicy::validate,
    dns = { host, _ -> transferPolicy.resolvePublic(host) },
    durableSha256 = integrity::sha256,
  )
  override fun getName() = "AutoDLMedia"

  private fun transferRequest(options: ReadableMap): ArtifactTransferRequest = try {
    fun text(name: String): String = options.getString(name)?.takeIf { it.isNotBlank() }
      ?: throw ArtifactTransferException("ARTIFACT_TRANSFER_REQUEST_INVALID", false)
    fun stringSet(name: String): Set<String> = options.getArray(name)?.toArrayList()?.map { value ->
      value as? String ?: throw ArtifactTransferException("ARTIFACT_TRANSFER_REQUEST_INVALID", false)
    }?.toSet() ?: throw ArtifactTransferException("ARTIFACT_TRANSFER_REQUEST_INVALID", false)
    fun positiveLong(name: String): Long {
      val value = options.getDouble(name)
      if (!value.isFinite() || value <= 0 || value > Long.MAX_VALUE || value % 1.0 != 0.0) {
        throw ArtifactTransferException("ARTIFACT_TRANSFER_REQUEST_INVALID", false)
      }
      return value.toLong()
    }
    val operationAttempt = options.getDouble("operationAttempt")
    if (!operationAttempt.isFinite() || operationAttempt < 0 || operationAttempt > Int.MAX_VALUE || operationAttempt % 1.0 != 0.0) {
      throw ArtifactTransferException("ARTIFACT_TRANSFER_REQUEST_INVALID", false)
    }
    ArtifactTransferRequest(
      url = text("url"),
      allowedHosts = stringSet("allowedHosts"),
      allowProviderSuppliedPublicHosts = options.getBoolean("allowProviderSuppliedPublicHosts"),
      acceptedMimes = stringSet("acceptedMimes"),
      maxBytes = positiveLong("maxBytes"),
      connectTimeoutMs = positiveLong("connectTimeoutMs"),
      idleTimeoutMs = positiveLong("idleTimeoutMs"),
      expectedSha256 = if (options.hasKey("expectedSha256") && !options.isNull("expectedSha256")) options.getString("expectedSha256") else null,
      operationId = text("operationId"),
      operationAttempt = operationAttempt.toInt(),
    )
  } catch (error: ArtifactTransferException) {
    throw error
  } catch (error: Exception) {
    throw ArtifactTransferException("ARTIFACT_TRANSFER_REQUEST_INVALID", false, error)
  }

  @ReactMethod
  fun transferArtifact(options: ReadableMap, promise: Promise) {
    executor.execute {
      try {
        val result = artifactTransfer.transfer(transferRequest(options))
        promise.resolve(Arguments.createMap().apply {
          putString("partUri", result.partUri)
          putString("finalUrl", result.finalUrl)
          putString("mime", result.mime)
          putDouble("byteSize", result.byteSize.toDouble())
          putString("sha256", result.sha256)
        })
      } catch (error: ArtifactTransferException) {
        promise.reject(error.diagnosticCode, error.message, error)
      } catch (error: Exception) {
        promise.reject("ARTIFACT_TRANSFER_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun cancelArtifactTransfer(operationId: String, promise: Promise) {
    executor.execute {
      if (operationId.isBlank()) {
        promise.reject("ARTIFACT_TRANSFER_REQUEST_INVALID", "operationId is required")
      } else {
        promise.resolve(artifactTransfer.cancel(operationId.trim()))
      }
    }
  }

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
