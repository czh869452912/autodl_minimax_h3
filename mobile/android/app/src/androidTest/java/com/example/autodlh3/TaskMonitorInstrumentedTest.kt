package com.example.autodlh3

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TaskMonitorInstrumentedTest {
  @Test fun lifecycleRestoresStickySessionFencesOldCallbacksAndStopsOnTimeout() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = ApplicationProvider.getApplicationContext<Context>()
    val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
    val id = "test-${UUID.randomUUID()}"
    val done = CountDownLatch(1)
    val failure = AtomicReference<Throwable>()
    try {
      instrumentation.runOnMainSync {
        prefs.edit().putString(TaskMonitorService.KEY_SESSION, id).putBoolean(TaskMonitorService.KEY_ENABLED, true).putLong(TaskMonitorService.KEY_CURSOR, 42).commit()
        TaskMonitorService.startCallbacks[id] = { started ->
          try {
            assertTrue(started)
            val service = TaskMonitorService.instance!!
            assertTrue(TaskMonitorService.isRunning(context))
            assertFalse(service.finish("old-session", "complete"))
            assertTrue(TaskMonitorService.isRunning(context))
            // A delayed old start must complete the foreground handshake without
            // stopping the newer session or changing its durable cursor.
            assertEquals(android.app.Service.START_STICKY, service.onStartCommand(
              Intent(context, TaskMonitorService::class.java).putExtra(TaskMonitorService.EXTRA_SESSION, "old-session"), 0, 2))
            assertEquals(id, TaskMonitorService.activeSession)
            assertTrue(TaskMonitorService.isRunning(context))
            // Exercise the null-intent START_STICKY entry with the durable cursor.
            service.onStartCommand(null, 0, 2)
            assertEquals(42L, prefs.getLong(TaskMonitorService.KEY_CURSOR, 0))
            if (Build.VERSION.SDK_INT >= 35) {
              service.onTimeout(2, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
              assertEquals("timeout", prefs.getString(TaskMonitorService.KEY_REASON, null))
            } else { assertTrue(service.finish(id, "user")) }
            assertFalse(TaskMonitorService.isRunning(context))
            assertFalse(TaskMonitorService.isCurrent(context, id))
          } catch (error: Throwable) { failure.set(error) }
          finally { done.countDown() }
        }
        context.startForegroundService(Intent(context, TaskMonitorService::class.java).putExtra(TaskMonitorService.EXTRA_SESSION, id))
      }
      assertTrue("service start timed out", done.await(10, TimeUnit.SECONDS))
      failure.get()?.let { throw it }
    } finally {
      instrumentation.runOnMainSync {
        TaskMonitorService.startCallbacks.remove(id)
        context.stopService(Intent(context, TaskMonitorService::class.java))
        prefs.edit().putBoolean(TaskMonitorService.KEY_ENABLED, false).apply()
        activity.finish()
      }
    }
  }

  @Test fun invalidatedForegroundStartStopsWithoutActivatingASession() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = ApplicationProvider.getApplicationContext<Context>()
    val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
    try {
      instrumentation.runOnMainSync {
        prefs.edit().putString(TaskMonitorService.KEY_SESSION, "expired").putBoolean(TaskMonitorService.KEY_ENABLED, false).commit()
        context.startForegroundService(Intent(context, TaskMonitorService::class.java).putExtra(TaskMonitorService.EXTRA_SESSION, "expired"))
      }
      // Remain alive beyond the foreground handshake deadline; an invalid
      // session must not activate or leave the service running.
      android.os.SystemClock.sleep(6000)
      instrumentation.waitForIdleSync()
      assertFalse(TaskMonitorService.isRunning(context))
      assertNull(TaskMonitorService.instance)
      assertFalse(prefs.getBoolean(TaskMonitorService.KEY_ENABLED, true))
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
      @Suppress("DEPRECATION")
      assertFalse(manager.getRunningServices(Int.MAX_VALUE).any { it.service.className == TaskMonitorService::class.java.name })
    } finally {
      instrumentation.runOnMainSync {
        context.stopService(Intent(context, TaskMonitorService::class.java))
        activity.finish()
      }
    }
  }

  @Test fun persistedIntentAloneDoesNotClaimTheServiceIsRunning() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val prefs = context.getSharedPreferences(TaskMonitorService.PREFS, 0)
    val oldId = prefs.getString(TaskMonitorService.KEY_SESSION, null)
    val oldEnabled = prefs.getBoolean(TaskMonitorService.KEY_ENABLED, false)
    try {
      prefs.edit().putString(TaskMonitorService.KEY_SESSION, "dead-process").putBoolean(TaskMonitorService.KEY_ENABLED, true).commit()
      assertFalse(TaskMonitorService.isRunning(context))
    } finally { prefs.edit().putString(TaskMonitorService.KEY_SESSION, oldId).putBoolean(TaskMonitorService.KEY_ENABLED, oldEnabled).commit() }
  }
}
