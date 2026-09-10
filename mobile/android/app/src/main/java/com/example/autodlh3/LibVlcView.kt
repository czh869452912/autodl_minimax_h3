package com.example.autodlh3

import android.app.Dialog
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.view.Gravity
import android.view.TextureView
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.MediaController
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import java.lang.ref.WeakReference

/** Local-file software fallback. A TextureView update, not Playing, signals the first frame. */
class LibVlcView(context: Context) : FrameLayout(context), TextureView.SurfaceTextureListener,
  LifecycleEventListener, MediaController.MediaPlayerControl {
  companion object { private var active = WeakReference<LibVlcView>(null) }
  var onPlaybackEvent: ((String, Long) -> Unit)? = null
  private val content = FrameLayout(context)
  private val texture = TextureView(context)
  private val fullscreen = Button(context).apply { text = "全屏"; contentDescription = "全屏播放" }
  private val controls = MediaController(context)
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build())
    .setOnAudioFocusChangeListener { change -> if (change < 0) pause() }.build()
  private var engine: LibVLC? = null
  private var player: MediaPlayer? = null
  private var descriptor: ParcelFileDescriptor? = null
  private var source: String? = null
  private var firstFrame = false
  private var released = false
  private var wantedPlaying = true
  private var hostPaused = false
  private var dialog: Dialog? = null
  private var pendingPosition = 0L
  var initialPositionMs = 0L
  var configuredSource: String? = null

  init {
    setBackgroundColor(Color.BLACK)
    content.addView(texture, LayoutParams(-1, -1))
    content.addView(fullscreen, LayoutParams(-2, -2, Gravity.TOP or Gravity.END))
    addView(content, LayoutParams(-1, -1))
    texture.surfaceTextureListener = this
    controls.setMediaPlayer(this)
    controls.setAnchorView(content)
    texture.setOnClickListener { controls.show(5000) }
    fullscreen.setOnClickListener { toggleFullscreen() }
    (context as? ReactContext)?.addLifecycleEventListener(this)
  }

  fun setSource(value: String?) {
    if (released || value == source) return
    stopPlayer()
    source = value
    firstFrame = false
    pendingPosition = initialPositionMs.coerceAtLeast(0)
    if (value.isNullOrBlank()) return
    if (Uri.parse(value).scheme !in setOf("file", "content")) {
      onPlaybackEvent?.invoke("sourceUnavailable", 0)
      return
    }
    try {
      val lib = LibVLC(context.applicationContext, arrayListOf("--no-video-title-show", "--no-stats", "--avcodec-threads=2"))
      engine = lib
      val current = MediaPlayer(lib)
      player = current
      current.setEventListener { event ->
        if (released || player !== current) return@setEventListener
        when (event.type) {
          MediaPlayer.Event.Playing -> {
            if (pendingPosition > 0 && current.isSeekable) { current.setTime(pendingPosition, false); pendingPosition = 0 }
            onPlaybackEvent?.invoke("playing", current.time.coerceAtLeast(0))
          }
          MediaPlayer.Event.TimeChanged -> onPlaybackEvent?.invoke("progress", event.timeChanged.coerceAtLeast(0))
          MediaPlayer.Event.EndReached -> { wantedPlaying = false; keepScreenOn = false; audio.abandonAudioFocusRequest(focus); onPlaybackEvent?.invoke("ended", current.time.coerceAtLeast(0)); controls.show(0) }
          MediaPlayer.Event.EncounteredError -> { keepScreenOn = false; audio.abandonAudioFocusRequest(focus); onPlaybackEvent?.invoke("decodeFailed", current.time.coerceAtLeast(0)) }
        }
      }
      val uri = Uri.parse(value)
      val media = if (uri.scheme == "content") {
        descriptor = context.contentResolver.openFileDescriptor(uri, "r") ?: error("source unavailable")
        Media(lib, descriptor!!.fileDescriptor)
      } else Media(lib, uri)
      try {
        // Never retry the same platform decoder that caused the Media3 failure.
        media.setHWDecoderEnabled(false, false)
        current.media = media
      } finally { media.release() }
      texture.surfaceTexture?.let { attach(it, texture.width, texture.height) }
    } catch (_: Exception) { stopPlayer(); onPlaybackEvent?.invoke("sourceUnavailable", 0) }
  }

  private fun attach(surface: SurfaceTexture, width: Int, height: Int) {
    val current = player ?: return
    if (!current.vlcVout.areViewsAttached()) {
      current.vlcVout.setVideoSurface(surface)
      current.vlcVout.setWindowSize(width.coerceAtLeast(1), height.coerceAtLeast(1))
      current.vlcVout.attachViews()
    }
    if (wantedPlaying && !hostPaused) start()
  }

  override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) = attach(surface, width, height)
  override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) { player?.vlcVout?.setWindowSize(width, height) }
  override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
    player?.let { pendingPosition = it.time.coerceAtLeast(0); it.pause(); it.vlcVout.detachViews() }
    return true
  }
  override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {
    if (!firstFrame && player != null) { firstFrame = true; onPlaybackEvent?.invoke("firstFrame", player!!.time.coerceAtLeast(0)) }
  }

  private fun toggleFullscreen() {
    if (dialog != null) { dialog?.dismiss(); return }
    val activity = (context as? Activity) ?: (context as? ReactContext)?.currentActivity ?: return
    controls.hide()
    val window = Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
    dialog = window
    removeView(content)
    window.setContentView(content)
    fullscreen.text = "退出全屏"
    window.setOnDismissListener {
      (content.parent as? ViewGroup)?.removeView(content)
      if (!released) addView(content, LayoutParams(-1, -1))
      fullscreen.text = "全屏"
      dialog = null
    }
    window.show()
    window.window?.setLayout(-1, -1)
  }

  private fun stopPlayer() {
    controls.hide()
    val old = player
    player = null
    old?.setEventListener(null)
    old?.stop()
    old?.vlcVout?.detachViews()
    old?.release()
    descriptor?.close(); descriptor = null
    engine?.release(); engine = null
    if (active.get() === this) active.clear()
    keepScreenOn = false
    audio.abandonAudioFocusRequest(focus)
  }

  fun dispose() {
    if (released) return
    released = true
    onPlaybackEvent = null
    dialog?.dismiss()
    stopPlayer()
    (context as? ReactContext)?.removeLifecycleEventListener(this)
  }
  override fun onHostResume() { hostPaused = false; if (wantedPlaying && texture.isAvailable) start() }
  override fun onHostPause() { hostPaused = true; player?.pause(); keepScreenOn = false; audio.abandonAudioFocusRequest(focus); controls.hide() }
  override fun onHostDestroy() = dispose()
  override fun start() {
    wantedPlaying = true
    if (hostPaused || !texture.isAvailable) return
    if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return
    active.get()?.takeIf { it !== this }?.pause()
    active = WeakReference(this)
    player?.play(); keepScreenOn = true
  }
  override fun pause() { wantedPlaying = false; player?.pause(); keepScreenOn = false; audio.abandonAudioFocusRequest(focus) }
  override fun getDuration(): Int = (player?.length ?: 0L).coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
  override fun getCurrentPosition(): Int = (player?.time ?: 0L).coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
  override fun seekTo(position: Int) { player?.setTime(position.toLong().coerceAtLeast(0), false) }
  override fun isPlaying(): Boolean = player?.isPlaying == true
  override fun getBufferPercentage(): Int = 100
  override fun canPause(): Boolean = true
  override fun canSeekBackward(): Boolean = player?.isSeekable == true
  override fun canSeekForward(): Boolean = player?.isSeekable == true
  override fun getAudioSessionId(): Int = 0
}
