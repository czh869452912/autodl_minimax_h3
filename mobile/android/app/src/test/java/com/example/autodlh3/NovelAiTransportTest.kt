package com.example.autodlh3

import java.nio.file.Files
import java.security.MessageDigest
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.*
import org.junit.Test

class NovelAiTransportTest {
  @Test fun independentWorkersShareAnAtomicSendGate() {
    val dir = Files.createTempDirectory("nai-race").toFile(); val server = MockWebServer(); server.start()
    val pool = java.util.concurrent.Executors.newFixedThreadPool(12)
    try {
      repeat(12) { server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("{}")) }
      val start = java.util.concurrent.CountDownLatch(1)
      val workers = (1..12).map { pool.submit<Boolean> {
        start.await()
        try { NovelAiTransport(dir, endpoint = server.url("/").toString()).generate(key, request, hash, "private-token"); true }
        catch (_: Exception) { false }
      } }
      start.countDown()
      assertTrue(workers.map { it.get(10, java.util.concurrent.TimeUnit.SECONDS) }.any { it })
      assertEquals(1, server.requestCount)
      assertNotNull(NovelAiTransport(dir).lookup(key, hash))
    } finally { pool.shutdownNow(); server.shutdown(); dir.deleteRecursively() }
  }
  @Test fun crashAfterGateCreationCannotResend() {
    val dir = Files.createTempDirectory("nai-empty-marker").toFile()
    try {
      java.io.File(dir, key).mkdirs(); java.io.File(dir, "$key/sent").createNewFile()
      assertThrows(IllegalArgumentException::class.java) { NovelAiTransport(dir).generate(key, request, hash, "private-token") }
    } finally { dir.deleteRecursively() }
  }
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
