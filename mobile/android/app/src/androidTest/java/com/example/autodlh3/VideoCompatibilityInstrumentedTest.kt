package com.example.autodlh3

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.arthenica.ffmpegkit.FFprobeKit
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.ReturnCode
import java.io.File
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VideoCompatibilityInstrumentedTest {
  private val context = ApplicationProvider.getApplicationContext<Context>()
  private fun fixture(): File = File.createTempFile("compatible-fixture-", ".mp4", context.cacheDir).also { file ->
    InstrumentationRegistry.getInstrumentation().context.assets.open("high10-test.mp4").use { from ->
      file.outputStream().use { from.copyTo(it) }
    }
  }
  @Test fun high10SoftwareDecodeProducesPlayableEightBitAvcWithoutChangingOriginal() {
    val source = fixture()
    var part: File? = null
    try {
      val integrity = MediaIntegrity(context)
      val sha = integrity.sha256(source.toURI().toString())
      val converter = VideoCompatibility(context)
      val result = converter.prepare(converter.register(CompatibleVideoRequest(
        source.toURI().toString(), sha, "high10-instrumented-${System.nanoTime()}:compatible", 1, 16 * 1024 * 1024,
      )))
      part = File(java.net.URI(result.partUri))
      assertEquals("video/mp4", result.mime)
      assertEquals(sha, integrity.sha256(source.toURI().toString()))
      assertEquals(result.sha256, integrity.sha256(result.partUri))
      assertEquals(part.length(), result.byteSize)
      assertEquals(3, integrity.probeVideo(result.partUri).decodedFrames)
      val stream = FFprobeKit.getMediaInformation(part.absolutePath).mediaInformation.streams.first { it.type == "video" }
      assertEquals("h264", stream.codec)
      assertEquals("yuv420p", stream.format)
    } finally { part?.delete(); source.delete() }
  }

  @Test fun sourceHashMismatchAndQueuedCancellationLeaveNoOutput() {
    val source = fixture()
    try {
      val converter = VideoCompatibility(context)
      val request = CompatibleVideoRequest(source.toURI().toString(), "0".repeat(64), "hash-${System.nanoTime()}", 1, 1024 * 1024)
      try { converter.prepare(converter.register(request)); fail("hash mismatch accepted") }
      catch (error: VideoCompatibilityException) { assertEquals("MEDIA_COMPATIBILITY_SOURCE_CHANGED", error.diagnosticCode) }
      val work = converter.register(request.copy(operationAttempt = 2))
      assertFalse(converter.cancel(request.operationId, 1))
      assertTrue(converter.cancel(request.operationId, 2))
      try { converter.prepare(work); fail("cancelled operation accepted") }
      catch (error: VideoCompatibilityException) { assertEquals("MEDIA_COMPATIBILITY_CANCELLED", error.diagnosticCode) }
      assertFalse(converter.cancel(request.operationId, 2))
    } finally { source.delete() }
  }

  @Test fun savedContentUriCanBeConvertedAndHdrIsRejected() {
    val source = fixture()
    val hdr = File.createTempFile("compatible-hdr-", ".mp4", context.cacheDir)
    var gallery: String? = null
    var compatibleGallery: String? = null
    var part: File? = null
    try {
      val sha = MediaIntegrity(context).sha256(source.toURI().toString())
      val publisher = MediaStorePublisher(context.contentResolver)
      val id = "compatibility-test-${System.nanoTime()}"
      gallery = publisher.publish(source.toURI().toString(), "$id:original", "$id-original.mp4").uri
      val converter = VideoCompatibility(context)
      val result = converter.prepare(converter.register(CompatibleVideoRequest(
        gallery.toString(), sha, "content-${System.nanoTime()}", 0, 16 * 1024 * 1024,
      )))
      part = File(java.net.URI(result.partUri))
      assertEquals(sha, MediaIntegrity(context).sha256(gallery.toString()))
      assertEquals(3, MediaIntegrity(context).probeVideo(result.partUri).decodedFrames)
      compatibleGallery = publisher.publish(result.partUri, id, "$id-compatible.mp4").uri
      assertNotEquals(gallery, compatibleGallery)
      assertEquals(3, MediaIntegrity(context).probeVideo(compatibleGallery).decodedFrames)
      assertEquals(sha, MediaIntegrity(context).sha256(gallery))
      val retryOriginal = publisher.publish(source.toURI().toString(), "$id:original", "$id-original.mp4")
      assertTrue(retryOriginal.alreadyExisted)
      assertEquals(gallery, retryOriginal.uri)
      assertTrue(ReturnCode.isSuccess(FFmpegKit.executeWithArguments(arrayOf("-v", "error", "-i", source.absolutePath,
        "-c", "copy", "-bsf:v", "h264_metadata=colour_primaries=9:transfer_characteristics=16:matrix_coefficients=9", "-y", hdr.absolutePath)).returnCode))
      assertEquals("smpte2084", FFprobeKit.getMediaInformation(hdr.absolutePath).mediaInformation.streams
        .first { it.type == "video" }.getStringProperty("color_transfer"))
      try {
        converter.prepare(converter.register(CompatibleVideoRequest(hdr.toURI().toString(),
          MediaIntegrity(context).sha256(hdr.toURI().toString()), "hdr-${System.nanoTime()}", 0, 16 * 1024 * 1024)))
        fail("HDR must not silently convert to SDR")
      } catch (error: VideoCompatibilityException) { assertEquals("MEDIA_COMPATIBILITY_HDR_UNSUPPORTED", error.diagnosticCode) }
    } finally {
      gallery?.let { context.contentResolver.delete(android.net.Uri.parse(it), null, null) }
      compatibleGallery?.let { context.contentResolver.delete(android.net.Uri.parse(it), null, null) }
      part?.delete(); hdr.delete(); source.delete()
    }
  }
}
