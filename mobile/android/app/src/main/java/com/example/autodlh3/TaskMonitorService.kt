package com.example.autodlh3

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

class TaskMonitorService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val tick = object : Runnable { override fun run() { triggerHeadless(); handler.postDelayed(this, INTERVAL_MS) } }
  override fun onCreate() { super.onCreate(); createChannel(); startForeground(NOTIFICATION_ID, notification("正在监控任务…")) }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val ids = intent?.getStringArrayListExtra(EXTRA_TASK_IDS)
    if (!ids.isNullOrEmpty()) getSharedPreferences(PREFS, 0).edit().putStringSet(KEY_TASK_IDS, ids.toSet()).putBoolean(KEY_RUNNING, true).apply()
    handler.removeCallbacks(tick); handler.post(tick)
    return START_STICKY
  }
  override fun onDestroy() { handler.removeCallbacks(tick); getSharedPreferences(PREFS, 0).edit().putBoolean(KEY_RUNNING, false).apply(); super.onDestroy() }
  override fun onBind(intent: Intent?): IBinder? = null
  private fun triggerHeadless() {
    val ids = getSharedPreferences(PREFS, 0).getStringSet(KEY_TASK_IDS, emptySet())?.toList() ?: emptyList()
    startService(Intent(this, TaskMonitorHeadlessService::class.java).putStringArrayListExtra(EXTRA_TASK_IDS, ArrayList(ids)))
  }
  private fun createChannel() { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL_ID, "任务持续监控", NotificationManager.IMPORTANCE_LOW)) }
  private fun notification(text: String): Notification = NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("AutoDL H3").setContentText(text).setOngoing(true).setContentIntent(PendingIntent.getActivity(this, 0, packageManager.getLaunchIntentForPackage(packageName), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build()
  companion object { const val EXTRA_TASK_IDS = "taskIds"; const val PREFS = "task_monitor"; const val KEY_TASK_IDS = "task_ids"; const val KEY_RUNNING = "running"; const val CHANNEL_ID = "task-monitor"; const val NOTIFICATION_ID = 7331; const val INTERVAL_MS = 2 * 60 * 1000L }
}
