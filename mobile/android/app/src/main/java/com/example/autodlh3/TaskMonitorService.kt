package com.example.autodlh3

import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

class TaskMonitorService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var taskNotifications: TaskNotificationManager
  private val tick = object : Runnable { override fun run() { triggerHeadless(); handler.postDelayed(this, INTERVAL_MS) } }
  override fun onCreate() { super.onCreate(); taskNotifications = TaskNotificationManager(this); taskNotifications.createChannels(); startForeground(NOTIFICATION_ID, taskNotifications.ongoing(0)) }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val ids = intent?.getStringArrayListExtra(EXTRA_TASK_IDS)
    if (!ids.isNullOrEmpty()) {
      getSharedPreferences(PREFS, 0).edit().putStringSet(KEY_TASK_IDS, ids.toSet()).putBoolean(KEY_RUNNING, true).apply()
      getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, taskNotifications.ongoing(ids.distinct().size))
    }
    handler.removeCallbacks(tick); handler.post(tick)
    return START_STICKY
  }
  override fun onDestroy() { handler.removeCallbacks(tick); getSharedPreferences(PREFS, 0).edit().putBoolean(KEY_RUNNING, false).apply(); super.onDestroy() }
  override fun onBind(intent: Intent?): IBinder? = null
  private fun triggerHeadless() {
    val ids = getSharedPreferences(PREFS, 0).getStringSet(KEY_TASK_IDS, emptySet())?.toList() ?: emptyList()
    startService(Intent(this, TaskMonitorHeadlessService::class.java).putStringArrayListExtra(EXTRA_TASK_IDS, ArrayList(ids)))
  }
  companion object { const val EXTRA_TASK_IDS = "taskIds"; const val PREFS = "task_monitor"; const val KEY_TASK_IDS = "task_ids"; const val KEY_RUNNING = "running"; const val NOTIFICATION_ID = 7331; const val INTERVAL_MS = 2 * 60 * 1000L }
}
