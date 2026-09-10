package com.example.autodlh3

import android.app.Dialog
import android.content.Context
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.AudioAttributes
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.ui.PlayerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event

/** Strict hardware VIDEO decoding. Audio continues using the normal decoder selection. */
class HardwareVideoView(context: Context) : FrameLayout(context), LifecycleEventListener {
  var onPlaybackEvent: ((String, Long) -> Unit)? = null
  var initialPositionMs = 0L
  private val view = PlayerView(context)
  private var player: ExoPlayer? = null
  private var source: String? = null
  private var dialog: Dialog? = null
  private var resume = false
  init {
    addView(view, LayoutParams(-1, -1))
    (context as? ReactContext)?.addLifecycleEventListener(this)
    view.setFullscreenButtonClickListener { fullscreen ->
      if (!fullscreen) dialog?.dismiss() else {
        val activity = (context as? ReactContext)?.currentActivity
        if (activity != null) {
          val window = Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
          dialog = window
          removeView(view)
          window.setContentView(view)
          window.setOnDismissListener {
            (view.parent as? ViewGroup)?.removeView(view)
            addView(view, LayoutParams(-1, -1))
            view.setFullscreenButtonState(false)
            dialog = null
          }
          window.show()
          window.window?.setLayout(-1, -1)
        }
      }
    }
  }
  fun setSource(value: String?) {
    if (value == source) return
    source = value
    player?.release()
    player = null
    if (value.isNullOrBlank()) return
    val selector = MediaCodecSelector { mime, secure, tunneling ->
      MediaCodecSelector.DEFAULT.getDecoderInfos(mime, secure, tunneling)
        .filter { !mime.startsWith("video/") || it.hardwareAccelerated }
    }
    val current = ExoPlayer.Builder(context, DefaultRenderersFactory(context)
      .setMediaCodecSelector(selector).setEnableDecoderFallback(true)).build()
    player = current
    view.player = current
    current.setAudioAttributes(AudioAttributes.DEFAULT, true)
    current.setHandleAudioBecomingNoisy(true)
    current.addListener(object : Player.Listener {
      override fun onRenderedFirstFrame() { onPlaybackEvent?.invoke("firstFrame", current.currentPosition) }
      override fun onPlayerError(error: PlaybackException) { onPlaybackEvent?.invoke("decodeFailed", current.currentPosition) }
      override fun onIsPlayingChanged(isPlaying: Boolean) { keepScreenOn = isPlaying }
    })
    current.setMediaItem(MediaItem.fromUri(value))
    current.seekTo(initialPositionMs)
    current.prepare()
    current.play()
  }
  override fun onHostPause() { resume = player?.playWhenReady == true; player?.pause() }
  override fun onHostResume() { if (resume) player?.play() }
  override fun onHostDestroy() = dispose()
  fun dispose() {
    onPlaybackEvent = null
    dialog?.dismiss()
    view.player = null
    player?.release(); player = null
    keepScreenOn = false
    (context as? ReactContext)?.removeLifecycleEventListener(this)
  }
}

class HardwareVideoViewManager : SimpleViewManager<HardwareVideoView>() {
  override fun getName() = "AutoDLHardwareVideoView"
  override fun createViewInstance(context: ThemedReactContext) = HardwareVideoView(context).apply {
    onPlaybackEvent = { status, position ->
      val data = Arguments.createMap().apply { putString("status", status); putDouble("positionMs", position.toDouble()) }
      UIManagerHelper.getEventDispatcherForReactTag(context, id)?.dispatchEvent(object : Event<Nothing>(UIManagerHelper.getSurfaceId(context), id) {
        override fun getEventName() = "topPlayback"
        override fun getEventData() = data
        override fun canCoalesce() = false
      })
    }
  }
  @ReactProp(name = "source") fun source(view: HardwareVideoView, value: String?) { view.setSource(value) }
  override fun onDropViewInstance(view: HardwareVideoView) { view.dispose(); super.onDropViewInstance(view) }
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    mutableMapOf("topPlayback" to mapOf("registrationName" to "onPlayback"))
}
