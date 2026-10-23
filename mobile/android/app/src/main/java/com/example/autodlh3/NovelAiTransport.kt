package com.example.autodlh3

import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/** A persisted send marker is never retried. A completed body can be re-imported offline. */
class NovelAiTransport(
  private val root: File,
  private val client: OkHttpClient = OkHttpClient.Builder().retryOnConnectionFailure(false)
    .followRedirects(false).followSslRedirects(false).connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(180, TimeUnit.SECONDS).callTimeout(240, TimeUnit.SECONDS).build(),
  private val endpoint: String = "https://image.novelai.net/ai/generate-image",
) {
  companion object { const val MAX_BODY = 20L * 1024L * 1024L }
  private fun directory(key: String): File {
    require(key.matches(Regex("[a-f0-9]{64}"))) { "NOVELAI_KEY_INVALID" }
    return File(root, key).also { require(it.mkdirs() || it.isDirectory) { "NOVELAI_STORAGE_UNAVAILABLE" } }
  }
  private fun hash(value: ByteArray) = MessageDigest.getInstance("SHA-256").digest(value).joinToString("") { "%02x".format(it) }
  @Synchronized fun lookup(key: String, requestHash: String): File? {
    require(requestHash.matches(Regex("[a-f0-9]{64}")))
    val dir = directory(key); val marker = File(dir, "sent")
    if (!marker.exists()) return null
    require(marker.readText() == requestHash) { "NOVELAI_REQUEST_CONFLICT" }
    val body = File(dir, "response.json"); val checksum = File(dir, "response.sha256")
    if (!body.isFile || !checksum.isFile) return null
    require(body.length() in 1..MAX_BODY && hash(body.readBytes()) == checksum.readText()) { "NOVELAI_RESPONSE_CORRUPT" }
    return body
  }
  @Synchronized fun generate(key: String, requestJson: String, requestHash: String, token: String): File {
    require(requestJson.toByteArray().size <= 256 * 1024 && hash(requestJson.toByteArray()) == requestHash) { "NOVELAI_REQUEST_INVALID" }
    lookup(key, requestHash)?.let { return it }
    require(token.length in 8..4096 && !token.contains('\n') && !token.contains('\r')) { "NOVELAI_CREDENTIAL_INVALID" }
    val dir = directory(key); val marker = File(dir, "sent")
    // Atomic across module instances/processes. An empty marker after a crash also
    // closes the send gate; it must never be overwritten by another worker.
    check(marker.createNewFile()) { "NOVELAI_OUTCOME_UNKNOWN" }
    // Commit before opening the HTTP connection; even auth/transport errors do not replay.
    FileOutputStream(marker).use { it.write(requestHash.toByteArray()); it.fd.sync() }
    val request = Request.Builder().url(endpoint).header("Authorization", "Bearer $token")
      .header("Accept", "application/json").post(requestJson.toRequestBody("application/json".toMediaType())).build()
    client.newCall(request).execute().use { response ->
      check(response.isSuccessful) { "NOVELAI_HTTP_${response.code}" }
      check(response.header("Content-Type", "")!!.substringBefore(';').trim() == "application/json") { "NOVELAI_RESPONSE_TYPE_UNSUPPORTED" }
      val body = requireNotNull(response.body)
      check(body.contentLength() <= MAX_BODY) { "NOVELAI_RESPONSE_TOO_LARGE" }
      val part = File(dir, "response.part")
      val digest = MessageDigest.getInstance("SHA-256")
      try {
        body.byteStream().use { source -> FileOutputStream(part).use { dest ->
          val buffer = ByteArray(8192); var total = 0L
          while (true) { val count = source.read(buffer); if (count < 0) break; total += count
            check(total <= MAX_BODY) { "NOVELAI_RESPONSE_TOO_LARGE" }; digest.update(buffer, 0, count); dest.write(buffer, 0, count) }
          check(total > 0) { "NOVELAI_RESPONSE_EMPTY" }; dest.fd.sync()
        } }
        val published = File(dir, "response.json")
        check(part.renameTo(published)) { "NOVELAI_RESPONSE_PUBLISH_FAILED" }
        val checksum = File(dir, "response.sha256")
        FileOutputStream(checksum).use { it.write(digest.digest().joinToString("") { b -> "%02x".format(b) }.toByteArray()); it.fd.sync() }
        return published
      } finally { part.delete() }
    }
  }
}
