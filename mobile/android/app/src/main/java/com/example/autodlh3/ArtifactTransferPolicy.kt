package com.example.autodlh3

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI

data class ArtifactTransferRequest(
  val url: String,
  val allowedHosts: Set<String>,
  val allowProviderSuppliedPublicHosts: Boolean,
  val acceptedMimes: Set<String>,
  val maxBytes: Long,
  val connectTimeoutMs: Long,
  val idleTimeoutMs: Long,
  val expectedSha256: String?,
  val operationId: String,
  val operationAttempt: Int,
)

data class ArtifactTransferResult(
  val partUri: String,
  val finalUrl: String,
  val mime: String,
  val byteSize: Long,
  val sha256: String,
)

class ArtifactTransferException(
  val diagnosticCode: String,
  val retryable: Boolean,
  cause: Throwable? = null,
) : IllegalArgumentException(diagnosticCode, cause)

class ArtifactTransferPolicy(
  private val dns: (String) -> List<InetAddress> = { InetAddress.getAllByName(it).toList() },
) {
  private fun normalizedHosts(hosts: Set<String>): Set<String> = hosts.mapNotNull { entry ->
    entry.trim().lowercase().trim('.').takeIf(String::isNotEmpty)
  }.toSet()

  private fun isAllowed(host: String, allowed: Set<String>): Boolean =
    allowed.any { host == it || host.endsWith(".$it") }

  private fun unsigned(value: Byte): Int = value.toInt() and 0xff

  private fun isExplicitlyNonPublicV4(address: Inet4Address): Boolean {
    val bytes = address.address.map(::unsigned)
    val a = bytes[0]
    val b = bytes[1]
    val c = bytes[2]
    return a == 0 || (a == 100 && b in 64..127) ||
      (a == 192 && b == 0 && c == 0) ||
      (a == 192 && b == 0 && c == 2) ||
      (a == 198 && b in 18..19) ||
      (a == 198 && b == 51 && c == 100) ||
      (a == 203 && b == 0 && c == 113) || a >= 240
  }

  private fun mappedV4(address: Inet6Address): Inet4Address? {
    val bytes = address.address
    val mapped = (0 until 10).all { bytes[it].toInt() == 0 } &&
      unsigned(bytes[10]) == 0xff && unsigned(bytes[11]) == 0xff
    if (!mapped) return null
    return InetAddress.getByAddress(bytes.copyOfRange(12, 16)) as Inet4Address
  }

  private fun hasPrefix(address: ByteArray, prefix: ByteArray, prefixBits: Int): Boolean {
    val completeBytes = prefixBits / 8
    if (!(0 until completeBytes).all { address[it] == prefix[it] }) return false
    val remainingBits = prefixBits % 8
    if (remainingBits == 0) return true
    val mask = (0xff shl (8 - remainingBits)) and 0xff
    return unsigned(address[completeBytes]) and mask == unsigned(prefix[completeBytes]) and mask
  }

  private fun hasPrefix(address: Inet6Address, prefix: String, prefixBits: Int): Boolean =
    hasPrefix(address.address, InetAddress.getByName(prefix).address, prefixBits)

  private fun translatedV4(address: Inet6Address): Inet4Address =
    InetAddress.getByAddress(address.address.copyOfRange(12, 16)) as Inet4Address

  private fun isExplicitlyNonPublicV6(address: Inet6Address): Boolean {
    mappedV4(address)?.let { return !isPublic(it) }
    // IANA marks the well-known NAT64 prefix globally reachable, but its embedded
    // IPv4 destination must independently pass the same public-address policy.
    if (hasPrefix(address, "64:ff9b::", 96)) return !isPublic(translatedV4(address))

    // Fail closed outside IPv6 global unicast. This covers local-use translation,
    // discard-only, dummy, unique-local, link-local, multicast, and reserved space.
    if (!hasPrefix(address, "2000::", 3)) return true

    // More-specific globally reachable exceptions inside 2001::/23 come first.
    val globallyReachableIetfException =
      hasPrefix(address, "2001:1::1", 128) ||
        hasPrefix(address, "2001:1::2", 128) ||
        hasPrefix(address, "2001:1::3", 128) ||
        hasPrefix(address, "2001:3::", 32) ||
        hasPrefix(address, "2001:4:112::", 48) ||
        hasPrefix(address, "2001:20::", 28) ||
        hasPrefix(address, "2001:30::", 28)
    if (globallyReachableIetfException) return false

    return hasPrefix(address, "2001::", 23) ||
      hasPrefix(address, "2001:db8::", 32) ||
      hasPrefix(address, "2002::", 16) ||
      hasPrefix(address, "3fff::", 20)
  }

  private fun isPublic(address: InetAddress): Boolean {
    if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress ||
      address.isSiteLocalAddress || address.isMulticastAddress
    ) return false
    return when (address) {
      is Inet4Address -> !isExplicitlyNonPublicV4(address)
      is Inet6Address -> !isExplicitlyNonPublicV6(address)
      else -> false
    }
  }

  fun resolvePublic(host: String): List<InetAddress> {
    val addresses = try {
      dns(host)
    } catch (error: Exception) {
      throw ArtifactTransferException("ARTIFACT_PRIVATE_NETWORK", false, error)
    }
    if (addresses.isEmpty() || addresses.any { !isPublic(it) }) {
      throw ArtifactTransferException("ARTIFACT_PRIVATE_NETWORK", false)
    }
    return addresses
  }

  fun validate(rawUrl: String, request: ArtifactTransferRequest): String {
    val uri = try {
      URI(rawUrl)
    } catch (error: Exception) {
      throw ArtifactTransferException("ARTIFACT_URL_INVALID", false, error)
    }
    if (!uri.isAbsolute || uri.host.isNullOrBlank()) {
      throw ArtifactTransferException("ARTIFACT_URL_INVALID", false)
    }
    if (!uri.scheme.equals("https", ignoreCase = true)) {
      throw ArtifactTransferException("ARTIFACT_HTTPS_REQUIRED", false)
    }
    if (uri.rawUserInfo != null) {
      throw ArtifactTransferException("ARTIFACT_URL_CREDENTIALS", false)
    }
    val host = uri.host.lowercase().trimEnd('.')
    val allowed = normalizedHosts(request.allowedHosts)
    if (!request.allowProviderSuppliedPublicHosts && allowed.isEmpty()) {
      throw ArtifactTransferException("ARTIFACT_POLICY_MISSING", false)
    }
    if (!request.allowProviderSuppliedPublicHosts && !isAllowed(host, allowed)) {
      throw ArtifactTransferException("ARTIFACT_HOST_DENIED", false)
    }
    resolvePublic(host)
    return uri.toASCIIString()
  }
}
