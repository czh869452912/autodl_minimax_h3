package com.example.autodlh3

import android.content.Intent
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class LibVlcPlaybackInstrumentedTest {
  @Test fun softwareDecoderRendersHigh10AndSeeksFromFileAndContentUri() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    val source = File(context.cacheDir, "libvlc-high10-test.mp4")
    val asset = InstrumentationRegistry.getArguments().getString("sampleAsset") ?: "high10-test.mp4"
    instrumentation.context.assets.open(asset).use { from -> source.outputStream().use { from.copyTo(it) } }
    var gallery: String? = null
    try {
      val originalHash = MediaIntegrity(context).sha256(source.toURI().toString())
      gallery = MediaStorePublisher(context.contentResolver).publish(source.toURI().toString(), "vlc-test-${System.nanoTime()}", "vlc-test.mp4").uri
      for (uri in listOf(source.toURI().toString(), gallery)) {
        val first = CountDownLatch(1)
        val progressed = CountDownLatch(1)
        val failure = AtomicReference<String?>(null)
        val sought = CountDownLatch(1)
        val targetPosition = java.util.concurrent.atomic.AtomicLong(-1)
        ActivityScenario.launch<CodecPlaybackTestActivity>(Intent(context, CodecPlaybackTestActivity::class.java)).use { scenario ->
          scenario.onActivity { activity ->
            activity.video.onPlaybackEvent = { status, time ->
              if (status == "firstFrame") first.countDown()
              if (status == "progress" && time > 100) progressed.countDown()
              if (status == "progress" && targetPosition.get() >= 0 && time >= targetPosition.get() - 250) sought.countDown()
              if (status in setOf("sourceUnavailable", "decodeFailed")) failure.set(status)
            }
            activity.video.setSource(uri)
          }
          assertTrue("No actual TextureView frame; error=${failure.get()}", first.await(15, TimeUnit.SECONDS))
          assertTrue("Playback clock did not advance", progressed.await(10, TimeUnit.SECONDS))
          scenario.onActivity { activity ->
            assertTrue(activity.video.getDuration() > 0)
            activity.video.pause()
            assertFalse(activity.video.isPlaying())
            targetPosition.set(activity.video.getDuration().toLong() / 2)
            activity.video.seekTo(targetPosition.get().toInt())
            activity.video.start()
          }
          assertTrue("Seek did not reach the requested position", sought.await(10, TimeUnit.SECONDS))
          instrumentation.uiAutomation.takeScreenshot()?.let { screenshot ->
            File(context.cacheDir, "direct-playback.png").outputStream().use { screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            screenshot.recycle()
          }
          assertNull(failure.get())
        }
      }
      assertEquals(originalHash, MediaIntegrity(context).sha256(source.toURI().toString()))
    } finally { gallery?.let { context.contentResolver.delete(android.net.Uri.parse(it), null, null) }; source.delete() }
  }
}
