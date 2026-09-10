package com.example.autodlh3

import org.junit.Assert.*
import org.junit.Test

class VideoEncodingPlanTest {
  @Test fun portraitSampleKeepsItsOriginalDimensions() {
    assertEquals(768 to 1344, VideoEncodingPlans.dimensions(768.0, 1344.0, 1920, 1080, 16, 16))
  }
  @Test fun encoderAlignmentAddsCanvasWithoutStretchingOrExceedingBounds() {
    val (w, h) = VideoEncodingPlans.dimensions(2160.0, 3840.0, 1920, 1080, 16, 16)
    assertEquals(0, w % 16); assertEquals(0, h % 16)
    assertTrue(w <= 1080); assertTrue(h <= 1920)
    assertTrue(w.toDouble() / h >= 2160.0 / 3840 - 0.02)
  }
  @Test fun diagnosticsRemoveSignedUrlsAndLocalPaths() {
    val text = CompatibilityDiagnostics.sanitize("failed https://cdn.test/a.mp4?X-Tos-Signature=secret /data/user/0/private/file.mp4 C:\\private\\file.mp4\nencoder BAD_VALUE")
    assertFalse(text.contains("secret")); assertFalse(text.contains("private")); assertFalse(text.contains("cdn.test"))
    assertTrue(text.contains("BAD_VALUE")); assertTrue(CompatibilityDiagnostics.sanitize("x".repeat(5000)).length <= 2048)
  }
}
