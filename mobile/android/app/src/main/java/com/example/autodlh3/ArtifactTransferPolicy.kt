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

  private fun isExplicitlyNonPublicV6(address: Inet6Address): Boolean {
    mappedV4(address)?.let { return !isPublic(it) }
    val bytes = address.address
    val first = unsigned(bytes[0])
    val second = unsigned(bytes[1])
    val uniqueLocal = first and 0xfe == 0xfc
    val documentation = first == 0x20 && second == 0x01 &&
      unsigned(bytes[2]) == 0x0d && unsigned(bytes[3]) == 0xb8
    val benchmark = first == 0x20 && second == 0x01 &&
      unsigned(bytes[2]) == 0x00 && unsigned(bytes[3]) == 0x02 &&
      unsigned(bytes[4]) == 0x00 && unsigned(bytes[5]) == 0x00
    return uniqueLocal || documentation || benchmark
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
