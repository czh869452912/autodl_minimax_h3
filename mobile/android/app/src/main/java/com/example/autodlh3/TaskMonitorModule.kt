package com.example.autodlh3

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID
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
  private val main = Handler(Looper.getMainLooper())
  private val statusChanged: () -> Unit = {
    // A disappearing React instance must not turn successful service work into a failure.
    runCatching { if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AutoDLTaskMonitorStatus", getStatus()) }
    Unit
  }
  private var permissionPromise: Promise? = null
  override fun getName() = "AutoDLTaskMonitor"
  override fun initialize() { super.initialize(); TaskMonitorService.changed = statusChanged }
  override fun invalidate() {
    if (TaskMonitorService.changed === statusChanged) TaskMonitorService.changed = null
    permissionPromise?.reject("NOTIFICATION_PERMISSION_CANCELLED", "通知权限请求已结束")
    permissionPromise = null
    super.invalidate()
  }
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Double) = Unit

  @ReactMethod
  fun requestNotificationPermission(promise: Promise) {
    main.post { requestPermissionOnMain(promise) }
  }

  private fun requestPermissionOnMain(promise: Promise) {
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
  fun start(cursor: Double, promise: Promise) {
    if (!cursor.isFinite() || cursor < 0 || cursor % 1.0 != 0.0) { promise.reject("MONITOR_CURSOR_INVALID", "监控游标无效"); return }
    main.post {
      val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
      prefs.getString(TaskMonitorService.KEY_SESSION, null)?.let { TaskMonitorService.startCallbacks.remove(it)?.invoke(false) }
      val id = UUID.randomUUID().toString()
      if (!prefs.edit().putString(TaskMonitorService.KEY_SESSION, id).putBoolean(TaskMonitorService.KEY_ENABLED, true)
          .putLong(TaskMonitorService.KEY_CURSOR, cursor.toLong()).remove(TaskMonitorService.KEY_REASON).commit()) {
        promise.reject("TASK_MONITOR_START_FAILED", "无法保存监控状态"); return@post
      }
      TaskMonitorService.startCallbacks[id] = { success ->
        if (success) promise.resolve(getStatus()) else promise.reject("TASK_MONITOR_START_FAILED", "持续监控未能启动")
      }
      try {
        val intent = Intent(context, TaskMonitorService::class.java).putExtra(TaskMonitorService.EXTRA_SESSION, id)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        main.postDelayed({
          if (TaskMonitorService.startCallbacks.containsKey(id)) {
            stopSessionOnMain(id, "start-failed")
            TaskMonitorService.startCallbacks.remove(id)?.invoke(false)
          }
        }, 8000)
      } catch (_: Exception) {
        stopSessionOnMain(id, "start-failed")
        TaskMonitorService.startCallbacks.remove(id)?.invoke(false)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) { main.post {
    val id = context.getSharedPreferences(TaskMonitorService.PREFS, 0).getString(TaskMonitorService.KEY_SESSION, null)
    promise.resolve(id != null && stopSessionOnMain(id, "user"))
  } }

  @ReactMethod
  fun stopSession(sessionId: String, promise: Promise) { main.post { promise.resolve(stopSessionOnMain(sessionId, "complete")) } }

  private fun stopSessionOnMain(id: String, reason: String): Boolean {
    if (!TaskMonitorService.isCurrent(context, id)) return false
    val service = TaskMonitorService.instance
    if (service != null && TaskMonitorService.activeSession == id) return service.finish(id, reason)
    context.getSharedPreferences(TaskMonitorService.PREFS, 0).edit().putBoolean(TaskMonitorService.KEY_ENABLED, false).putString(TaskMonitorService.KEY_REASON, reason).commit()
    context.stopService(Intent(context, TaskMonitorService::class.java))
    TaskMonitorService.activeSession = null
    TaskMonitorService.startCallbacks.remove(id)?.invoke(false)
    statusChanged()
    return true
  }

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

  @ReactMethod
  fun publishSessionEvents(sessionId: String, cursor: Double, events: ReadableArray, promise: Promise) { main.post {
    if (!TaskMonitorService.isCurrent(context, sessionId) || TaskMonitorService.activeSession != sessionId) { promise.resolve(false); return@post }
    try {
      val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
      val previous = prefs.getLong(TaskMonitorService.KEY_CURSOR, 0)
      if (!cursor.isFinite() || cursor <= previous || cursor % 1.0 != 0.0) { promise.resolve(false); return@post }
      val parsed = (0 until events.size()).mapNotNull { index -> events.getMap(index)?.let { value ->
        val eventId = value.getString("eventId").orEmpty()
        val taskId = value.getString("taskId").orEmpty()
        if (eventId.isBlank() || taskId.isBlank()) null else TaskTerminalEvent(eventId, taskId, value.getString("status").orEmpty())
      } }
      if (NotificationManagerCompat.from(context).areNotificationsEnabled()) TaskNotificationManager(context).publish(parsed)
      check(prefs.edit().putLong(TaskMonitorService.KEY_CURSOR, cursor.toLong()).commit())
      promise.resolve(true)
    } catch (_: Exception) { promise.reject("TASK_NOTIFICATION_FAILED", "任务通知未完成") }
  } }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getStatus(): com.facebook.react.bridge.WritableMap {
    val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
    return Arguments.createMap().apply {
      val id = prefs.getString(TaskMonitorService.KEY_SESSION, null)
      val enabled = prefs.getBoolean(TaskMonitorService.KEY_ENABLED, false)
      putBoolean("running", TaskMonitorService.isRunning(context))
      putBoolean("enabled", enabled)
      putString("sessionId", id)
      putDouble("cursor", prefs.getLong(TaskMonitorService.KEY_CURSOR, 0).toDouble())
      putBoolean("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled())
      putString("stopReason", prefs.getString(TaskMonitorService.KEY_REASON, null))
      putArray("taskIds", Arguments.createArray())
    }
  }

  companion object { private const val PERMISSION_REQUEST_CODE = 7332 }
}
