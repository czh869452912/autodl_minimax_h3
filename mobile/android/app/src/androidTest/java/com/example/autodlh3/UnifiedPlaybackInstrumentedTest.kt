package com.example.autodlh3

import android.content.Intent
import android.os.SystemClock
import androidx.lifecycle.Lifecycle
import androidx.media3.common.Player
import androidx.media3.common.C
import androidx.media3.common.TrackSelectionOverride
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.arthenica.ffmpegkit.FFprobeKit
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.ReturnCode
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UnifiedPlaybackInstrumentedTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  @Test fun exitingFullscreenRestoresInlineBoundsWithoutAnotherReactLayout() {
    ActivityScenario.launch<CodecPlaybackTestActivity>(
      Intent(instrumentation.targetContext, CodecPlaybackTestActivity::class.java),
    ).use { scenario ->
      scenario.onActivity { activity ->
        val video = activity.video
        (video.parent as android.view.ViewGroup).removeView(video)
        // Like a React root: child bounds are assigned externally, not by the
        // normal Android measure/layout traversal after requestLayout().
        val root = object : android.widget.FrameLayout(activity) {
          override fun onMeasure(widthSpec: Int, heightSpec: Int) {
            setMeasuredDimension(android.view.View.MeasureSpec.getSize(widthSpec), android.view.View.MeasureSpec.getSize(heightSpec))
          }
          override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit
        }
        root.addView(video)
        activity.setContentView(root)
        video.measure(
          android.view.View.MeasureSpec.makeMeasureSpec(320, android.view.View.MeasureSpec.EXACTLY),
          android.view.View.MeasureSpec.makeMeasureSpec(180, android.view.View.MeasureSpec.EXACTLY),
        )
        video.layout(20, 40, 340, 220)
      }
      awaitState(scenario) { it.playerView.width == 320 && it.playerView.height == 180 }
      repeat(3) { cycle ->
        scenario.onActivity { it.video.setFullscreen(true) }
        // Let the Dialog actually lay out the player at fullscreen dimensions.
        awaitState(scenario) { it.playerView.parent !== it && it.playerView.height > 180 }
        if (cycle == 1) {
          instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        } else {
          scenario.onActivity { it.video.setFullscreen(false) }
        }
        awaitState(scenario) {
          it.playerView.parent === it && it.playerView.width == 320 && it.playerView.height == 180
        }
        scenario.onActivity {
          val video = it.video
          assertEquals(20, video.left)
          assertEquals(40, video.top)
          assertEquals(320, video.playerView.measuredWidth)
          assertEquals(180, video.playerView.measuredHeight)
          assertEquals(0, video.playerView.left)
          assertEquals(0, video.playerView.top)
        }
      }
    }
  }

  @Test fun sourceConfiguredBeforeViewAttachmentRendersPixels() {
    val context = instrumentation.targetContext
    val file = File(context.cacheDir, "mpv-before-attach.mp4")
    instrumentation.context.assets.open("unified-high10-test.mp4").use { input -> file.outputStream().use { input.copyTo(it) } }
    try {
      val intent = Intent(context, CodecPlaybackTestActivity::class.java)
        .putExtra("sourceBeforeAttach", file.toURI().toString())
      ActivityScenario.launch<CodecPlaybackTestActivity>(intent).use { scenario ->
        awaitState(scenario) { it.playbackPlayer!!.isPlaying }
        captureVisiblePattern(context)
      }
    } finally { file.delete() }
  }

  @Test fun originalHigh10UsesMedia3ControlsFromFileAndContentWithSeekAndFullscreen() {
    val context = instrumentation.targetContext
    val file = File(context.cacheDir, "mpv-high10-test.mp4")
    val asset = InstrumentationRegistry.getArguments().getString("sampleAsset") ?: "unified-high10-test.mp4"
    instrumentation.context.assets.open(asset).use { input -> file.outputStream().use { input.copyTo(it) } }
    var gallery: String? = null
    try {
      val hash = MediaIntegrity(context).sha256(file.toURI().toString())
      gallery = MediaStorePublisher(context.contentResolver).publish(file.toURI().toString(), "mpv-${System.nanoTime()}", "mpv-test.mp4").uri
      for (source in listOf(file.toURI().toString(), gallery)) {
        val firstFrame = CountDownLatch(1)
        val error = AtomicReference<String?>(null)
        ActivityScenario.launch<CodecPlaybackTestActivity>(Intent(context, CodecPlaybackTestActivity::class.java)).use { scenario ->
          scenario.onActivity { activity ->
            activity.video.onPlaybackEvent = { status, _ ->
              if (status == "firstFrame") firstFrame.countDown()
              if (status in setOf("sourceUnavailable", "decodeFailed")) error.set(status)
            }
            activity.video.configuredSource = source
            activity.video.configuredDecodeMode = InstrumentationRegistry.getArguments().getString("decodeMode") ?: "software"
            activity.video.applyConfiguration()
          }
          assertTrue("No rendered frame: ${error.get()}", firstFrame.await(20, TimeUnit.SECONDS))
          awaitState(scenario) { it.playbackPlayer!!.isPlaying && it.playbackPlayer!!.currentPosition > 300 }
          captureVisiblePattern(context)
          // Both FFmpeg dependency graphs must work in one process, including while mpv is alive.
          val probe = FFprobeKit.getMediaInformation(file.absolutePath)
          assertEquals("h264", probe.mediaInformation.streams.first { it.type == "video" }.codec)
          val poster = File(context.cacheDir, "mpv-coexistence-poster.jpg")
          try {
            val conversion = FFmpegKit.executeWithArguments(arrayOf("-v", "error", "-i", file.absolutePath,
              "-frames:v", "1", "-update", "1", "-y", poster.absolutePath))
            assertTrue("Thumbnail FFmpeg must coexist with libmpv", ReturnCode.isSuccess(conversion.returnCode))
            assertTrue(poster.length() > 0)
          } finally { poster.delete() }
          scenario.onActivity { activity ->
            val player = requireNotNull(activity.video.playbackPlayer)
            assertSame(player, activity.video.playerView.player)
            assertTrue(activity.video.playerView.useController)
            assertTrue(player.duration > 0)
            player.pause()
            assertFalse(player.playWhenReady)
            player.seekTo(player.duration / 2)
          }
          awaitState(scenario) { it.playbackPlayer!!.currentPosition >= it.playbackPlayer!!.duration / 2 - 300 }
          scenario.onActivity { activity ->
            val before = activity.video.playbackPlayer
            val position = before!!.currentPosition
            activity.video.setFullscreen(true)
            assertSame(before, activity.video.playbackPlayer)
            activity.video.setFullscreen(false)
            assertSame(before, activity.video.playbackPlayer)
            assertEquals(position, before.currentPosition)
            activity.video.configuredDecodeMode = "auto"
            activity.video.applyConfiguration()
            assertSame("Mode changes must not replace Player", before, activity.video.playbackPlayer)
            before.play()
          }
          awaitState(scenario) { it.playbackPlayer!!.isPlaying }
          assertTrue(instrumentation.uiAutomation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME))
          awaitState(scenario) { !it.playbackPlayer!!.isPlaying }
          context.startActivity(Intent(context, CodecPlaybackTestActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
          awaitState(scenario) { it.playbackPlayer!!.isPlaying }
          scenario.moveToState(Lifecycle.State.CREATED)
          scenario.onActivity { assertFalse(it.video.playbackPlayer!!.isPlaying) }
          scenario.moveToState(Lifecycle.State.RESUMED)
          awaitState(scenario) { it.playbackPlayer!!.isPlaying }
          assertNull(error.get())
          captureVisiblePattern(context)
          scenario.onActivity {
            val player = it.video.playbackPlayer!!
            player.seekTo((player.duration - 250).coerceAtLeast(0))
            player.play()
          }
          awaitState(scenario) { it.playbackPlayer!!.playbackState == Player.STATE_ENDED }
          assertNull("Natural EOF must not be reported as decoding failure", error.get())
          scenario.onActivity { it.video.playbackPlayer!!.play() }
          awaitState(scenario) { it.playbackPlayer!!.isPlaying && it.playbackPlayer!!.currentPosition in 100..3000 }
          val replacementFrame = CountDownLatch(1)
          scenario.onActivity {
            it.video.onPlaybackEvent = { status, _ -> if (status == "firstFrame") replacementFrame.countDown() }
            val samePlayer = it.video.playbackPlayer
            it.video.configuredDecodeMode = "software"
            it.video.configuredSource = if (source == gallery) file.toURI().toString() else gallery
            it.video.applyConfiguration()
            assertSame("Combined source/mode update must retain Player", samePlayer, it.video.playbackPlayer)
          }
          assertTrue("Replacing a valid source must render the new source", replacementFrame.await(20, TimeUnit.SECONDS))
        }
      }
      assertEquals(hash, MediaIntegrity(context).sha256(file.toURI().toString()))
    } finally {
      gallery?.let { context.contentResolver.delete(android.net.Uri.parse(it), null, null) }
      file.delete()
    }
  }

  @Test fun sourceErrorsAndRetryKeepSameMedia3ViewAndReleaseCleanly() {
    val failed = CountDownLatch(1)
    val recovered = CountDownLatch(1)
    val context = instrumentation.targetContext
    val validFile = File(context.cacheDir, "mpv-retry-test.mp4")
    instrumentation.context.assets.open("unified-high10-test.mp4").use { input -> validFile.outputStream().use { input.copyTo(it) } }
    try {
    ActivityScenario.launch<CodecPlaybackTestActivity>(Intent(instrumentation.targetContext, CodecPlaybackTestActivity::class.java)).use { scenario ->
      scenario.onActivity { activity ->
        val view = activity.video
        view.onPlaybackEvent = { status, _ -> if (status == "sourceUnavailable") failed.countDown() }
        view.configuredSource = "file:///missing-mpv-test.mp4"
        view.applyConfiguration()
      }
      assertTrue(failed.await(10, TimeUnit.SECONDS))
      scenario.onActivity { activity ->
        val playerView = activity.video.playerView
        activity.video.configuredRetryToken++
        activity.video.applyConfiguration()
        assertSame(playerView, activity.video.playerView)
        activity.video.onPlaybackEvent = { status, _ -> if (status == "firstFrame") recovered.countDown() }
        activity.video.configuredSource = validFile.toURI().toString()
        activity.video.configuredDecodeMode = "software"
        activity.video.applyConfiguration()
        assertSame(playerView, activity.video.playerView)
      }
      assertTrue("New source must recover despite queued errors from old source", recovered.await(20, TimeUnit.SECONDS))
      scenario.onActivity { activity ->
        activity.video.setFullscreen(true)
        activity.video.configuredSource = "file:///missing-fullscreen-test.mp4"
        activity.video.applyConfiguration()
      }
      awaitState(scenario) { it.playerView.parent === it }
      scenario.onActivity { activity ->
        activity.video.dispose()
        activity.video.dispose()
        assertNull(activity.video.playerView.player)
        assertFalse(activity.video.keepScreenOn)
      }
    }
    } finally { validFile.delete() }
  }

  @Test fun reactPropsAreAppliedTogetherAndDoNotStartAnIntermediateSource() {
    instrumentation.runOnMainSync {
      val manager = UnifiedVideoViewManager()
      val view = UnifiedVideoView(instrumentation.targetContext)
      try {
        manager.source(view, "file:///missing-mpv-test.mp4")
        manager.mode(view, "software")
        manager.retry(view, 2)
        assertNull("React setters must not start playback before the transaction finishes", view.playbackPlayer)
        assertEquals("software", view.configuredDecodeMode)
        assertEquals(2, view.configuredRetryToken)
        manager.mode(view, "invalid")
        assertEquals("auto", view.configuredDecodeMode)
      } finally { view.dispose() }
    }
  }

  @Test fun media3TrackAndSpeedControlsReachTheNativeEngine() {
    val context = instrumentation.targetContext
    val file = File(context.cacheDir, "mpv-tracks-test.mp4")
    instrumentation.context.assets.open("unified-tracks-test.mp4").use { input -> file.outputStream().use { input.copyTo(it) } }
    val firstFrame = CountDownLatch(1)
    try {
      assertNotNull("FFmpegKit loads before mpv in this flow", FFprobeKit.getMediaInformation(file.absolutePath).mediaInformation)
      ActivityScenario.launch<CodecPlaybackTestActivity>(Intent(context, CodecPlaybackTestActivity::class.java)).use { scenario ->
        scenario.onActivity {
          it.video.onPlaybackEvent = { status, _ -> if (status == "firstFrame") firstFrame.countDown() }
          it.video.configuredSource = file.toURI().toString()
          it.video.configuredDecodeMode = "software"
          it.video.applyConfiguration()
        }
        assertTrue(firstFrame.await(20, TimeUnit.SECONDS))
        scenario.onActivity {
          val player = it.video.playbackPlayer!!
          player.pause()
          val audio = player.currentTracks.groups.filter { group -> group.type == C.TRACK_TYPE_AUDIO }
          assertEquals(2, audio.size)
          player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setOverrideForType(TrackSelectionOverride(audio[1].mediaTrackGroup, listOf(0)))
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
          player.setPlaybackSpeed(1.5f)
          assertEquals(1.5f, player.playbackParameters.speed)
          try {
            player.playbackParameters = androidx.media3.common.PlaybackParameters(1f, 1.2f)
            fail("Independent pitch must fail explicitly instead of being silently discarded")
          } catch (_: IllegalArgumentException) { }
          assertEquals(1.5f, player.playbackParameters.speed)
        }
        awaitState(scenario) {
          val groups = it.playbackPlayer!!.currentTracks.groups
          groups.filter { group -> group.type == C.TRACK_TYPE_AUDIO }.getOrNull(1)?.isSelected == true &&
            groups.none { group -> group.type == C.TRACK_TYPE_TEXT && group.isSelected }
        }
      }
    } finally { file.delete() }
  }

  private fun awaitState(scenario: ActivityScenario<CodecPlaybackTestActivity>, predicate: (UnifiedVideoView) -> Boolean) {
    val deadline = SystemClock.elapsedRealtime() + 8000
    do {
      var result = false
      scenario.onActivity { result = predicate(it.video) }
      if (result) return
      SystemClock.sleep(50)
    } while (SystemClock.elapsedRealtime() < deadline)
    fail("Playback did not reach expected state")
  }

  private fun captureVisiblePattern(context: android.content.Context) {
    val deadline = SystemClock.elapsedRealtime() + 4000
    do {
      instrumentation.waitForIdleSync()
      val bitmap = instrumentation.uiAutomation.takeScreenshot()
      if (bitmap != null) {
        var colored = 0
        for (y in bitmap.height / 4 until bitmap.height * 3 / 4 step 20) {
          for (x in 20 until bitmap.width - 20 step 20) {
            val pixel = bitmap.getPixel(x, y)
            val r = android.graphics.Color.red(pixel)
            val g = android.graphics.Color.green(pixel)
            val b = android.graphics.Color.blue(pixel)
            if (maxOf(r, g, b) - minOf(r, g, b) > 60) colored++
          }
        }
        File(context.cacheDir, "unified-playback.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        if (colored > 100) return
      }
      SystemClock.sleep(100)
    } while (SystemClock.elapsedRealtime() < deadline)
    fail("Visible screenshot contains no decoded color pattern (black/white surface or covered video)")
  }
}
