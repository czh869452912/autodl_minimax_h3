package com.example.autodlh3

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import java.io.RandomAccessFile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MediaIntegrityInstrumentedTest {
  private fun corruptFirstNalLength(source: File, target: File) {
    source.copyTo(target, overwrite = true)
    RandomAccessFile(target, "rw").use { file ->
      var offset = 0L
      while (offset + 8 <= file.length()) {
        file.seek(offset)
        val size32 = file.readInt().toLong() and 0xffff_ffffL
        val type = ByteArray(4).also(file::readFully).decodeToString()
        val headerSize = if (size32 == 1L) 16L else 8L
        val atomSize = when {
          size32 == 0L -> file.length() - offset
          size32 == 1L -> file.readLong()
          else -> size32
        }
        check(atomSize >= headerSize && offset + atomSize <= file.length())
        if (type == "mdat") {
          file.seek(offset + headerSize)
          file.writeInt(Int.MAX_VALUE)
          return
        }
        offset += atomSize
      }
      error("fixture does not contain mdat")
    }
  }

  private fun createAvcFixture(file: File) {
    val width = 64
    val height = 64
    val frameRate = 3
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
      setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var trackIndex = -1
    var muxerStarted = false
    val info = MediaCodec.BufferInfo()
    codec.start()

    fun drain(waitForEos: Boolean): Boolean {
      while (true) {
        val outputIndex = codec.dequeueOutputBuffer(info, if (waitForEos) 10_000 else 0)
        when {
          outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> return false
          outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            trackIndex = muxer.addTrack(codec.outputFormat)
            muxer.start()
            muxerStarted = true
          }
          outputIndex >= 0 -> {
            val output = codec.getOutputBuffer(outputIndex) ?: throw IllegalStateException("encoder output missing")
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
            if (info.size > 0) {
              check(muxerStarted)
              output.position(info.offset)
              output.limit(info.offset + info.size)
              muxer.writeSampleData(trackIndex, output, info)
            }
            val eos = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            codec.releaseOutputBuffer(outputIndex, false)
            if (eos) return true
          }
        }
      }
    }

    try {
      repeat(3) { frame ->
        val inputIndex = codec.dequeueInputBuffer(100_000)
        check(inputIndex >= 0)
        val input = codec.getInputBuffer(inputIndex) ?: throw IllegalStateException("encoder input missing")
        input.clear()
        val yuv = ByteArray(width * height * 3 / 2)
        java.util.Arrays.fill(yuv, 0, width * height, (48 + frame * 60).toByte())
        java.util.Arrays.fill(yuv, width * height, yuv.size, 128.toByte())
        input.put(yuv)
        codec.queueInputBuffer(inputIndex, 0, yuv.size, frame * 1_000_000L / frameRate, 0)
        drain(false)
      }
      val eosIndex = codec.dequeueInputBuffer(100_000)
      check(eosIndex >= 0)
      codec.queueInputBuffer(eosIndex, 0, 0, 1_000_000L, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      var eos = false
      repeat(200) { if (!eos) eos = drain(true) }
      check(eos)
    } finally {
      codec.stop()
      codec.release()
      if (muxerStarted) muxer.stop()
      muxer.release()
    }
  }

  private fun assertInvalid(integrity: MediaIntegrity, file: File) {
    try {
      integrity.probeVideo(file.toURI().toString())
      fail("expected MEDIA_INVALID for ${file.name}")
    } catch (error: MediaIntegrityException) {
      assertTrue(error.diagnosticCode.startsWith("MEDIA_"))
    }
  }

  @Test fun validatesGeneratedMp4AndRejectsMalformedNalTruncatedAndTextFiles() {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val directory = File(context.cacheDir, "media-integrity-test").apply { mkdirs() }
    val valid = File(directory, "valid.mp4")
    val truncated = File(directory, "truncated.mp4")
    val malformedNal = File(directory, "malformed-nal.mp4")
    val text = File(directory, "text.mp4")
    createAvcFixture(valid)
    val bytes = valid.readBytes()
    truncated.writeBytes(bytes.copyOf(maxOf(1, bytes.size / 2)))
    corruptFirstNalLength(valid, malformedNal)
    text.writeText("not an mp4")

    val integrity = MediaIntegrity(context)
    val result = integrity.probeVideo(valid.toURI().toString())
    assertEquals(1, result.videoTrackCount)
    assertTrue(result.durationMs > 0)
    assertTrue(result.sampleCount >= 3)
    assertEquals(3, result.decodedFrames)
    assertInvalid(integrity, malformedNal)
    assertInvalid(integrity, truncated)
    assertInvalid(integrity, text)
  }
}
