package com.example.autodlh3

import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.ImageButton
import android.widget.SeekBar
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VolumeControlsInstrumentedTest {
  @Test fun integratedVolumeControlsRestoreLevelAndSurviveFullscreen() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    val source = File(context.cacheDir, "volume-controls-test.mp4")
    instrumentation.context.assets.open("unified-high10-test.mp4").use { input ->
      source.outputStream().use { input.copyTo(it) }
    }
    try {
      ActivityScenario.launch<CodecPlaybackTestActivity>(
        Intent(context, CodecPlaybackTestActivity::class.java)
          .putExtra("sourceBeforeAttach", source.toURI().toString()),
      ).use { scenario ->
        SystemClock.sleep(1500)
        scenario.onActivity {
          val video = it.video
          (video.parent as android.view.ViewGroup).setBackgroundColor(android.graphics.Color.rgb(24, 24, 24))
          video.layoutParams = android.widget.FrameLayout.LayoutParams(
            -1, (220 * it.resources.displayMetrics.density).toInt(), android.view.Gravity.CENTER,
          )
          val view = it.video.playerView
          val player = requireNotNull(view.player)
          player.pause()
          view.controllerShowTimeoutMs = 0
          view.showController()
          val button = view.findViewById<ImageButton>(R.id.player_volume_button)
          val slider = view.findViewById<SeekBar>(R.id.player_volume_slider)
          val panel = view.findViewById<View>(R.id.player_volume_panel)
          assertEquals(View.GONE, view.findViewById<View>(R.id.player_fullscreen_back).visibility)
          player.volume = 0.37f
          assertEquals(37, slider.progress)
          button.performClick()
          assertEquals(0f, player.volume, 0.001f)
          button.performClick()
          assertEquals(0.37f, player.volume, 0.001f)
          button.performLongClick()
          assertEquals(View.VISIBLE, panel.visibility)
          assertTrue(slider.performAccessibilityAction(
            AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id,
            Bundle().apply { putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE, 64f) },
          ))
          assertEquals(0.64f, player.volume, 0.001f)
        }
        SystemClock.sleep(400)
        val screenshot = instrumentation.uiAutomation.takeScreenshot()
        File(context.getExternalFilesDir(null), "volume-controls-inline.png").outputStream().use {
          screenshot.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        screenshot.recycle()
        SystemClock.sleep(3100)
        scenario.onActivity {
          val view = it.video.playerView
          assertEquals(View.GONE, view.findViewById<View>(R.id.player_volume_panel).visibility)
          it.video.setFullscreen(true)
          assertEquals(View.VISIBLE, view.findViewById<View>(R.id.player_fullscreen_back).visibility)
          view.showController()
          view.findViewById<ImageButton>(R.id.player_volume_button).performLongClick()
          assertEquals(0.64f, view.player!!.volume, 0.001f)
        }
        SystemClock.sleep(400)
        val fullscreen = instrumentation.uiAutomation.takeScreenshot()
        File(context.getExternalFilesDir(null), "volume-controls-fullscreen.png").outputStream().use {
          fullscreen.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        fullscreen.recycle()
        scenario.onActivity {
          val view = it.video.playerView
          val player = view.player
          val position = player!!.currentPosition
          view.findViewById<View>(R.id.player_fullscreen_back).performClick()
          assertSame(player, view.player)
          assertEquals(position, player.currentPosition)
        }
        // Dialog dispatches onDismiss asynchronously before reattaching the player.
        instrumentation.waitForIdleSync()
        scenario.onActivity {
          val view = it.video.playerView
          assertSame(it.video, view.parent)
          assertEquals(View.GONE, view.findViewById<View>(R.id.player_fullscreen_back).visibility)
          assertEquals(0.64f, view.player!!.volume, 0.001f)
          view.findViewById<ImageButton>(R.id.player_volume_button).performLongClick()
          view.hideController()
        }
        SystemClock.sleep(500)
        scenario.onActivity {
          assertEquals(View.GONE, it.video.playerView.findViewById<View>(R.id.player_volume_panel).visibility)
        }
      }
    } finally { source.delete() }
  }
}
