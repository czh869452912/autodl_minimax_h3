package com.example.autodlh3

import java.net.InetAddress
import java.net.Proxy

import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.dnsoverhttps.DnsOverHttps
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test

class DohResolutionSessionTest {
  private fun dns(lookup: () -> List<InetAddress>) = object : Dns { override fun lookup(hostname: String) = lookup() }
  private fun request() = ArtifactTransferRequest("https://cdn.example.com/file.mp4", emptySet(), true, setOf("video/mp4"), 1024, 1000, 1000, null, "test", 1)
  private fun code(block: () -> Unit) = (runCatching(block).exceptionOrNull() as ArtifactTransferException).diagnosticCode

  @Test fun sharedPolicyChecksPreflightConnectionAndRedirectWithoutCaching() {
    val answers = ArrayDeque(listOf("93.184.216.34", "10.0.0.1", "198.18.0.1"))
    val session = DohResolutionSession(OkHttpClient(), dns { listOf(InetAddress.getByName(answers.removeFirst())) }) { true }
    session.use {
      assertEquals(request().url, it.validate(request().url, request()))
      assertEquals("ARTIFACT_PRIVATE_NETWORK", code { it.lookup("cdn.example.com") })
      assertEquals("ARTIFACT_VIRTUAL_DNS", code { it.validate("https://redirect.example.com/file.mp4", request()) })
      assertEquals("ARTIFACT_PRIVATE_NETWORK", code { it.validate("https://198.18.0.1/file.mp4", request()) })
    }
  }

  @Test fun networkChangesAndCancellationCannotReusePreviousAnswers() {
    var connected = true
    val session = DohResolutionSession(OkHttpClient(), dns { listOf(InetAddress.getByName("93.184.216.34")) }) { connected }
    assertEquals(1, session.lookup("cdn.example.com").size)
    connected = false
    assertEquals("ARTIFACT_NETWORK", code { session.lookup("cdn.example.com") })
    session.close()
    assertEquals("ARTIFACT_CANCELLED", code { session.lookup("cdn.example.com") })
  }

  private fun withServer(work: (MockWebServer, OkHttpClient) -> Unit) {
    val certificate = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
    val serverCertificates = HandshakeCertificates.Builder().heldCertificate(certificate).build()
    val clientCertificates = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
    val server = MockWebServer()
    server.useHttps(serverCertificates.sslSocketFactory(), false)
    server.start()
    val client = OkHttpClient.Builder().sslSocketFactory(clientCertificates.sslSocketFactory(), clientCertificates.trustManager)
      .proxy(Proxy.NO_PROXY).cache(null).callTimeout(2, TimeUnit.SECONDS).build()
    try { work(server, client) } finally { client.dispatcher.cancelAll(); client.dispatcher.executorService.shutdown(); server.shutdown() }
  }

  @Test fun wireDohUsesHttpsPostAndPrivateAnswersAreStillRejected() = withServer { server, client ->
    var address = byteArrayOf(93, 184.toByte(), 216.toByte(), 34)
    server.dispatcher = object : Dispatcher() {
      override fun dispatch(request: RecordedRequest): MockResponse {
        assertEquals("POST", request.method)
        assertEquals("application/dns-message", request.getHeader("Content-Type"))
        val query = request.body.readByteArray()
        query[2] = 0x81.toByte(); query[3] = 0x80.toByte(); query[7] = 1
        val answer = Buffer().write(query).writeShort(0xc00c).writeShort(1).writeShort(1).writeInt(0).writeShort(4).write(address)
        return MockResponse().setHeader("Content-Type", "application/dns-message").setBody(answer)
      }
    }
    val dns = DnsOverHttps.Builder().client(client).url(server.url("/dns-query").newBuilder().host("localhost").build()).bootstrapDnsHosts(InetAddress.getByName("127.0.0.1"))
      .post(true).includeIPv6(false).resolvePrivateAddresses(true).build()
    DohResolutionSession(client, dns) { true }.use { session ->
      assertEquals("93.184.216.34", session.lookup("cdn.example.com").single().hostAddress)
      address = byteArrayOf(10, 0, 0, 1)
      assertEquals("ARTIFACT_PRIVATE_NETWORK", code { session.lookup("cdn.example.com") })
      assertEquals(2, server.requestCount)
    }
  }

  @Test fun cancellationInterruptsPendingDohWithoutFallingBackToSystemDns() = withServer { server, client ->
    server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
    val dns = DnsOverHttps.Builder().client(client).url(server.url("/dns-query").newBuilder().host("localhost").build()).bootstrapDnsHosts(InetAddress.getByName("127.0.0.1"))
      .post(true).includeIPv6(false).resolvePrivateAddresses(true).build()
    val session = DohResolutionSession(client, dns) { true }
    val executor = Executors.newSingleThreadExecutor()
    try {
      val result = executor.submit<String> { code { session.lookup("cdn.example.com") } }
      assertNotNull(server.takeRequest(2, TimeUnit.SECONDS))
      session.close()
      assertEquals("ARTIFACT_CANCELLED", result.get(2, TimeUnit.SECONDS))
    } finally { session.close(); executor.shutdownNow() }
  }

  @Test fun resolverFailureRetainsRetryableDnsClassification() {
    DohResolutionSession(OkHttpClient(), dns { throw java.net.UnknownHostException("sensitive") }) { true }.use {
      val failure = runCatching { it.lookup("cdn.example.com") }.exceptionOrNull() as ArtifactTransferException
      assertEquals("ARTIFACT_DNS_FAILED", failure.diagnosticCode)
      assertTrue(failure.retryable)
      assertFalse(failure.message.orEmpty().contains("sensitive"))
    }
  }
}
