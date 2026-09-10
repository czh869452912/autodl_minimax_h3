package com.example.autodlh3

import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.TextureView

/** Owns only surfaces it creates. Changing output never changes the mpv source. */
internal class MpvVideoOutput(
  private val surfaceChanged: (Surface?, Int, Int) -> Unit,
  private val frameRendered: () -> Unit,
) : TextureView.SurfaceTextureListener, SurfaceHolder.Callback {
  private var output: Any? = null
  private var ownedSurface: Surface? = null

  fun set(value: Any) {
    if (output === value) return
    clear()
    output = value
    when (value) {
      is TextureView -> {
        value.surfaceTextureListener = this
        if (value.isAvailable) value.surfaceTexture?.let {
          onSurfaceTextureAvailable(it, value.width, value.height)
        }
      }
      is SurfaceView -> {
        value.holder.addCallback(this)
        attachHolder(value.holder)
      }
      is SurfaceHolder -> {
        value.addCallback(this)
        attachHolder(value)
      }
      is Surface -> surfaceChanged(value.takeIf { it.isValid }, 0, 0)
    }
  }

  fun clear(value: Any? = null) {
    if (value != null && value !== output) return
    when (val old = output) {
      is TextureView -> if (old.surfaceTextureListener === this) old.surfaceTextureListener = null
      is SurfaceView -> old.holder.removeCallback(this)
      is SurfaceHolder -> old.removeCallback(this)
    }
    output = null
    surfaceChanged(null, 0, 0)
    ownedSurface?.release()
    ownedSurface = null
  }

  private fun attachHolder(holder: SurfaceHolder) {
    val frame = holder.surfaceFrame
    surfaceChanged(holder.surface.takeIf { it.isValid }, frame.width(), frame.height())
  }

  override fun surfaceCreated(holder: SurfaceHolder) = attachHolder(holder)
  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = attachHolder(holder)
  override fun surfaceDestroyed(holder: SurfaceHolder) = surfaceChanged(null, 0, 0)

  override fun onSurfaceTextureAvailable(texture: SurfaceTexture, width: Int, height: Int) {
    ownedSurface?.release()
    ownedSurface = Surface(texture)
    surfaceChanged(ownedSurface, width, height)
  }

  override fun onSurfaceTextureSizeChanged(texture: SurfaceTexture, width: Int, height: Int) =
    surfaceChanged(ownedSurface, width, height)

  override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
    surfaceChanged(null, 0, 0)
    ownedSurface?.release()
    ownedSurface = null
    return true
  }

  override fun onSurfaceTextureUpdated(texture: SurfaceTexture) = frameRendered()
}
