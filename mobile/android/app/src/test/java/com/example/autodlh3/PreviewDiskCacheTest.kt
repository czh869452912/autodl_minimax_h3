package com.example.autodlh3

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.io.File

class PreviewDiskCacheTest {
  @Test fun samplingBoundsLargeImageDecode() {
    for (edge in listOf(640, 1280, 4096, 16384, 65535)) {
      val sample = PreviewDiskCache.sampleSize(edge, edge / 2)
      assertTrue(edge / sample <= 1280)
      assertEquals(0, sample and (sample - 1))
    }
  }
  @Test fun trimOnlyEvictsOwnedCompletedPreviews() {
    val dir = Files.createTempDirectory("preview-test").toFile()
    try {
      val cache = PreviewDiskCache(dir, 100, 2)
      val original = File(dir, "original.png").apply { writeBytes(ByteArray(200)) }
      val pending = File(dir, "v1-pending.part").apply { writeBytes(ByteArray(200)) }
      val old = cache.file("source", "old", "png").apply { writeBytes(ByteArray(80)); setLastModified(1) }
      val current = cache.file("source", "new", "png").apply { writeBytes(ByteArray(80)) }
      cache.trim(current)
      assertFalse(old.exists()); assertTrue(current.exists()); assertTrue(original.exists()); assertTrue(pending.exists())
      assertEquals(current, cache.file("source", "new", "png"))
      assertNotEquals(current, cache.file("other", "new", "png"))
    } finally { dir.deleteRecursively() }
  }
}
