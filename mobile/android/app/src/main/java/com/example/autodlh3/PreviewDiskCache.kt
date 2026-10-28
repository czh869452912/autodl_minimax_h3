package com.example.autodlh3

import java.io.File
import java.security.MessageDigest

/** Rebuildable previews only; never traverses the original/CAS directory. */
internal class PreviewDiskCache(private val directory: File, private val maxBytes: Long = 64L * 1024 * 1024, private val maxFiles: Int = 512) {
  fun file(source: String, key: String, extension: String): File {
    directory.mkdirs()
    val hash = MessageDigest.getInstance("SHA-256").digest((key + "\n" + source).toByteArray()).joinToString("") { "%02x".format(it) }
    return File(directory, "v1-$hash.$extension")
  }
  @Synchronized fun trim(keep: File) {
    val files = directory.listFiles()?.filter { it.isFile && it.name.startsWith("v1-") && !it.name.endsWith(".part") }?.sortedBy { it.lastModified() } ?: return
    var bytes = files.sumOf { it.length() }; var count = files.size
    for (file in files) {
      if (bytes <= maxBytes && count <= maxFiles) break
      if (file == keep) continue
      val length = file.length()
      if (file.delete()) { bytes -= length; count-- }
    }
  }
  companion object {
    fun sampleSize(width: Int, height: Int, edge: Int = 640): Int {
      require(width > 0 && height > 0 && edge > 0)
      var sample = 1
      while (maxOf(width, height).toLong() / sample > edge.toLong() * 2) sample *= 2
      return sample
    }
  }
}
