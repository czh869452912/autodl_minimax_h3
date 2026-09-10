package com.example.autodlh3

/** Pure policy shared by the native adapter and its JVM regression tests. */
internal object MpvPlaybackPolicy {
  fun usesFirstFrameDeadline(scheme: String?): Boolean = scheme == null || scheme == "file" || scheme == "content"

  fun hardwareDecoder(mode: String): String = if (mode == "software") "no" else "auto"

  fun rejectSoftware(mode: String, actualDecoder: String?): Boolean =
    mode == "hardware" && actualDecoder == "no"

  fun positionMs(seconds: Double): Long =
    if (!seconds.isFinite() || seconds <= 0) 0L else (seconds * 1000).toLong()

  fun seekPositionMs(positionMs: Long, durationMs: Long): Long =
    positionMs.coerceAtLeast(0L).let { if (durationMs >= 0L) it.coerceAtMost(durationMs) else it }

  /** END_FILE has no reason/error payload in the Android bridge; require independent evidence. */
  fun terminalEvent(awaitingStart: Boolean, loaded: Boolean, eof: Boolean, idle: Boolean): String? = when {
    awaitingStart -> null
    loaded && eof -> "ended"
    !idle -> null
    loaded -> "decodeFailed"
    else -> "sourceUnavailable"
  }
}

internal class MpvFirstFrameDeadline(private val limitMs: Long) {
  init { require(limitMs > 0) }
  private var elapsed = 0L
  private var activeSince: Long? = null

  fun reset() { elapsed = 0; activeSince = null }

  fun update(nowMs: Long, active: Boolean): Boolean {
    activeSince?.let { elapsed += (nowMs - it).coerceAtLeast(0).coerceAtMost(limitMs - elapsed) }
    activeSince = nowMs.takeIf { active }
    return active && elapsed >= limitMs
  }
}
