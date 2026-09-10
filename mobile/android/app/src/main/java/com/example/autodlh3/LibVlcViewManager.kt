package com.example.autodlh3

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event

class LibVlcViewManager : SimpleViewManager<LibVlcView>() {
  override fun getName() = "AutoDLLibVlcView"
  override fun createViewInstance(context: ThemedReactContext) = LibVlcView(context).apply {
    onPlaybackEvent = { status, position ->
      val data = Arguments.createMap().apply { putString("status", status); putDouble("positionMs", position.toDouble()) }
      UIManagerHelper.getEventDispatcherForReactTag(context, id)?.dispatchEvent(PlaybackEvent(UIManagerHelper.getSurfaceId(this), id, data))
    }
  }
  @ReactProp(name = "source") fun source(view: LibVlcView, source: String?) { view.configuredSource = source }
  override fun onAfterUpdateTransaction(view: LibVlcView) { super.onAfterUpdateTransaction(view); view.setSource(view.configuredSource) }
  @ReactProp(name = "initialPositionMs", defaultDouble = 0.0)
  fun position(view: LibVlcView, position: Double) { view.initialPositionMs = if (position.isFinite()) position.toLong().coerceAtLeast(0) else 0 }
  override fun onDropViewInstance(view: LibVlcView) { view.dispose(); super.onDropViewInstance(view) }
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    mutableMapOf("topPlayback" to mapOf("registrationName" to "onPlayback"))
  private class PlaybackEvent(surface: Int, tag: Int, private val data: WritableMap) : Event<PlaybackEvent>(surface, tag) {
    override fun getEventName() = "topPlayback"
    override fun getEventData(): WritableMap = data
    override fun canCoalesce() = false
  }
}
