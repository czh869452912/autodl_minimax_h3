package com.example.autodlh3

import android.graphics.BitmapFactory
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import com.facebook.react.bridge.BridgeReactContext
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
class OriginalMediaInstrumentedTest {
  @Test fun high10StructureAndSoftwarePosterDoNotRequirePlatformDecodingOrModifyOriginal() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    val source = File(context.cacheDir, "original-media-review.mp4")
    val asset = InstrumentationRegistry.getArguments().getString("sampleAsset") ?: "high10-test.mp4"
    instrumentation.context.assets.open(asset).use { input -> source.outputStream().use { input.copyTo(it) } }
    val module = MediaModule(BridgeReactContext(context))
    try {
      val integrity = MediaIntegrity(context)
      val originalHash = integrity.sha256(source.toURI().toString())
      val probe = integrity.probeVideo(source.toURI().toString(), false)
      assertTrue(probe.sampleCount > 0)
      assertEquals(0, probe.decodedFrames)
      val done = CountDownLatch(1)
      val poster = AtomicReference<String?>(null)
      val failure = AtomicReference<String?>(null)
      module.extractPoster(source.toURI().toString(), "original-media-review", PromiseImpl(
        Callback { values -> poster.set(values.firstOrNull() as? String); done.countDown() },
        Callback { values -> failure.set(values.contentToString()); done.countDown() },
      ))
      assertTrue("Poster timeout", done.await(30, TimeUnit.SECONDS))
      assertNull(failure.get())
      val file = File(java.net.URI(requireNotNull(poster.get())))
      assertTrue(file.name.startsWith("sw-v3-"))
      val bitmap = BitmapFactory.decodeFile(file.absolutePath)
      assertNotNull(bitmap)
      assertTrue(bitmap.width in 1..640 && bitmap.height in 1..640)
      bitmap.recycle()
      // Retain a review artifact in the debug app's cache for visual inspection.
      file.copyTo(File(context.cacheDir, "direct-poster-result.jpg"), overwrite = true)
      assertEquals(originalHash, integrity.sha256(source.toURI().toString()))
    } finally { module.invalidate(); source.delete() }
  }
}
