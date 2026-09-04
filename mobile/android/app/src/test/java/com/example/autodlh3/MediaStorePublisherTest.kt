package com.example.autodlh3

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeMediaStoreGateway(
  entries: List<MediaStoreEntry> = emptyList(),
  contents: Map<String, ByteArray> = emptyMap(),
) : MediaStoreGateway {
  val entries = entries.toMutableList()
  val contents = contents.toMutableMap()
  val deleted = mutableListOf<String>()
  var inserts = 0
  var finalized = false
  var failWrite = false

  override fun query(displayName: String, relativePath: String) = entries.toList()
  override fun insert(displayName: String, mime: String, relativePath: String): String {
    inserts += 1
    return "content://new/$inserts".also { entries += MediaStoreEntry(it, true) }
  }
  override fun openInput(uri: String): InputStream? = contents[uri]?.let(::ByteArrayInputStream)
  override fun openOutput(uri: String): OutputStream = object : ByteArrayOutputStream() {
    override fun write(buffer: ByteArray, offset: Int, length: Int) {
      if (failWrite) throw IllegalStateException("write failed")
      super.write(buffer, offset, length)
    }
    override fun close() { contents[uri] = toByteArray(); super.close() }
  }
  override fun finalize(uri: String) { finalized = true; entries.replaceAll { if (it.uri == uri) it.copy(pending = false) else it } }
  override fun delete(uri: String) { deleted += uri; entries.removeAll { it.uri == uri }; contents.remove(uri) }
}

class MediaStorePublisherTest {
  private val sourceBytes = "new-video-content".toByteArray()
  private fun publisher(gateway: FakeMediaStoreGateway) = MediaStorePublisher(gateway) { ByteArrayInputStream(sourceBytes) }

  @Test fun reusesOneCompletedEntryOnlyWhenItsContentMatches() {
    val same = "content://old/same"
    val stale = "content://old/stale"
    val gateway = FakeMediaStoreGateway(
      listOf(MediaStoreEntry(same, false), MediaStoreEntry(stale, false)),
      mapOf(same to sourceBytes, stale to "old".toByteArray()),
    )
    val result = publisher(gateway).publish("ignored", "id", "video.mp4")
    assertEquals(same, result.uri)
    assertTrue(result.alreadyExisted)
    assertEquals(0, gateway.inserts)
    assertEquals(listOf(stale), gateway.deleted)
  }

  @Test fun replacesCompletedEntryWhoseContentDiffers() {
    val old = "content://old/video"
    val gateway = FakeMediaStoreGateway(listOf(MediaStoreEntry(old, false)), mapOf(old to "old".toByteArray()))
    val result = publisher(gateway).publish("ignored", "id", "video.mp4")
    assertFalse(result.alreadyExisted)
    assertEquals(listOf(old), gateway.deleted)
    assertArrayEquals(sourceBytes, gateway.contents[result.uri])
    assertTrue(gateway.finalized)
  }

  @Test fun replacesUnreadableAndPendingRows() {
    val unreadable = "content://old/unreadable"
    val pending = "content://old/pending"
    val gateway = FakeMediaStoreGateway(listOf(MediaStoreEntry(unreadable, false), MediaStoreEntry(pending, true)))
    publisher(gateway).publish("ignored", "id", "video.mp4")
    assertEquals(listOf(unreadable, pending), gateway.deleted)
    assertEquals(1, gateway.inserts)
  }

  @Test fun removesPendingTargetWhenWritingFails() {
    val gateway = FakeMediaStoreGateway().apply { failWrite = true }
    try {
      publisher(gateway).publish("ignored", "id", "video.mp4")
      throw AssertionError("expected write failure")
    } catch (error: IllegalStateException) {
      assertEquals("write failed", error.message)
    }
    assertEquals(listOf("content://new/1"), gateway.deleted)
    assertFalse(gateway.finalized)
  }
}
