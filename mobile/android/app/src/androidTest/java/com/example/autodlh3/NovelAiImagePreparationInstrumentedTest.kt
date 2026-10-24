package com.example.autodlh3

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class NovelAiImagePreparationInstrumentedTest {
  private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
  private fun decode(value: String): Bitmap { val bytes=Base64.decode(value, Base64.DEFAULT); return BitmapFactory.decodeByteArray(bytes,0,bytes.size) }
  @Test fun maskKeepsUnpaintedPixelsBlackAndPaintsExactNormalizedCenter() {
    val result=decode(NovelAiImagePreparation(context.filesDir).prepare("",128,256,true,"""[{"radius":0.1,"points":[{"x":0.25,"y":0.75}]}]"""))
    try { assertEquals(Color.WHITE,result.getPixel(32,192)); assertEquals(Color.BLACK,result.getPixel(32,160)); assertEquals(Color.BLACK,result.getPixel(110,230)); assertEquals(128,result.width); assertEquals(256,result.height) } finally { result.recycle() }
  }
  @Test fun sourceRemainsImmutableAndAlphaSurvivesNormalization() {
    val file=File(context.filesDir,"nai-${UUID.randomUUID()}.png")
    val original=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888).apply { eraseColor(Color.TRANSPARENT); setPixel(32,32,Color.RED) }
    file.outputStream().use { original.compress(Bitmap.CompressFormat.PNG,100,it) }; original.recycle()
    val before=file.readBytes()
    try { val bitmap=decode(NovelAiImagePreparation(context.filesDir).prepare(Uri.fromFile(file).toString(),128,128,false,"[]")); try { assertEquals(0,Color.alpha(bitmap.getPixel(0,0))); assertTrue(Color.red(bitmap.getPixel(64,64))>200); assertArrayEquals(before,file.readBytes()) } finally { bitmap.recycle() } } finally { file.delete() }
  }
  @Test fun privateBoundaryAndInvalidMasksFailBeforeRequest() {
    val prep=NovelAiImagePreparation(context.filesDir)
    assertThrows(IllegalArgumentException::class.java) { prep.prepare("file:///sdcard/untrusted.png",128,128,false,"[]") }
    assertThrows(IllegalArgumentException::class.java) { prep.prepare("",2048,2048,true,"[]") }
    assertThrows(IllegalArgumentException::class.java) { prep.prepare("",128,128,true,"""[{"radius":0.1,"points":[{"x":2,"y":0.5}]}]""") }
    assertThrows(IllegalArgumentException::class.java) { prep.prepare("",128,128,true,"[]") }
  }
  @Test fun webpOfficialDownloadMetadataCanBeReadWhenFixtureIsPresent() {
    val file=File(context.filesDir,"novelai-official-metadata.webp")
    org.junit.Assume.assumeTrue("Optional real official download fixture",file.exists())
    val metadata=CreativeImageMetadata.read { file.inputStream() }
    assertEquals("NovelAI",metadata["Software"])
    assertTrue(metadata["Source"]!!.contains("NovelAI Diffusion V5"))
    assertTrue(org.json.JSONObject(metadata["Comment"]!!).has("v4_prompt"))
  }

  @Test fun phoneJpegOrientationIsAppliedBeforeResizing() {
    val file=File(context.filesDir,"nai-oriented-${UUID.randomUUID()}.jpg")
    val bitmap=Bitmap.createBitmap(128,64,Bitmap.Config.ARGB_8888)
    val canvas=android.graphics.Canvas(bitmap);canvas.drawColor(Color.BLUE);canvas.drawRect(0f,0f,64f,64f,android.graphics.Paint().apply {color=Color.RED})
    file.outputStream().use {bitmap.compress(Bitmap.CompressFormat.JPEG,100,it)};bitmap.recycle()
    try {
      android.media.ExifInterface(file.path).apply {setAttribute(android.media.ExifInterface.TAG_ORIENTATION,"6");saveAttributes()}
      val result=decode(NovelAiImagePreparation(context.filesDir).prepare(Uri.fromFile(file).toString(),64,128,false,"[]"))
      try {assertTrue(Color.red(result.getPixel(32,20))>220);assertTrue(Color.blue(result.getPixel(32,100))>220)} finally {result.recycle()}
    } finally {file.delete()}
  }
}
