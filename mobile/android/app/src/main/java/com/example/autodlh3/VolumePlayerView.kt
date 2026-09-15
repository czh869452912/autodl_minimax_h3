package com.example.autodlh3

import android.content.Context
import android.graphics.Rect
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.Gravity
import android.view.View
import android.widget.ImageButton
import android.widget.SeekBar
import android.widget.TextView
import androidx.media3.common.Player
import androidx.media3.ui.PlayerView
import kotlin.math.roundToInt

/** Volume controls live inside Media3's controller, including in its fullscreen host. */
class VolumePlayerView(context: Context, attrs: AttributeSet?) : PlayerView(context, attrs) {
  private val volumeButton = findViewById<ImageButton>(R.id.player_volume_button)
  private val volumePanel = findViewById<View>(R.id.player_volume_panel)
  private val volumeSlider = findViewById<SeekBar>(R.id.player_volume_slider)
  private val volumeValue = findViewById<TextView>(R.id.player_volume_value)
  private var lastAudibleVolume = 1f
  private var savedVolume = 1f
  private var savedTimeout: Int? = null
  private val collapse = Runnable { closeVolumePanel() }
  private val volumeListener = object : Player.Listener {
    override fun onVolumeChanged(volume: Float) = refreshVolume()
    override fun onAvailableCommandsChanged(commands: Player.Commands) = refreshVolume()
  }

  init {
    volumeButton.tooltipText = context.getString(R.string.player_volume_hint)
    volumeButton.setOnClickListener {
      player?.takeIf { it.isCommandAvailable(Player.COMMAND_SET_VOLUME) }?.let {
        it.volume = if (it.volume > 0f) 0f else lastAudibleVolume
        refreshVolume()
      }
      showController()
    }
    volumeButton.setOnLongClickListener {
      if (volumePanel.visibility == View.VISIBLE) closeVolumePanel() else {
        volumePanel.visibility = View.VISIBLE
        showController()
        scheduleCollapse()
      }
      true
    }
    volumeSlider.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
      override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
        if (fromUser) {
          player?.takeIf { it.isCommandAvailable(Player.COMMAND_SET_VOLUME) }?.volume = progress / 100f
          refreshVolume()
          scheduleCollapse()
        }
      }
      override fun onStartTrackingTouch(bar: SeekBar) {
        removeCallbacks(collapse)
        savedTimeout = controllerShowTimeoutMs
        controllerShowTimeoutMs = 0
        parent?.requestDisallowInterceptTouchEvent(true)
        showController()
      }
      override fun onStopTrackingTouch(bar: SeekBar) {
        restoreTimeout()
        parent?.requestDisallowInterceptTouchEvent(false)
        showController()
        scheduleCollapse()
      }
    })
    setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
      if (visibility != View.VISIBLE) closeVolumePanel()
    })
    refreshVolume()
  }

  override fun setPlayer(player: Player?) {
    getPlayer()?.removeListener(volumeListener)
    closeVolumePanel()
    super.setPlayer(player)
    player?.addListener(volumeListener)
    if (player?.isCommandAvailable(Player.COMMAND_SET_VOLUME) == true) player.volume = savedVolume
    refreshVolume()
  }

  private fun refreshVolume() {
    val current = player
    val enabled = current?.isCommandAvailable(Player.COMMAND_GET_VOLUME) == true &&
      current.isCommandAvailable(Player.COMMAND_SET_VOLUME)
    volumeButton.isEnabled = enabled
    volumeButton.alpha = if (enabled) 1f else 0.4f
    volumeSlider.isEnabled = enabled
    val volume = if (enabled) current!!.volume else savedVolume
    savedVolume = volume
    if (volume > 0f) lastAudibleVolume = volume
    volumeButton.setImageResource(if (volume == 0f) R.drawable.ic_player_volume_off else R.drawable.ic_player_volume)
    volumeButton.contentDescription = context.getString(if (volume == 0f) R.string.player_unmute else R.string.player_mute)
    volumeSlider.progress = (volume * 100).roundToInt()
    volumeValue.text = "${volumeSlider.progress}%"
  }

  private fun scheduleCollapse() {
    removeCallbacks(collapse)
    if (savedTimeout == null) postDelayed(collapse, 3000)
  }

  private fun restoreTimeout() {
    savedTimeout?.let { controllerShowTimeoutMs = it }
    savedTimeout = null
  }

  private fun closeVolumePanel() {
    removeCallbacks(collapse)
    volumePanel.visibility = View.GONE
    restoreTimeout()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    val density = resources.displayMetrics.density
    // In short inline players the space above the timeline overlaps the central
    // play button. Use the top corner there, and the bottom corner in fullscreen.
    val compact = h < 300 * density
    val params = volumePanel.layoutParams as android.widget.FrameLayout.LayoutParams
    params.width = minOf((220 * density).toInt(), (w - 24 * density).toInt().coerceAtLeast(0))
    params.gravity = Gravity.END or if (compact) Gravity.TOP else Gravity.BOTTOM
    params.topMargin = if (compact) (8 * density).toInt() else 0
    params.bottomMargin = if (compact) 0 else (64 * density).toInt()
    volumePanel.layoutParams = params
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN && volumePanel.visibility == View.VISIBLE) {
      val panelBounds = Rect()
      val buttonBounds = Rect()
      volumePanel.getGlobalVisibleRect(panelBounds)
      volumeButton.getGlobalVisibleRect(buttonBounds)
      if (!panelBounds.contains(event.rawX.toInt(), event.rawY.toInt()) &&
          !buttonBounds.contains(event.rawX.toInt(), event.rawY.toInt())) closeVolumePanel()
    }
    return super.dispatchTouchEvent(event)
  }

  override fun onDetachedFromWindow() {
    closeVolumePanel()
    super.onDetachedFromWindow()
  }
}
