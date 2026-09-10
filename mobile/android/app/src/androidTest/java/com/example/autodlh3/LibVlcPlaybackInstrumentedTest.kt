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
        ActivityScenario.launch<CodecPlaybackTestActivity>(Intent(context, CodecPlaybackTestActivity::class.java)).use { scenario ->
          scenario.onActivity { activity ->
            activity.video.onPlaybackEvent = { status, time ->
              if (status == "firstFrame") first.countDown()
              if (status == "progress" && time > 100) progressed.countDown()
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
            activity.video.seekTo(activity.video.getDuration() / 2)
            activity.video.start()
          }
          assertNull(failure.get())
        }
      }
      assertEquals(originalHash, MediaIntegrity(context).sha256(source.toURI().toString()))
    } finally { gallery?.let { context.contentResolver.delete(android.net.Uri.parse(it), null, null) }; source.delete() }
  }
}
