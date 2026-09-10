package com.example.autodlh3

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import kotlin.math.ceil
import kotlin.math.min

internal data class VideoEncodingPlan(val codecName: String, val width: Int, val height: Int, val bitrate: Int) {
  // Scale display aspect ratio into the encoder's aligned canvas; pad, never stretch.
  val filter: String get() = "scale=w='trunc(min($width,$height*dar)/2)*2':h='trunc(min($height,$width/dar)/2)*2'," +
    "setsar=1,pad=$width:$height:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
}

internal object VideoEncodingPlans {
  fun dimensions(width: Double, height: Double, longEdge: Int, shortEdge: Int, alignW: Int, alignH: Int): Pair<Int, Int> {
    require(width.isFinite() && height.isFinite() && width >= 2 && height >= 2 && alignW > 0 && alignH > 0)
    val maxW = if (width >= height) longEdge else shortEdge
    val maxH = if (width >= height) shortEdge else longEdge
    val limitW = maxW / alignW * alignW
    val limitH = maxH / alignH * alignH
    val scale = min(1.0, min(limitW / width, limitH / height))
    return (ceil(width * scale / alignW).toInt() * alignW).coerceAtMost(limitW) to
      (ceil(height * scale / alignH).toInt() * alignH).coerceAtMost(limitH)
  }

  fun candidates(width: Double, height: Double, frameRate: Double): List<VideoEncodingPlan> {
    val plans = mutableListOf<VideoEncodingPlan>()
    val codecs = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.filter { it.isEncoder && MediaFormat.MIMETYPE_VIDEO_AVC in it.supportedTypes }
    for ((longEdge, shortEdge) in listOf(1920 to 1080, 1280 to 720)) {
      for (codec in codecs) {
        try {
          val caps = codec.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC)
          val video = caps.videoCapabilities ?: continue
          val (w, h) = dimensions(width, height, longEdge, shortEdge, maxOf(2, video.widthAlignment), maxOf(2, video.heightAlignment))
          if (w < 2 || h < 2 || !video.areSizeAndRateSupported(w, h, frameRate)) continue
          val bitrate = video.bitrateRange.clamp(4_000_000)
          val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
            setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline)
            setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
            setFloat(MediaFormat.KEY_FRAME_RATE, frameRate.toFloat())
          }
          if (caps.isFormatSupported(format)) plans += VideoEncodingPlan(codec.name, w, h, bitrate)
        } catch (_: Exception) { /* A vendor's capability query can fail; try another codec. */ }
      }
    }
    return plans.distinct().take(3)
  }
}
