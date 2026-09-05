package com.example.autodlh3

import java.net.InetAddress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ArtifactTransferPolicyTest {
  private fun address(value: String) = InetAddress.getByName(value)

  private fun request(
    url: String = "https://cdn.example.test/video.mp4",
    allowedHosts: Set<String> = setOf("example.test"),
    allowPublicHosts: Boolean = false,
  ) = ArtifactTransferRequest(
    url = url,
    allowedHosts = allowedHosts,
    allowProviderSuppliedPublicHosts = allowPublicHosts,
    acceptedMimes = setOf("video/mp4"),
    maxBytes = 1024,
    connectTimeoutMs = 1_000,
    idleTimeoutMs = 1_000,
    expectedSha256 = null,
    operationId = "operation-1",
    operationAttempt = 2,
  )

  private fun expectCode(code: String, block: () -> Unit) {
    val error = runCatching(block).exceptionOrNull() as? ArtifactTransferException
      ?: throw AssertionError("Expected ArtifactTransferException")
    assertEquals(code, error.diagnosticCode)
  }

  @Test fun `requires HTTPS and rejects embedded credentials`() {
    val policy = ArtifactTransferPolicy { listOf(address("93.184.216.34")) }
    expectCode("ARTIFACT_HTTPS_REQUIRED") { policy.validate("http://cdn.example.test/video.mp4", request()) }
    expectCode("ARTIFACT_URL_CREDENTIALS") { policy.validate("https://user:secret@cdn.example.test/video.mp4", request()) }
  }

  @Test fun `normalizes the allowlist and permits only the host or its subdomains`() {
    val resolved = mutableListOf<String>()
    val policy = ArtifactTransferPolicy { host -> resolved += host; listOf(address("93.184.216.34")) }
    val configured = request(allowedHosts = setOf(" .Example.TEST. ", " "))

    assertEquals("https://cdn.example.test/video.mp4", policy.validate(configured.url, configured))
    assertEquals(listOf("cdn.example.test"), resolved)
    expectCode("ARTIFACT_HOST_DENIED") {
      policy.validate("https://example.test.attacker.invalid/video.mp4", configured)
    }
    expectCode("ARTIFACT_POLICY_MISSING") {
      policy.validate(configured.url, request(allowedHosts = setOf(" ")))
    }
  }

  @Test fun `provider supplied hosts still require every DNS answer to be public`() {
    val nonPublic = listOf(
      "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1",
      "172.16.0.1", "192.168.0.1", "192.0.0.1", "192.0.2.1", "198.18.0.1",
      "198.51.100.1", "203.0.113.1", "224.0.0.1", "::", "::1", "fe80::1",
      "fc00::1", "2001:db8::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:192.168.1.1",
    )
    nonPublic.forEach { value ->
      val policy = ArtifactTransferPolicy { listOf(address(value)) }
      expectCode("ARTIFACT_PRIVATE_NETWORK") {
        policy.validate("https://provider-cdn.test/video.mp4", request(allowPublicHosts = true))
      }
    }

    val mixed = ArtifactTransferPolicy {
      listOf(address("93.184.216.34"), address("127.0.0.1"))
    }
    expectCode("ARTIFACT_PRIVATE_NETWORK") {
      mixed.validate("https://provider-cdn.test/video.mp4", request(allowPublicHosts = true))
    }

    val publicOnly = ArtifactTransferPolicy { listOf(address("93.184.216.34"), address("2606:4700:4700::1111")) }
    assertEquals(
      "https://provider-cdn.test/video.mp4",
      publicOnly.validate("https://provider-cdn.test/video.mp4", request(allowPublicHosts = true)),
    )
  }

  @Test fun `rejects unresolved hosts and malformed URLs`() {
    val unresolved = ArtifactTransferPolicy { emptyList() }
    expectCode("ARTIFACT_PRIVATE_NETWORK") { unresolved.validate(request().url, request()) }
    expectCode("ARTIFACT_URL_INVALID") { unresolved.validate("not a url", request()) }
  }

  @Test fun `revalidates redirect candidates with the same policy`() {
    val visited = mutableListOf<String>()
    val policy = ArtifactTransferPolicy { host ->
      visited += host
      if (host == "private.example.test") listOf(address("10.0.0.2")) else listOf(address("93.184.216.34"))
    }
    val configured = request(allowPublicHosts = true)

    assertEquals(configured.url, policy.validate(configured.url, configured))
    expectCode("ARTIFACT_PRIVATE_NETWORK") {
      policy.validate("https://private.example.test/redirected.mp4", configured)
    }
    assertTrue(visited.containsAll(listOf("cdn.example.test", "private.example.test")))
  }
}
