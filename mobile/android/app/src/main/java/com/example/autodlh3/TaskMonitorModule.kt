package com.example.autodlh3

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class TaskMonitorModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "AutoDLTaskMonitor"

  @ReactMethod
  fun start(taskIds: com.facebook.react.bridge.ReadableArray) {
    val ids = (0 until taskIds.size()).mapNotNull { taskIds.getString(it)?.takeIf(String::isNotBlank) }
    if (ids.isEmpty()) return
    val intent = Intent(context, TaskMonitorService::class.java).putStringArrayListExtra(TaskMonitorService.EXTRA_TASK_IDS, ArrayList(ids))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
  }

  @ReactMethod
  fun stop() { context.stopService(Intent(context, TaskMonitorService::class.java)) }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getStatus(): com.facebook.react.bridge.WritableMap {
    val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
    return Arguments.createMap().apply {
      putBoolean("running", prefs.getBoolean(TaskMonitorService.KEY_RUNNING, false))
      val ids = prefs.getStringSet(TaskMonitorService.KEY_TASK_IDS, emptySet())?.toList() ?: emptyList<String>()
      putArray("taskIds", Arguments.fromList(ids))
    }
  }
}
