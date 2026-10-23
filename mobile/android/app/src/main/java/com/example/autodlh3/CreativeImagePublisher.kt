package com.example.autodlh3

import java.io.InputStream

/** Stable publication identity is independent from user-supplied image titles. */
class CreativeImagePublisher(
  private val gateway: MediaStoreGateway,
  private val relativePath: String = "Pictures/AutoDL-H3/",
  private val sourceOpener: (String) -> InputStream,
) {
  private fun name(key: String, mime: String): String {
    require(Regex("[a-f0-9]{64}").matches(key)) { "Invalid publication key" }
    val extension = when (mime) {
      "image/png" -> "png"; "image/jpeg" -> "jpg"; "image/webp" -> "webp"
      "video/mp4" -> "mp4"; "video/webm" -> "webm"
      "audio/mpeg" -> "mp3"; "audio/mp4" -> "m4a"; "audio/wav" -> "wav"; "audio/ogg" -> "ogg"
      "text/plain" -> "txt"; "text/markdown" -> "md"; "application/json" -> "json"; "application/pdf" -> "pdf"
      else -> throw IllegalArgumentException("Unsupported creative file type")
    }
    return "creative-$key.$extension"
  }
  fun lookup(key: String, mime: String, hash: String): String? {
    require(Regex("[a-f0-9]{64}").matches(hash)) { "Invalid content hash" }
    return gateway.query(name(key, mime), relativePath).firstOrNull { entry ->
      !entry.pending && gateway.openInput(entry.uri)?.use(MediaIntegrity::sha256) == hash
    }?.uri
  }
  @Synchronized fun publish(source: String, key: String, mime: String, hash: String): String {
    val displayName = name(key, mime)
    require(sourceOpener(source).use(MediaIntegrity::sha256) == hash) { "Image hash mismatch" }
    lookup(key, mime, hash)?.let { return it }
    // An existing unmatched or incomplete publication is ambiguous, never delete it.
    check(gateway.query(displayName, relativePath).isEmpty()) { "Publication requires reconciliation" }
    val target = gateway.insert(displayName, mime, relativePath)
    try {
      gateway.openOutput(target).use { output ->
        requireNotNull(output) { "Image destination unavailable" }
        sourceOpener(source).use { it.copyTo(output) }
      }
      check(gateway.openInput(target)?.use(MediaIntegrity::sha256) == hash) { "Published image hash mismatch" }
      gateway.finalize(target)
      return target
    } catch (error: Exception) {
      runCatching { gateway.delete(target) }
      throw error
    }
  }
}
