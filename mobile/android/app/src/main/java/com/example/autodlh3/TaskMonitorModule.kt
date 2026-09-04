package com.example.autodlh3

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class TaskMonitorModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), PermissionListener {
  private var permissionPromise: Promise? = null
  override fun getName() = "AutoDLTaskMonitor"

  @ReactMethod
  fun requestNotificationPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
      promise.resolve(true)
      return
    }
    synchronized(this) {
      if (permissionPromise != null) {
        promise.reject("NOTIFICATION_PERMISSION_PENDING", "通知权限请求正在进行")
        return
      }
      val activity = context.currentActivity as? PermissionAwareActivity
      if (activity == null) {
        promise.reject("NOTIFICATION_PERMISSION_ACTIVITY_MISSING", "无法请求通知权限")
        return
      }
      permissionPromise = promise
      activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), PERMISSION_REQUEST_CODE, this)
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray): Boolean {
    if (requestCode != PERMISSION_REQUEST_CODE) return false
    val pending = synchronized(this) { permissionPromise.also { permissionPromise = null } }
    pending?.resolve(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
    return true
  }

  @ReactMethod
  fun start(taskIds: ReadableArray, promise: Promise) {
    val ids = (0 until taskIds.size()).mapNotNull { taskIds.getString(it)?.trim()?.takeIf(String::isNotBlank) }.distinct()
    if (ids.isEmpty()) { promise.reject("NO_ACTIVE_TASKS", "没有可监控任务"); return }
    try {
      val intent = Intent(context, TaskMonitorService::class.java).putStringArrayListExtra(TaskMonitorService.EXTRA_TASK_IDS, ArrayList(ids))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("TASK_MONITOR_START_FAILED", error.message, error) }
  }

  @ReactMethod
  fun stop(promise: Promise) { context.stopService(Intent(context, TaskMonitorService::class.java)); promise.resolve(null) }

  @ReactMethod
  fun publishTerminalEvents(events: ReadableArray, promise: Promise) {
    try {
      val parsed = (0 until events.size()).mapNotNull { index ->
        val value = events.getMap(index) ?: return@mapNotNull null
        val eventId = value.getString("eventId")?.trim().orEmpty()
        val taskId = value.getString("taskId")?.trim().orEmpty()
        val status = value.getString("status")?.trim().orEmpty()
        if (eventId.isBlank() || taskId.isBlank()) null else TaskTerminalEvent(eventId, taskId, status)
      }
      promise.resolve(TaskNotificationManager(context).publish(parsed))
    } catch (error: Exception) { promise.reject("TASK_NOTIFICATION_FAILED", error.message, error) }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getStatus(): com.facebook.react.bridge.WritableMap {
    val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
    return Arguments.createMap().apply {
      putBoolean("running", prefs.getBoolean(TaskMonitorService.KEY_RUNNING, false))
      val ids = prefs.getStringSet(TaskMonitorService.KEY_TASK_IDS, emptySet())?.toList()?.sorted() ?: emptyList()
      putArray("taskIds", Arguments.fromList(ids))
    }
  }

  companion object { private const val PERMISSION_REQUEST_CODE = 7332 }
}
