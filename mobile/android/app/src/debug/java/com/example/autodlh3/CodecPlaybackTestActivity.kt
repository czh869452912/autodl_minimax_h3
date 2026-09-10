package com.example.autodlh3

import android.app.Activity
import android.os.Bundle

/** Instrumentation host only; absent from release and not externally exported. */
class CodecPlaybackTestActivity : Activity() {
  lateinit var video: LibVlcView
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    video = LibVlcView(this)
    setContentView(video)
  }
  override fun onResume() { super.onResume(); video.onHostResume() }
  override fun onPause() { video.onHostPause(); super.onPause() }
  override fun onDestroy() { video.dispose(); super.onDestroy() }
}
