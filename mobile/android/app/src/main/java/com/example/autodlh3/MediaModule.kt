package com.example.autodlh3

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MediaModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "AutoDLMedia"

  @ReactMethod
  fun openVideo(source: String) {
    if (source.isBlank()) return
    val intent = Intent(context, Media3PlayerActivity::class.java).apply {
      putExtra(Media3PlayerActivity.EXTRA_SOURCE, source)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
  }
}
