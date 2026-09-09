package com.example.autodlh3

import android.media.MediaCodecInfo.CodecProfileLevel
import java.nio.ByteBuffer

/** Read profile_idc only from an Annex-B SPS; leave unfamiliar CSD to the extractor. */
object AvcProfilePolicy {
  fun profile(csd: ByteBuffer?): Int? {
    if (csd == null) return null
    val data = csd.duplicate()
    for (offset in data.position() until data.limit() - 4) {
      if (data.get(offset).toInt() != 0 || data.get(offset + 1).toInt() != 0) continue
      val prefix = if (data.get(offset + 2).toInt() == 1) 3
        else if (data.get(offset + 2).toInt() == 0 && data.get(offset + 3).toInt() == 1) 4 else continue
      val nal = offset + prefix
      if (nal + 1 >= data.limit() || (data.get(nal).toInt() and 0x1f) != 7) continue
      return when (data.get(nal + 1).toInt() and 0xff) {
        66 -> CodecProfileLevel.AVCProfileBaseline
        77 -> CodecProfileLevel.AVCProfileMain
        88 -> CodecProfileLevel.AVCProfileExtended
        100 -> CodecProfileLevel.AVCProfileHigh
        110 -> CodecProfileLevel.AVCProfileHigh10
        122 -> CodecProfileLevel.AVCProfileHigh422
        244 -> CodecProfileLevel.AVCProfileHigh444
        else -> null
      }
    }
    return null
  }
}
