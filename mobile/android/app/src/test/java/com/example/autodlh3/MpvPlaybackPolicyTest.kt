package com.example.autodlh3

import org.junit.Assert.*
import org.junit.Test

class MpvPlaybackPolicyTest {
  @Test fun remoteBufferingDoesNotConsumeTheLocalWatchdog() {
    assertTrue(MpvPlaybackPolicy.usesFirstFrameDeadline("file"))
    assertTrue(MpvPlaybackPolicy.usesFirstFrameDeadline("content"))
    assertFalse(MpvPlaybackPolicy.usesFirstFrameDeadline("https"))
    assertFalse(MpvPlaybackPolicy.usesFirstFrameDeadline("http"))
    val deadline = MpvFirstFrameDeadline(15_000)
    assertFalse(deadline.update(0, MpvPlaybackPolicy.usesFirstFrameDeadline("https")))
    assertFalse(deadline.update(120_000, MpvPlaybackPolicy.usesFirstFrameDeadline("https")))
  }

  @Test fun deadlineSaturatesAfterRepeatedTimeoutAndPause() {
    val deadline = MpvFirstFrameDeadline(15_000)
    deadline.update(0, true)
    assertTrue(deadline.update(Long.MAX_VALUE, true))
    assertFalse(deadline.update(Long.MAX_VALUE, false))
    assertTrue(deadline.update(Long.MAX_VALUE, true))
  }

  @Test fun decodingPreferencesStayWithinOneEngine() {
    assertEquals("auto", MpvPlaybackPolicy.hardwareDecoder("auto"))
    assertEquals("no", MpvPlaybackPolicy.hardwareDecoder("software"))
    assertEquals("auto", MpvPlaybackPolicy.hardwareDecoder("hardware"))
    assertTrue(MpvPlaybackPolicy.rejectSoftware("hardware", "no"))
    assertFalse(MpvPlaybackPolicy.rejectSoftware("auto", "no"))
    assertFalse(MpvPlaybackPolicy.rejectSoftware("hardware", null))
    assertFalse(MpvPlaybackPolicy.rejectSoftware("hardware", "mediacodec-copy"))
  }
  @Test fun positionsRejectInvalidNumbersAndClampToDuration() {
    assertEquals(0, MpvPlaybackPolicy.positionMs(Double.NaN))
    assertEquals(0, MpvPlaybackPolicy.positionMs(-10.0))
    assertEquals(1250, MpvPlaybackPolicy.positionMs(1.25))
    assertEquals(5000, MpvPlaybackPolicy.seekPositionMs(9000, 5000))
    assertEquals(9000, MpvPlaybackPolicy.seekPositionMs(9000, -1))
  }

  @Test fun replacedSourceEndCannotTerminateSourceThatIsStillOpeningOrPlaying() {
    assertNull(MpvPlaybackPolicy.terminalEvent(awaitingStart = true, loaded = false, eof = false, idle = true))
    assertNull(MpvPlaybackPolicy.terminalEvent(awaitingStart = false, loaded = true, eof = false, idle = false))
    assertNull(MpvPlaybackPolicy.terminalEvent(awaitingStart = false, loaded = false, eof = false, idle = false))
  }

  @Test fun endRequiresEofEvidenceAndIdleFailureDistinguishesOpeningFromDecoding() {
    assertEquals("ended", MpvPlaybackPolicy.terminalEvent(awaitingStart = false, loaded = true, eof = true, idle = false))
    assertEquals("sourceUnavailable", MpvPlaybackPolicy.terminalEvent(awaitingStart = false, loaded = false, eof = false, idle = true))
    assertEquals("decodeFailed", MpvPlaybackPolicy.terminalEvent(awaitingStart = false, loaded = true, eof = false, idle = true))
  }

  @Test fun firstFrameDeadlineConsumesOnlyForegroundAttachedPlaybackTime() {
    val deadline = MpvFirstFrameDeadline(15_000)
    assertFalse(deadline.update(1_000, active = true))
    assertFalse(deadline.update(6_000, active = false))
    assertFalse(deadline.update(80_000, active = false))
    assertFalse(deadline.update(90_000, active = true))
    assertFalse(deadline.update(99_999, active = true))
    assertTrue(deadline.update(100_000, active = true))
    deadline.reset()
    assertFalse(deadline.update(200_000, active = true))
  }
}
