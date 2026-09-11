package com.example.autodlh3

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.ui.PlayerView
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import java.lang.ref.WeakReference

/** A single Media3 controller and Player survive fullscreen and decoder preference changes. */
class UnifiedVideoView(context: Context) : FrameLayout(context), LifecycleEventListener {
  companion object { private var active = WeakReference<UnifiedVideoView>(null) }
  val playerView = LayoutInflater.from(context).inflate(R.layout.unified_video_view, this, false) as PlayerView
  var playbackPlayer: MpvPlayer? = null
    private set
  var configuredSource: String? = null
  var configuredDecodeMode = "auto"
  var configuredRetryToken = 0
  var onPlaybackEvent: ((String, Long) -> Unit)? = null
  private var source: String? = null
  private var retryToken = 0
  private var decodeMode = "auto"
  val eventSource: String? get() = source
  val eventRetryToken: Int get() = retryToken
  private var disposed = false
  private var hostPaused = false
  private var fullscreen: Dialog? = null

  init {
    addView(playerView, LayoutParams(-1, -1))
    playerView.setFullscreenButtonClickListener(::setFullscreen)
    (context as? ReactContext)?.addLifecycleEventListener(this)
  }

  override fun requestLayout() {
    super.requestLayout()
    // React Native owns this host's bounds and may not run another Android layout
    // pass when they are unchanged. Native children still need one after being
    // moved back from the fullscreen window (and when their controls change).
    post {
      if (!disposed && isAttachedToWindow && playerView.parent === this) {
        measure(
          View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
          View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY),
        )
        layout(left, top, right, bottom)
      }
    }
  }

  fun applyConfiguration() {
    if (disposed) return
    val next = configuredSource?.takeIf { it.isNotBlank() }
    if (next == null) {
      setFullscreen(false)
      releasePlayer()
      source = null
      return
    }
    val mediaChanged = source != next || retryToken != configuredRetryToken
    if (mediaChanged || decodeMode != configuredDecodeMode) setFullscreen(false)
    try {
      val current = playbackPlayer ?: MpvPlayer(context).also { player ->
        playbackPlayer = player
        player.onPlaybackEvent = { status, position ->
          // Recovery actions belong to the React host. Reveal them before emitting failure.
          if (status == "decodeFailed" || status == "sourceUnavailable") setFullscreen(false)
          onPlaybackEvent?.invoke(status, position)
        }
        player.addListener(object : Player.Listener {
          override fun onIsPlayingChanged(isPlaying: Boolean) {
            keepScreenOn = isPlaying
            playerView.keepScreenOn = isPlaying
          }
          override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (playWhenReady) {
              active.get()?.takeIf { it !== this@UnifiedVideoView }?.playbackPlayer?.pause()
              active = WeakReference(this@UnifiedVideoView)
            }
          }
        })
        playerView.player = player
        player.setHostPaused(hostPaused || !isAttachedToWindow || !isShown)
      }
      if (mediaChanged) {
        source = next
        retryToken = configuredRetryToken
        current.setMediaItem(MediaItem.fromUri(next))
      }
      current.setDecodeMode(configuredDecodeMode)
      decodeMode = configuredDecodeMode
      if (mediaChanged) {
        current.prepare()
        current.play()
      }
    } catch (_: Exception) {
      // Event dispatch reads this attempted identity synchronously before releasePlayer clears it.
      source = next
      retryToken = configuredRetryToken
      setFullscreen(false)
      onPlaybackEvent?.invoke("decodeFailed", 0)
      releasePlayer()
    } catch (_: LinkageError) {
      source = next
      retryToken = configuredRetryToken
      setFullscreen(false)
      onPlaybackEvent?.invoke("decodeFailed", 0)
      releasePlayer()
    }
  }

  fun setFullscreen(enabled: Boolean) {
    if (disposed) return
    if (!enabled) { fullscreen?.dismiss(); return }
    if (fullscreen != null) return
    val activity = (context as? Activity) ?: (context as? ReactContext)?.currentActivity ?: return
    val dialog = Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
    fullscreen = dialog
    removeView(playerView)
    dialog.setContentView(playerView)
    dialog.setOnDismissListener {
      (playerView.parent as? ViewGroup)?.removeView(playerView)
      if (!disposed) addView(playerView, LayoutParams(-1, -1))
      playerView.setFullscreenButtonState(false)
      fullscreen = null
    }
    dialog.show()
    dialog.window?.setLayout(-1, -1)
    playerView.setFullscreenButtonState(true)
  }

  private fun updateVisibility() { playbackPlayer?.setHostPaused(hostPaused || !isAttachedToWindow || !isShown) }
  override fun onAttachedToWindow() { super.onAttachedToWindow(); updateVisibility() }
  override fun onDetachedFromWindow() { playbackPlayer?.setHostPaused(true); super.onDetachedFromWindow() }
  override fun onVisibilityChanged(changedView: View, visibility: Int) { super.onVisibilityChanged(changedView, visibility); updateVisibility() }
  override fun onHostPause() { hostPaused = true; updateVisibility() }
  override fun onHostResume() { hostPaused = false; updateVisibility() }
  override fun onHostDestroy() = dispose()

  private fun releasePlayer() {
    playerView.player = null
    playbackPlayer?.onPlaybackEvent = null
    playbackPlayer?.release()
    playbackPlayer = null
    source = null
    keepScreenOn = false
    playerView.keepScreenOn = false
    if (active.get() === this) active.clear()
  }

  fun dispose() {
    if (disposed) return
    disposed = true
    onPlaybackEvent = null
    fullscreen?.dismiss()
    releasePlayer()
    (context as? ReactContext)?.removeLifecycleEventListener(this)
  }
}
