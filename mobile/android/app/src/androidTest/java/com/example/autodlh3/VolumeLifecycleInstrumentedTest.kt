package com.example.autodlh3

import android.app.Dialog
import android.content.Intent
import android.graphics.Rect
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.SeekBar
import androidx.media3.common.Player
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VolumeLifecycleInstrumentedTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  private class TrackedPlayer(private val delegate: Player) : Player by delegate {
    val listeners = mutableSetOf<Player.Listener>()
    override fun addListener(listener: Player.Listener) {
      listeners.add(listener)
      delegate.addListener(listener)
    }
    override fun removeListener(listener: Player.Listener) {
      listeners.remove(listener)
      delegate.removeListener(listener)
    }
  }

  @Test fun bindingAndReattachmentRespectVolumeAndBalanceCustomListeners() {
    ActivityScenario.launch<CodecPlaybackTestActivity>(
      Intent(instrumentation.targetContext, CodecPlaybackTestActivity::class.java),
    ).use { scenario ->
      scenario.onActivity { activity ->
        val view = activity.video.playerView
        val first = TrackedPlayer(MpvPlayer(activity))
        val replacement = TrackedPlayer(MpvPlayer(activity))
        try {
          first.volume = 0.25f
          view.player = first
          val slider = view.findViewById<SeekBar>(R.id.player_volume_slider)
          assertEquals("Initial host volume must survive binding", 0.25f, first.volume, 0.001f)
          assertEquals(25, slider.progress)
          val attachedListeners = first.listeners.toSet()
          assertTrue(attachedListeners.isNotEmpty())
          val parent = view.parent as ViewGroup
          repeat(3) {
            parent.removeView(view)
            assertEquals("Only our custom listener is detached; PlayerView owns its own listener",
              attachedListeners.size - 1, first.listeners.size)
            first.volume = 0.6f
            parent.addView(view)
            assertEquals(attachedListeners, first.listeners)
            assertEquals("Reattachment must read current player state", 60, slider.progress)
            first.volume = 0.42f
            assertEquals(42, slider.progress)
          }
          view.player = first
          assertEquals(0.42f, first.volume, 0.001f)
          assertEquals(attachedListeners, first.listeners)
          view.player = null
          assertTrue(first.listeners.isEmpty())
          replacement.volume = 0.9f
          view.player = replacement
          assertEquals("A replacement should inherit the observed volume", 0.42f, replacement.volume, 0.001f)
        } finally {
          view.player = null
          assertTrue(first.listeners.isEmpty())
          assertTrue(replacement.listeners.isEmpty())
          first.release()
          replacement.release()
        }
      }
    }
  }

  @Test fun panelHitTestingUsesLocalCoordinatesInAnOffsetDialog() {
    ActivityScenario.launch<CodecPlaybackTestActivity>(
      Intent(instrumentation.targetContext, CodecPlaybackTestActivity::class.java),
    ).use { scenario ->
      var dialog: Dialog? = null
      var playerView: VolumePlayerView? = null
      var player: MpvPlayer? = null
      try {
        scenario.onActivity { activity ->
          val view = (android.view.LayoutInflater.from(activity)
            .inflate(R.layout.unified_video_view, null) as VolumePlayerView).also { playerView = it }
          player = MpvPlayer(activity)
          view.player = player
          view.controllerShowTimeoutMs = 0
          val windowHost = Dialog(activity).also { dialog = it }
          windowHost.setContentView(view)
          windowHost.show()
          val density = activity.resources.displayMetrics.density
          windowHost.window!!.setLayout((300 * density).toInt(), (240 * density).toInt())
          view.showController()
        }
        val deadline = SystemClock.uptimeMillis() + 10_000
        var ready = false
        while (!ready && SystemClock.uptimeMillis() < deadline) {
          scenario.onActivity {
            val view = requireNotNull(playerView)
            ready = view.width > 0 && view.isControllerFullyVisible
          }
          if (!ready) SystemClock.sleep(50)
        }
        assertTrue("Offset dialog must be laid out", ready)
        scenario.onActivity {
          val view = requireNotNull(playerView)
          val panel = view.findViewById<View>(R.id.player_volume_panel)
          view.findViewById<ImageButton>(R.id.player_volume_button).performLongClick()
          assertEquals(View.VISIBLE, panel.visibility)
        }
        instrumentation.waitForIdleSync()
        scenario.onActivity {
          val view = requireNotNull(playerView)
          val panel = view.findViewById<View>(R.id.player_volume_panel)
          val location = IntArray(2)
          view.getLocationOnScreen(location)
          assertTrue("Exercise a window offset", location[1] > 0)
          val bounds = Rect()
          panel.getDrawingRect(bounds)
          view.offsetDescendantRectToMyCoords(panel, bounds)
          fun touch(action: Int, x: Float, y: Float) {
            val now = SystemClock.uptimeMillis()
            val event = MotionEvent.obtain(now, now, action, x + location[0], y + location[1], 0)
            event.offsetLocation(-location[0].toFloat(), -location[1].toFloat())
            try { view.dispatchTouchEvent(event) } finally { event.recycle() }
          }
          // Hit panel padding near its top edge: the old screen/window mismatch
          // incorrectly treats this point as outside the panel.
          val x = bounds.left + 2f
          val y = bounds.top + 2f
          touch(MotionEvent.ACTION_DOWN, x, y)
          assertEquals(View.VISIBLE, panel.visibility)
          touch(MotionEvent.ACTION_CANCEL, x, y)
          touch(MotionEvent.ACTION_DOWN, 1f, 1f)
          assertEquals(View.GONE, panel.visibility)
          touch(MotionEvent.ACTION_CANCEL, 1f, 1f)
        }
      } finally {
        scenario.onActivity {
          try {
            dialog?.dismiss()
          } finally {
            try { playerView?.player = null } finally { player?.release() }
          }
        }
      }
    }
  }
}
