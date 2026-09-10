package com.example.autodlh3

import androidx.media3.exoplayer.ExoPlayer
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HardwareVideoPropsInstrumentedTest {
  @Test fun initialSeekIsAppliedRegardlessOfReactPropOrder() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    instrumentation.runOnMainSync {
      for (sourceFirst in listOf(true, false)) {
        val manager = HardwareVideoViewManager()
        val view = HardwareVideoView(instrumentation.targetContext)
        // Inspect ExoPlayer's pending seek, without depending on a hardware codec being
        // present on the emulator. The source intentionally need not decode for this test.
        val field = HardwareVideoView::class.java.getDeclaredField("player").apply { isAccessible = true }
        try {
          if (sourceFirst) manager.source(view, "file:///missing-test-video.mp4")
          manager.position(view, 4200.0)
          if (!sourceFirst) manager.source(view, "file:///missing-test-video.mp4")
          assertNull("Source must wait until all props arrive", field.get(view))
          HardwareVideoViewManager::class.java.getDeclaredMethod("onAfterUpdateTransaction", HardwareVideoView::class.java)
            .apply { isAccessible = true }.invoke(manager, view)
          assertEquals(4200L, (field.get(view) as ExoPlayer).currentPosition)
          manager.position(view, Double.NaN)
          assertEquals(0L, view.initialPositionMs)
          manager.position(view, -10.0)
          assertEquals(0L, view.initialPositionMs)
        } finally { view.dispose() }
      }
    }
  }
}
