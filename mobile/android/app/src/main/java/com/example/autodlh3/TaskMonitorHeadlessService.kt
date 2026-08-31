package com.example.autodlh3

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class TaskMonitorHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig = HeadlessJsTaskConfig(
    "AutoDLTaskMonitor",
    com.facebook.react.bridge.Arguments.createMap(),
    90_000,
    true,
  )
}
