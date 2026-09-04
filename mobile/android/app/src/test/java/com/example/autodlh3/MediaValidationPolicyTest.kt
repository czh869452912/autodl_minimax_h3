package com.example.autodlh3

import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

  @Test fun validatesLengthPrefixedAndAnnexBNalFraming() {
    val lengthPrefixed = byteArrayOf(0, 0, 0, 2, 0x65, 1, 0, 0, 0, 1, 0x41)
    val annexB = byteArrayOf(0, 0, 0, 1, 0x65, 1, 0, 0, 1, 0x41, 2)
    assertTrue(NalUnitPolicy.isValid(ByteBuffer.wrap(lengthPrefixed), lengthPrefixed.size, 4))
    assertTrue(NalUnitPolicy.isValid(ByteBuffer.wrap(annexB), annexB.size, 4))
  }

  @Test fun rejectsNalLengthsThatEscapeTheSample() {
    val oversized = byteArrayOf(0, 0, 0, 8, 0x65)
    val empty = byteArrayOf(0, 0, 0, 0)
    assertFalse(NalUnitPolicy.isValid(ByteBuffer.wrap(oversized), oversized.size, 4))
    assertFalse(NalUnitPolicy.isValid(ByteBuffer.wrap(empty), empty.size, 4))
  }
}
