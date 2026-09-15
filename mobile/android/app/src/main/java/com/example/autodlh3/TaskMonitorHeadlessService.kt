package com.example.autodlh3

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class TaskMonitorHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    val data = com.facebook.react.bridge.Arguments.createMap().apply {
      putString("sessionId", intent?.getStringExtra(TaskMonitorService.EXTRA_SESSION))
    }
    return HeadlessJsTaskConfig("AutoDLTaskMonitor", data, 90_000, true)
  }
}
