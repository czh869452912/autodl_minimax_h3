package com.example.autodlh3

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper

class TaskMonitorService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var session: String? = null
  private val tick = object : Runnable {
    override fun run() {
      val id = session ?: return
      if (!isCurrent(this@TaskMonitorService, id)) return
      try {
        startService(Intent(this@TaskMonitorService, TaskMonitorHeadlessService::class.java).putExtra(EXTRA_SESSION, id))
        handler.postDelayed(this, INTERVAL_MS)
      } catch (_: Exception) { finish(id, "headless-failed") }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences(PREFS, 0)
    val id = intent?.getStringExtra(EXTRA_SESSION) ?: prefs.getString(KEY_SESSION, null)
    try {
      val notifications = TaskNotificationManager(this)
      notifications.createChannels()
      startForeground(NOTIFICATION_ID, notifications.ongoing())
      // Complete the startForegroundService handshake even if stop/restart
      // invalidated this intent before Android delivered it.
      if (id == null || !isCurrent(this, id)) {
        if (!isRunning(this)) {
          handler.removeCallbacks(tick)
          stopForeground(STOP_FOREGROUND_REMOVE)
          stopSelf(startId)
        }
        return if (isRunning(this)) START_STICKY else START_NOT_STICKY
      }
      handler.removeCallbacks(tick)
      session = id
      instance = this
      activeSession = id
      prefs.edit().remove(KEY_REASON).apply()
      changed?.invoke()
      startCallbacks.remove(id)?.invoke(true)
      handler.post(tick)
      return START_STICKY
    } catch (_: Exception) {
      if (id != null && isCurrent(this, id)) {
        session = id
        finish(id, "start-failed")
        startCallbacks.remove(id)?.invoke(false)
      } else if (!isRunning(this)) { stopSelf(startId) }
      return START_NOT_STICKY
    }
  }

  fun finish(id: String, reason: String): Boolean {
    if (!isCurrent(this, id)) return false
    getSharedPreferences(PREFS, 0).edit().putBoolean(KEY_ENABLED, false).putString(KEY_REASON, reason).commit()
    handler.removeCallbacks(tick)
    activeSession = null
    changed?.invoke()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    return true
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    session?.let { finish(it, "timeout") }
    handler.removeCallbacks(tick)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    if (instance === this) { instance = null; activeSession = null; changed?.invoke() }
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val PREFS = "task_monitor"
    const val EXTRA_SESSION = "sessionId"
    const val KEY_SESSION = "session_id"
    const val KEY_ENABLED = "enabled"
    const val KEY_CURSOR = "event_cursor"
    const val KEY_REASON = "stop_reason"
    const val NOTIFICATION_ID = 7331
    const val INTERVAL_MS = 2 * 60 * 1000L
    @Volatile var activeSession: String? = null
    var instance: TaskMonitorService? = null
    var changed: (() -> Unit)? = null
    val startCallbacks = mutableMapOf<String, (Boolean) -> Unit>()
    fun isRunning(context: Context): Boolean = activeSession?.let { isCurrent(context, it) } ?: false
    fun isCurrent(context: Context, sessionId: String): Boolean {
      val prefs = context.getSharedPreferences(PREFS, 0)
      return prefs.getBoolean(KEY_ENABLED, false) && prefs.getString(KEY_SESSION, null) == sessionId
    }
  }
}
