package com.example.autodlh3

import java.io.File
import java.net.InetAddress
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ArtifactTransferTest {
  private lateinit var server: MockWebServer
  private lateinit var partsDir: File

  @Before fun setUp() {
    server = MockWebServer()
    server.start()
    partsDir = Files.createTempDirectory("artifact-transfer-").toFile()
  }

  @After fun tearDown() {
    server.shutdown()
    partsDir.deleteRecursively()
  }

  private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes).joinToString("") { "%02x".format(it) }

  private fun request(
    url: String = server.url("/video.mp4").toString(),
    maxBytes: Long = 1024,
    expectedSha256: String? = null,
    connectTimeoutMs: Long = 1_000,
    idleTimeoutMs: Long = 1_000,
    operationId: String = "operation-1",
  ) = ArtifactTransferRequest(
    url = url,
    allowedHosts = setOf("example.test"),
    allowProviderSuppliedPublicHosts = false,
    acceptedMimes = setOf("video/mp4"),
    maxBytes = maxBytes,
    connectTimeoutMs = connectTimeoutMs,
    idleTimeoutMs = idleTimeoutMs,
    expectedSha256 = expectedSha256,
    operationId = operationId,
    operationAttempt = 3,
  )

  private fun transfer(
    validator: (String, ArtifactTransferRequest) -> String = { url, _ -> url },
    dns: (String, ArtifactTransferRequest) -> List<InetAddress> = { host, _ -> OkHttpClient().dns.lookup(host) },
    durableSha256: (String, () -> Unit) -> String = { source, checkCancelled ->
      checkCancelled()
      File(java.net.URI(source)).inputStream().use(MediaIntegrity::sha256)
    },
    clock: () -> Long = System::currentTimeMillis,
  ) = ArtifactTransfer(
    partsDir = partsDir,
    httpClient = OkHttpClient(),
    validator = validator,
    dns = dns,
    durableSha256 = durableSha256,
    clock = clock,
  )

  private fun expectCode(code: String, block: () -> Unit): ArtifactTransferException {
    val error = runCatching(block).exceptionOrNull() as? ArtifactTransferException
      ?: throw AssertionError("Expected ArtifactTransferException")
    assertEquals(code, error.diagnosticCode)
    return error
  }

  @Test fun `streams to a deterministic part and verifies provider and durable hashes`() {
    val body = "native streaming".toByteArray()
    val expected = sha256(body)
    server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4; charset=binary").setBody(body.toString(Charsets.UTF_8)))

    val result = transfer().transfer(request(expectedSha256 = expected))

    assertEquals(server.url("/video.mp4").toString(), result.finalUrl)
    assertEquals("video/mp4", result.mime)
    assertEquals(body.size.toLong(), result.byteSize)
    assertEquals(expected, result.sha256)
    assertEquals("file", java.net.URI(result.partUri).scheme)
    assertEquals(body.toList(), File(java.net.URI(result.partUri)).readBytes().toList())
    assertEquals(1, partsDir.listFiles()?.size)
  }

  @Test fun `follows safe redirects and revalidates every target`() {
    server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", "/final.mp4"))
    server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4").setBody("ok"))
    val validated = mutableListOf<String>()

    val result = transfer(validator = { url, _ -> validated += url; url }).transfer(request())

    assertEquals(server.url("/final.mp4").toString(), result.finalUrl)
    assertEquals(listOf(server.url("/video.mp4").toString(), server.url("/final.mp4").toString()), validated)
  }

  @Test fun `the HTTP connection consumes the injected DNS answers`() {
    server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4").setBody("pinned"))
    val publicName = server.url("/pinned.mp4").newBuilder().host("artifact.public.test").build().toString()
    val lookedUp = mutableListOf<String>()

    val result = transfer(dns = { host, _ ->
      lookedUp += host
      listOf(InetAddress.getByName("127.0.0.1"))
    }).transfer(request(url = publicName))

    assertEquals("artifact.public.test", lookedUp.single())
    assertEquals("pinned".length.toLong(), result.byteSize)
  }

  @Test fun `rejects an unsafe redirect before issuing the redirected request`() {
    server.enqueue(MockResponse().setResponseCode(307).setHeader("Location", "https://private.example.test/file.mp4"))
    val validator: (String, ArtifactTransferRequest) -> String = { url, _ ->
      if (url.contains("private.example.test")) throw ArtifactTransferException("ARTIFACT_PRIVATE_NETWORK", false)
      url
    }

    expectCode("ARTIFACT_PRIVATE_NETWORK") { transfer(validator).transfer(request()) }
    assertEquals(1, server.requestCount)
    assertTrue(partsDir.listFiles().isNullOrEmpty())
  }

  @Test fun `limits redirects to five`() {
    repeat(6) { server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", "/hop-$it")) }
    expectCode("ARTIFACT_REDIRECT_LIMIT") { transfer().transfer(request()) }
    assertEquals(6, server.requestCount)
    assertTrue(partsDir.listFiles().isNullOrEmpty())
  }

  @Test fun `rejects MIME mismatch and declared size overflow before streaming`() {
    server.enqueue(MockResponse().setHeader("Content-Type", "text/plain").setBody("video"))
    expectCode("ARTIFACT_MIME_REJECTED") { transfer().transfer(request()) }

    server.enqueue(
      MockResponse().setHeader("Content-Type", "video/mp4").setBody(ByteArray(100) { 1 }.toString(Charsets.ISO_8859_1)),
    )
    expectCode("ARTIFACT_SIZE_REJECTED") { transfer().transfer(request(maxBytes = 10)) }
    assertTrue(partsDir.listFiles().isNullOrEmpty())
  }

  @Test fun `rejects streamed size overflow even without a trustworthy declaration`() {
    server.enqueue(
      MockResponse().setHeader("Content-Type", "video/mp4").setChunkedBody("too large", 2),
    )
    expectCode("ARTIFACT_SIZE_REJECTED") { transfer().transfer(request(maxBytes = 4)) }
    assertTrue(partsDir.listFiles().isNullOrEmpty())
  }

  @Test fun `distinguishes connect and idle timeouts and removes partial files`() {
    server.enqueue(
      MockResponse().setHeadersDelay(200, TimeUnit.MILLISECONDS)
        .setHeader("Content-Type", "video/mp4").setBody("late"),
    )
    val connect = expectCode("ARTIFACT_CONNECT_TIMEOUT") {
      transfer().transfer(request(connectTimeoutMs = 25, idleTimeoutMs = 1_000))
    }
    assertTrue(connect.retryable)

    server.enqueue(
      MockResponse().setHeader("Content-Type", "video/mp4")
        .setBody("eventually").throttleBody(1, 200, TimeUnit.MILLISECONDS),
    )
    val idle = expectCode("ARTIFACT_IDLE_TIMEOUT") {
      transfer().transfer(request(connectTimeoutMs = 1_000, idleTimeoutMs = 25))
    }
    assertTrue(idle.retryable)
    assertTrue(partsDir.listFiles().isNullOrEmpty())
  }

  @Test fun `cancels an active transfer by operation id and removes its part`() {
    server.enqueue(
      MockResponse().setHeader("Content-Type", "video/mp4")
        .setChunkedBody("a long response body", 1).throttleBody(1, 100, TimeUnit.MILLISECONDS),
    )
    val clock = AtomicLong()
    val streamed = CountDownLatch(1)
    val artifactTransfer = transfer(clock = { clock.addAndGet(1_000) })
    val worker = Executors.newSingleThreadExecutor()
    val future = worker.submit<ArtifactTransferException?> {
      runCatching {
        artifactTransfer.transfer(request(operationId = "cancel-me", idleTimeoutMs = 5_000)) { streamed.countDown() }
      }
        .exceptionOrNull() as? ArtifactTransferException
    }
    assertTrue(streamed.await(2, TimeUnit.SECONDS))

    assertTrue(artifactTransfer.cancel("cancel-me"))
    assertEquals("ARTIFACT_CANCELLED", future.get(2, TimeUnit.SECONDS)?.diagnosticCode)
    assertFalse(artifactTransfer.cancel("cancel-me"))
    assertTrue(partsDir.listFiles().isNullOrEmpty())
    worker.shutdownNow()
  }

  @Test fun `a duplicate operation cannot dismantle the writable cancellable first transfer`() {
    server.enqueue(
      MockResponse().setHeader("Content-Type", "video/mp4")
        .setChunkedBody("a long response body", 1).throttleBody(1, 100, TimeUnit.MILLISECONDS),
    )
    val streamed = CountDownLatch(1)
    val artifactTransfer = transfer(clock = { System.currentTimeMillis() + 10_000 })
    val worker = Executors.newSingleThreadExecutor()
    val first = worker.submit<ArtifactTransferException?> {
      runCatching {
        artifactTransfer.transfer(request(operationId = "duplicate", idleTimeoutMs = 5_000)) {
          streamed.countDown()
        }
      }.exceptionOrNull() as? ArtifactTransferException
    }
    assertTrue(streamed.await(2, TimeUnit.SECONDS))

    expectCode("ARTIFACT_TRANSFER_ACTIVE") {
      artifactTransfer.transfer(request(operationId = "duplicate", idleTimeoutMs = 5_000))
    }
    assertTrue("the first transfer must remain registered for cancellation", artifactTransfer.cancel("duplicate"))
    assertEquals("ARTIFACT_CANCELLED", first.get(2, TimeUnit.SECONDS)?.diagnosticCode)
    assertTrue(partsDir.listFiles().isNullOrEmpty())
    worker.shutdownNow()
  }

  @Test fun `cancellation before the first HTTP call covers initial validation`() {
    val validating = CountDownLatch(1)
    val releaseValidation = CountDownLatch(1)
    val artifactTransfer = transfer(validator = { url, _ ->
      validating.countDown()
      releaseValidation.await(2, TimeUnit.SECONDS)
      url
    })
    val worker = Executors.newSingleThreadExecutor()
    val future = worker.submit<ArtifactTransferException?> {
      runCatching { artifactTransfer.transfer(request(operationId = "cancel-validation")) }
        .exceptionOrNull() as? ArtifactTransferException
    }
    assertTrue(validating.await(2, TimeUnit.SECONDS))

    val cancelled = artifactTransfer.cancel("cancel-validation")
    releaseValidation.countDown()

    assertTrue(cancelled)
    assertEquals("ARTIFACT_CANCELLED", future.get(2, TimeUnit.SECONDS)?.diagnosticCode)
    assertEquals(0, server.requestCount)
    worker.shutdownNow()
  }

  @Test fun `cancellation between redirect calls covers redirect validation`() {
    server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", "/final.mp4"))
    server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4").setBody("must not download"))
    val validations = AtomicInteger()
    val validatingRedirect = CountDownLatch(1)
    val releaseRedirect = CountDownLatch(1)
    val artifactTransfer = transfer(validator = { url, _ ->
      if (validations.incrementAndGet() == 2) {
        validatingRedirect.countDown()
        releaseRedirect.await(2, TimeUnit.SECONDS)
      }
      url
    })
    val worker = Executors.newSingleThreadExecutor()
    val future = worker.submit<ArtifactTransferException?> {
      runCatching { artifactTransfer.transfer(request(operationId = "cancel-redirect")) }
        .exceptionOrNull() as? ArtifactTransferException
    }
    assertTrue(validatingRedirect.await(2, TimeUnit.SECONDS))

    val cancelled = artifactTransfer.cancel("cancel-redirect")
    releaseRedirect.countDown()

    assertTrue(cancelled)
    assertEquals("ARTIFACT_CANCELLED", future.get(2, TimeUnit.SECONDS)?.diagnosticCode)
    assertEquals(1, server.requestCount)
    worker.shutdownNow()
  }

  @Test fun `cancellation during the durable reread fails the complete transfer`() {
    server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4").setBody("durable"))
    val rereading = CountDownLatch(1)
    val releaseReread = CountDownLatch(1)
    val artifactTransfer = transfer(durableSha256 = { source, checkCancelled ->
      rereading.countDown()
      releaseReread.await(2, TimeUnit.SECONDS)
      checkCancelled()
      File(java.net.URI(source)).inputStream().use(MediaIntegrity::sha256)
    })
    val worker = Executors.newSingleThreadExecutor()
    val future = worker.submit<ArtifactTransferException?> {
      runCatching { artifactTransfer.transfer(request(operationId = "cancel-reread")) }
        .exceptionOrNull() as? ArtifactTransferException
    }
    assertTrue(rereading.await(2, TimeUnit.SECONDS))

    val cancelled = artifactTransfer.cancel("cancel-reread")
    releaseReread.countDown()

    assertTrue(cancelled)
    assertEquals("ARTIFACT_CANCELLED", future.get(2, TimeUnit.SECONDS)?.diagnosticCode)
    assertTrue(partsDir.listFiles().isNullOrEmpty())
    worker.shutdownNow()
  }

  @Test fun `rejects provider hash mismatch and durable reread mismatch`() {
    val body = "hash me".toByteArray()
    server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4").setBody(body.toString(Charsets.UTF_8)))
    expectCode("ARTIFACT_SHA_MISMATCH") {
      transfer().transfer(request(expectedSha256 = "0".repeat(64)))
    }
    assertTrue(partsDir.listFiles().isNullOrEmpty())

    server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4").setBody(body.toString(Charsets.UTF_8)))
    expectCode("ARTIFACT_DURABLE_SHA_MISMATCH") {
      transfer(durableSha256 = { _, _ -> "f".repeat(64) }).transfer(request(expectedSha256 = sha256(body)))
    }
    assertTrue(partsDir.listFiles().isNullOrEmpty())
  }

  @Test fun `throttles progress until one second or five MiB advances`() {
    val chunk = ByteArray(64 * 1024) { 7 }
    val body = ByteArray(6 * 1024 * 1024) { chunk[it % chunk.size] }
    server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4").setBody(okio.Buffer().write(body)))
    var now = 10_000L
    val progress = mutableListOf<Long>()

    transfer(clock = { now }).transfer(request(maxBytes = body.size.toLong() + 1)) { bytes -> progress += bytes }

    assertEquals(listOf(5L * 1024 * 1024), progress)
    now += 1_000
  }

  @Test fun `cancellation work remains runnable while both transfer workers are occupied`() {
    val executors = MediaWorkExecutors()
    val workersStarted = CountDownLatch(2)
    val releaseWorkers = CountDownLatch(1)
    val cancellationRan = CountDownLatch(1)
    try {
      repeat(2) {
        executors.executeMedia {
          workersStarted.countDown()
          releaseWorkers.await(2, TimeUnit.SECONDS)
        }
      }
      assertTrue(workersStarted.await(2, TimeUnit.SECONDS))

      executors.executeCancellation { cancellationRan.countDown() }

      assertTrue("cancellation must not queue behind transfers", cancellationRan.await(1, TimeUnit.SECONDS))
    } finally {
      releaseWorkers.countDown()
      executors.shutdown()
    }
  }
}
