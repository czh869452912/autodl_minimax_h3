package com.example.autodlh3

import java.io.File
import java.io.IOException
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

class ArtifactTransfer(
  private val partsDir: File,
  private val httpClient: OkHttpClient,
  private val validator: (String, ArtifactTransferRequest) -> String,
  private val dns: (String, ArtifactTransferRequest) -> List<InetAddress> = { host, _ -> httpClient.dns.lookup(host) },
  private val durableSha256: (String) -> String,
  private val clock: () -> Long = System::currentTimeMillis,
) {
  companion object {
    private const val MAX_REDIRECTS = 5
    private const val BUFFER_BYTES = 64 * 1024
    private const val PROGRESS_BYTES = 5L * 1024L * 1024L

    private fun hashText(value: String): String = MessageDigest.getInstance("SHA-256")
      .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
  }

  private val activeCalls = ConcurrentHashMap<String, Call>()
  private val cancelledOperations = ConcurrentHashMap.newKeySet<String>()

  private fun fail(code: String, retryable: Boolean = false, cause: Throwable? = null): Nothing =
    throw ArtifactTransferException(code, retryable, cause)

  private fun validateRequest(request: ArtifactTransferRequest) {
    if (request.operationId.isBlank() || request.operationAttempt < 0 || request.maxBytes <= 0 ||
      request.connectTimeoutMs <= 0 || request.idleTimeoutMs <= 0 || request.acceptedMimes.isEmpty() ||
      request.expectedSha256?.matches(Regex("^[a-f0-9]{64}$")) == false
    ) fail("ARTIFACT_TRANSFER_REQUEST_INVALID")
  }

  private fun mime(response: Response): String = response.header("Content-Type")
    ?.substringBefore(';')?.trim()?.lowercase().orEmpty()

  private fun isRedirect(status: Int) = status in 300..399

  fun cancel(operationId: String): Boolean {
    val call = activeCalls[operationId] ?: return false
    cancelledOperations += operationId
    call.cancel()
    return true
  }

  fun transfer(
    request: ArtifactTransferRequest,
    onProgress: (Long) -> Unit = {},
  ): ArtifactTransferResult {
    validateRequest(request)
    partsDir.mkdirs()
    if (!partsDir.isDirectory) fail("ARTIFACT_STORAGE_FAILED")
    val part = File(partsDir, "${hashText(request.operationId + "\u0000" + request.operationAttempt)}.part")
    try {
      var current = validator(request.url, request)
      var redirects = 0
      while (true) {
        if (cancelledOperations.contains(request.operationId)) fail("ARTIFACT_CANCELLED")
        val requestClient = httpClient.newBuilder()
          .followRedirects(false)
          .followSslRedirects(false)
          .dns(object : Dns {
            override fun lookup(hostname: String): List<InetAddress> = dns(hostname, request)
          })
          .connectTimeout(request.connectTimeoutMs, TimeUnit.MILLISECONDS)
          .readTimeout(request.connectTimeoutMs, TimeUnit.MILLISECONDS)
          .build()
        val call = requestClient.newCall(Request.Builder().url(current).get().build())
        if (activeCalls.putIfAbsent(request.operationId, call) != null) {
          fail("ARTIFACT_TRANSFER_ACTIVE")
        }
        val response = try {
          call.execute()
        } catch (error: SocketTimeoutException) {
          if (call.isCanceled() || cancelledOperations.contains(request.operationId)) fail("ARTIFACT_CANCELLED", cause = error)
          fail("ARTIFACT_CONNECT_TIMEOUT", true, error)
        } catch (error: IOException) {
          if (call.isCanceled() || cancelledOperations.contains(request.operationId)) fail("ARTIFACT_CANCELLED", cause = error)
          fail("ARTIFACT_HTTP_RETRYABLE", true, error)
        }
        if (isRedirect(response.code)) {
          val location = response.header("Location")
          response.close()
          activeCalls.remove(request.operationId, call)
          if (redirects >= MAX_REDIRECTS) fail("ARTIFACT_REDIRECT_LIMIT")
          if (location == null) fail("ARTIFACT_REDIRECT_INVALID")
          val redirected = try {
            URI(current).resolve(location).toString()
          } catch (error: Exception) {
            fail("ARTIFACT_REDIRECT_INVALID", cause = error)
          }
          current = validator(redirected, request)
          redirects += 1
          continue
        }
        response.use { open ->
          if (!open.isSuccessful) {
            val retryable = open.code == 408 || open.code == 429 || open.code >= 500
            fail(if (retryable) "ARTIFACT_HTTP_RETRYABLE" else "ARTIFACT_HTTP_REJECTED", retryable)
          }
          val responseMime = mime(open)
          val accepted = request.acceptedMimes.map { it.trim().lowercase() }.toSet()
          if (responseMime.isEmpty() || responseMime !in accepted) fail("ARTIFACT_MIME_REJECTED")
          val body = open.body ?: fail("ARTIFACT_INTEGRITY_FAILED")
          val declaredSize = body.contentLength()
          if (declaredSize > request.maxBytes) fail("ARTIFACT_SIZE_REJECTED")
          body.source().timeout().timeout(request.idleTimeoutMs, TimeUnit.MILLISECONDS)

          val digest = MessageDigest.getInstance("SHA-256")
          var byteSize = 0L
          var lastProgressAt = clock()
          var lastProgressBytes = 0L
          try {
            body.byteStream().use { input ->
              part.outputStream().buffered(BUFFER_BYTES).use { output ->
                val buffer = ByteArray(BUFFER_BYTES)
                while (true) {
                  val count = try {
                    input.read(buffer)
                  } catch (error: SocketTimeoutException) {
                    if (call.isCanceled() || cancelledOperations.contains(request.operationId)) {
                      fail("ARTIFACT_CANCELLED", cause = error)
                    }
                    fail("ARTIFACT_IDLE_TIMEOUT", true, error)
                  } catch (error: IOException) {
                    if (call.isCanceled() || cancelledOperations.contains(request.operationId)) {
                      fail("ARTIFACT_CANCELLED", cause = error)
                    }
                    fail("ARTIFACT_HTTP_RETRYABLE", true, error)
                  }
                  if (count < 0) break
                  if (count == 0) continue
                  if (byteSize > request.maxBytes - count) fail("ARTIFACT_SIZE_REJECTED")
                  output.write(buffer, 0, count)
                  digest.update(buffer, 0, count)
                  byteSize += count
                  val now = clock()
                  if (now - lastProgressAt >= 1_000 || byteSize - lastProgressBytes >= PROGRESS_BYTES) {
                    onProgress(byteSize)
                    lastProgressAt = now
                    lastProgressBytes = byteSize
                  }
                }
                output.flush()
              }
            }
          } finally {
            activeCalls.remove(request.operationId, call)
          }
          if (byteSize <= 0 || (declaredSize >= 0 && byteSize != declaredSize)) fail("ARTIFACT_INTEGRITY_FAILED")
          val streamedSha = digest.digest().joinToString("") { "%02x".format(it) }
          if (request.expectedSha256 != null && streamedSha != request.expectedSha256) {
            fail("ARTIFACT_SHA_MISMATCH")
          }
          val partUri = part.toURI().toString()
          val durableSha = durableSha256(partUri)
          if (durableSha != streamedSha) fail("ARTIFACT_DURABLE_SHA_MISMATCH")
          return ArtifactTransferResult(partUri, current, responseMime, byteSize, streamedSha)
        }
      }
    } catch (error: ArtifactTransferException) {
      part.delete()
      throw error
    } catch (error: Exception) {
      part.delete()
      fail("ARTIFACT_TRANSFER_FAILED", cause = error)
    } finally {
      activeCalls.remove(request.operationId)
      cancelledOperations.remove(request.operationId)
    }
  }
}
