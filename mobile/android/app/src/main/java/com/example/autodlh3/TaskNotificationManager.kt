package com.example.autodlh3

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray

data class TaskTerminalEvent(val eventId: String, val taskId: String, val status: String)

interface NotificationHistory {
  fun read(): List<String>
  fun write(eventIds: List<String>)
}

class TaskNotificationPolicy(
  private val history: NotificationHistory,
  private val notifier: (TaskTerminalEvent, String, String) -> Unit,
) {
  @Synchronized
  fun publish(events: List<TaskTerminalEvent>): Int {
    val known = LinkedHashSet(history.read())
    var published = 0
    for (event in events) {
      if (event.eventId.isBlank() || event.taskId.isBlank() || event.eventId in known) continue
      val copy = copyFor(event.status) ?: continue
      known += event.eventId
      while (known.size > MAX_HISTORY) known.remove(known.first())
      history.write(known.toList())
      notifier(event, copy.first, copy.second)
      published += 1
    }
    return published
  }

  companion object {
    private const val MAX_HISTORY = 256
    fun monitorText(taskCount: Int) = "正在监控 ${taskCount.coerceAtLeast(0)} 个任务"
    private fun copyFor(status: String): Pair<String, String>? = when (status) {
      "SUCCESS" -> "任务已完成" to "视频生成任务已成功完成"
      "PARTIAL_SUCCESS" -> "任务部分完成" to "视频生成任务已有部分结果"
      "FAILED" -> "任务失败" to "视频生成任务未能完成"
      "CANCELLED" -> "任务已取消" to "视频生成任务已取消"
      else -> null
    }
  }
}

class TaskNotificationManager(private val context: Context) {
  private val notifications = context.getSystemService(NotificationManager::class.java)
  private val history = object : NotificationHistory {
    private val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
    override fun read(): List<String> {
      val raw = prefs.getString(KEY_NOTIFIED_EVENTS, "[]") ?: "[]"
      return runCatching {
        val json = JSONArray(raw)
        (0 until json.length()).mapNotNull { json.optString(it).takeIf(String::isNotBlank) }
      }.getOrDefault(emptyList())
    }
    override fun write(eventIds: List<String>) {
      prefs.edit().putString(KEY_NOTIFIED_EVENTS, JSONArray(eventIds).toString()).commit()
    }
  }
  private val policy = TaskNotificationPolicy(history) { event, title, body ->
    notifications.notify(event.eventId.hashCode(), resultNotification(event, title, body))
  }

  fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    notifications.createNotificationChannels(listOf(
      NotificationChannel(MONITOR_CHANNEL_ID, "任务持续监控", NotificationManager.IMPORTANCE_LOW),
      NotificationChannel(RESULT_CHANNEL_ID, "任务结果", NotificationManager.IMPORTANCE_DEFAULT),
    ))
  }

  fun ongoing(taskCount: Int): Notification = NotificationCompat.Builder(context, MONITOR_CHANNEL_ID)
    .setSmallIcon(android.R.drawable.stat_notify_sync)
    .setContentTitle("AutoDL H3")
    .setContentText(TaskNotificationPolicy.monitorText(taskCount))
    .setOngoing(true)
    .setContentIntent(tasksIntent(MONITOR_REQUEST_CODE))
    .build()

  fun publish(events: List<TaskTerminalEvent>): Int {
    createChannels()
    return policy.publish(events)
  }

  private fun resultNotification(event: TaskTerminalEvent, title: String, body: String): Notification =
    NotificationCompat.Builder(context, RESULT_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download_done)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(tasksIntent(event.eventId.hashCode()))
      .build()

  private fun tasksIntent(requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("autodlh3://tasks"), context, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  companion object {
    const val MONITOR_CHANNEL_ID = "task-monitor"
    const val RESULT_CHANNEL_ID = "task-results"
    private const val KEY_NOTIFIED_EVENTS = "notified_event_ids"
    private const val MONITOR_REQUEST_CODE = 7331
  }
}
