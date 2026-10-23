package com.example.autodlh3

import java.nio.file.Files
import java.security.MessageDigest
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.*
import org.junit.Test

class NovelAiTransportTest {
  private val key = "a".repeat(64)
  private val request = "{\"input\":\"observatory\"}"
  private val hash = MessageDigest.getInstance("SHA-256").digest(request.toByteArray()).joinToString("") { "%02x".format(it) }
  @Test fun responseIsDurableAndRepeatedCallsDoNotSend() {
    val dir = Files.createTempDirectory("nai-test").toFile(); val server = MockWebServer(); server.start()
    try {
      server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("{\"images\":[]}"))
      val client = NovelAiTransport(dir, endpoint = server.url("/").toString())
      val result = client.generate(key, request, hash, "private-token")
      assertEquals("{\"images\":[]}", result.readText())
      assertEquals(result, NovelAiTransport(dir, endpoint = server.url("/").toString()).generate(key, request, hash, "different-token"))
      assertEquals(1, server.requestCount)
      assertEquals("application/json", server.takeRequest().getHeader("Accept"))
      assertFalse(FileTreeContains(dir, "private-token"))
    } finally { server.shutdown(); dir.deleteRecursively() }
  }
  @Test fun droppedResponseIsNeverAutomaticallyRetried() {
    val dir = Files.createTempDirectory("nai-test").toFile(); val server = MockWebServer(); server.start()
    try {
      server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
      val client = NovelAiTransport(dir, endpoint = server.url("/").toString())
      assertThrows(Exception::class.java) { client.generate(key, request, hash, "private-token") }
      assertThrows(IllegalStateException::class.java) { client.generate(key, request, hash, "private-token") }
      assertEquals(1, server.requestCount); assertNull(client.lookup(key, hash))
    } finally { server.shutdown(); dir.deleteRecursively() }
  }
  @Test fun corruptReceiptOrWrongRequestCannotBeReused() {
    val dir = Files.createTempDirectory("nai-test").toFile(); val server = MockWebServer(); server.start()
    try {
      server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("{}"))
      val client = NovelAiTransport(dir, endpoint = server.url("/").toString())
      client.generate(key, request, hash, "private-token").writeText("corrupted")
      assertThrows(IllegalArgumentException::class.java) { client.lookup(key, hash) }
      assertThrows(IllegalArgumentException::class.java) { client.generate(key, "{}", hash, "private-token") }
      assertEquals(1, server.requestCount)
    } finally { server.shutdown(); dir.deleteRecursively() }
  }
  private fun FileTreeContains(dir: java.io.File, value: String) = dir.walkTopDown().filter { it.isFile }.any { it.readText().contains(value) }
}
