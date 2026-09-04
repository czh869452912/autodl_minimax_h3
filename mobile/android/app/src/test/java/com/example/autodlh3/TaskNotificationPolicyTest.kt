package com.example.autodlh3

import java.util.Collections
import java.util.concurrent.CountDownLatch
import kotlin.concurrent.thread
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private class MemoryNotificationHistory : NotificationHistory {
  var ids = emptyList<String>()
  override fun read(): List<String> = ids
  override fun write(eventIds: List<String>) { ids = eventIds }
}

class TaskNotificationPolicyTest {
  @Test fun atomicallyDeduplicatesEventIdsAndKeepsTheNewest256() {
    val history = MemoryNotificationHistory()
    val published = Collections.synchronizedList(mutableListOf<String>())
    val policy = TaskNotificationPolicy(history) { event, _, _ -> published += event.eventId }
    val start = CountDownLatch(1)
    val workers = (1..8).map { thread { start.await(); policy.publish(listOf(TaskTerminalEvent("same", "task", "SUCCESS"))) } }
    start.countDown(); workers.forEach(Thread::join)
    assertEquals(listOf("same"), published)

    policy.publish((0..300).map { TaskTerminalEvent("event-$it", "task", "FAILED") })
    assertEquals(256, history.ids.size)
    assertEquals("event-45", history.ids.first())
    assertEquals("event-300", history.ids.last())
  }

  @Test fun mapsTerminalStatusesToDistinctSafeTitles() {
    val history = MemoryNotificationHistory()
    val titles = mutableListOf<String>()
    val policy = TaskNotificationPolicy(history) { _, title, _ -> titles += title }
    policy.publish(listOf(
      TaskTerminalEvent("1", "a", "SUCCESS"),
      TaskTerminalEvent("2", "b", "PARTIAL_SUCCESS"),
      TaskTerminalEvent("3", "c", "FAILED"),
      TaskTerminalEvent("4", "d", "CANCELLED"),
    ))
    assertEquals(listOf("任务已完成", "任务部分完成", "任务失败", "任务已取消"), titles)
    assertTrue(TaskNotificationPolicy.monitorText(3).contains("3"))
    assertEquals("正在监控 3 个任务", TaskNotificationPolicy.monitorText(3))
  }
}
