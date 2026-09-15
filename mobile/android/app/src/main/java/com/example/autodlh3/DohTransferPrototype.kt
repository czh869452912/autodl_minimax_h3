package com.example.autodlh3

import java.io.File
import java.net.InetAddress
import java.net.Proxy
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.SocketFactory
import okhttp3.ConnectionPool
import okhttp3.Dns
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.dnsoverhttps.DnsOverHttps

data class ArtifactNetworkBinding(val id: String, val sockets: SocketFactory)

/** Debug experiment only. Each transfer owns its DNS calls, cancellation and network binding. */
class DohResolutionSession(
  private val client: OkHttpClient,
  dns: Dns,
  private val networkUnchanged: () -> Boolean,
) : AutoCloseable {
  @Volatile private var cancelled = false
  private val policy = ArtifactTransferPolicy { host ->
    checkActive()
    val answers = if (host.contains(':') || host.matches(Regex("[0-9.]+"))) listOf(InetAddress.getByName(host)) else dns.lookup(host)
    checkActive()
    answers
  }
  fun checkActive() {
    if (cancelled) throw ArtifactTransferException("ARTIFACT_CANCELLED", false)
    if (!networkUnchanged()) throw ArtifactTransferException("ARTIFACT_NETWORK", true)
  }
  fun validate(url: String, request: ArtifactTransferRequest): String { checkActive(); try { return policy.validate(url, request) } finally { checkActive() } }
  fun lookup(host: String): List<InetAddress> { checkActive(); try { return policy.resolvePublic(host) } finally { checkActive() } }
  override fun close() { cancelled = true; client.dispatcher.cancelAll(); client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown() }

  companion object {
    fun cloudflare(binding: ArtifactNetworkBinding, current: () -> ArtifactNetworkBinding?): DohResolutionSession {
      // No DNS/HTTP cache (effective TTL 0); no stale entries survive network changes.
      // Proxy.NO_PROXY still uses the selected Android VPN network's socket factory.
      val client = OkHttpClient.Builder().socketFactory(binding.sockets).proxy(Proxy.NO_PROXY)
        .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS)).cache(null)
        .callTimeout(5, TimeUnit.SECONDS).connectTimeout(5, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).build()
      val dns = DnsOverHttps.Builder().client(client).url("https://cloudflare-dns.com/dns-query".toHttpUrl())
        .bootstrapDnsHosts(InetAddress.getByAddress(byteArrayOf(1, 1, 1, 1)), InetAddress.getByAddress(byteArrayOf(1, 0, 0, 1)))
        .post(true).includeIPv6(true).resolvePrivateAddresses(true).build()
      return DohResolutionSession(client, dns) { current()?.id == binding.id }
    }
  }
}

class DohTransferPrototype(
  private val partsDir: File,
  private val durableSha256: (String, () -> Unit) -> String,
  private val network: () -> ArtifactNetworkBinding?,
) : AutoCloseable {
  private data class Key(val id: String, val attempt: Int)
  private class Work(val resolver: DohResolutionSession, val transfer: ArtifactTransfer, val client: OkHttpClient)
  private val active = ConcurrentHashMap<Key, Work>()

  fun transfer(request: ArtifactTransferRequest): ArtifactTransferResult {
    val binding = network() ?: throw ArtifactTransferException("ARTIFACT_NETWORK", true)
    val resolver = DohResolutionSession.cloudflare(binding, network)
    val client = OkHttpClient.Builder().socketFactory(binding.sockets).proxy(Proxy.NO_PROXY)
      .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS)).build()
    val transfer = ArtifactTransfer(partsDir, client, resolver::validate, { host, _ -> resolver.lookup(host) }, durableSha256)
    val key = Key(request.operationId, request.operationAttempt)
    val work = Work(resolver, transfer, client)
    if (active.putIfAbsent(key, work) != null) { resolver.close(); client.dispatcher.executorService.shutdown(); throw ArtifactTransferException("ARTIFACT_TRANSFER_ACTIVE", false) }
    try { resolver.checkActive(); return transfer.transfer(request) }
    finally { active.remove(key, work); resolver.close(); client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown() }
  }
  fun cancel(id: String, attempt: Int): Boolean {
    val work = active[Key(id, attempt)] ?: return false
    work.transfer.cancel(id, attempt)
    work.resolver.close()
    return true
  }
  override fun close() { active.keys.forEach { cancel(it.id, it.attempt) } }
}
