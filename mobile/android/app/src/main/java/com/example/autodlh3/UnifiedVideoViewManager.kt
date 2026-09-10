package com.example.autodlh3

import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event

class UnifiedVideoViewManager : SimpleViewManager<UnifiedVideoView>() {
  override fun getName() = "AutoDLVideoView"
  override fun createViewInstance(context: ThemedReactContext) = UnifiedVideoView(context).apply {
    onPlaybackEvent = { status, position ->
      val payload = Arguments.createMap().apply {
        putString("status", status)
        putDouble("positionMs", position.toDouble())
        putString("source", eventSource ?: configuredSource)
        putInt("retryToken", eventRetryToken)
      }
      UIManagerHelper.getEventDispatcher(context)?.dispatchEvent(object : Event<Nothing>(UIManagerHelper.getSurfaceId(context), id) {
        override fun getEventName() = "topPlayback"
        override fun getEventData() = payload
        override fun canCoalesce() = false
      })
    }
  }
  @ReactProp(name = "source") fun source(view: UnifiedVideoView, value: String?) { view.configuredSource = value }
  @ReactProp(name = "decodeMode") fun mode(view: UnifiedVideoView, value: String?) {
    view.configuredDecodeMode = value?.takeIf { it in setOf("auto", "hardware", "software") } ?: "auto"
  }
  @ReactProp(name = "retryToken", defaultInt = 0) fun retry(view: UnifiedVideoView, value: Int) { view.configuredRetryToken = value }
  override fun onAfterUpdateTransaction(view: UnifiedVideoView) { super.onAfterUpdateTransaction(view); view.applyConfiguration() }
  override fun onDropViewInstance(view: UnifiedVideoView) { view.dispose(); super.onDropViewInstance(view) }
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    mutableMapOf("topPlayback" to mapOf("registrationName" to "onPlayback"))
}
