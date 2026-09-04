package com.example.autodlh3

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaValidationPolicyTest {
  @Test fun acceptsAPlayableProbe() {
    assertNull(MediaValidationPolicy.errorCode(VideoProbeResult(1_000, 1, 3, 3)))
  }

  @Test fun mapsInvalidProbeDimensionsToStableCodes() {
    assertEquals("MEDIA_NO_VIDEO_TRACK", MediaValidationPolicy.errorCode(VideoProbeResult(1_000, 0, 3, 3)))
    assertEquals("MEDIA_DURATION_INVALID", MediaValidationPolicy.errorCode(VideoProbeResult(0, 1, 3, 3)))
    assertEquals("MEDIA_SAMPLE_INVALID", MediaValidationPolicy.errorCode(VideoProbeResult(1_000, 1, 3, 0)))
    assertEquals("MEDIA_DECODE_FAILED", MediaValidationPolicy.errorCode(VideoProbeResult(1_000, 1, 2, 3)))
  }
}
