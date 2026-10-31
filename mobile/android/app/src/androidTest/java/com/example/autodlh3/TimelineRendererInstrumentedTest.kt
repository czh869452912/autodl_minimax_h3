package com.example.autodlh3

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.arthenica.ffmpegkit.FFprobeKit
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.ReturnCode
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TimelineRendererInstrumentedTest {
 private val context=ApplicationProvider.getApplicationContext<Context>()
 private fun fixture()=File.createTempFile("timeline-test-",".mp4",context.filesDir).also { file ->
  InstrumentationRegistry.getInstrumentation().context.assets.open("unified-tracks-test.mp4").use { from -> file.outputStream().use { from.copyTo(it) } }
 }
 private fun request(source:File):JSONObject {
  val hash=MediaIntegrity(context).sha256(source.toURI().toString())
  val clip=JSONObject().put("versionId","video").put("startMs",0).put("durationMs",500).put("caption","测试字幕")
  val spec=JSONObject().put("schemaVersion",1).put("orientation","portrait").put("clips",JSONArray().put(clip).put(JSONObject(clip.toString()).put("startMs",1000)))
   .put("audio",JSONObject().put("versionId","audio").put("startMs",0).put("volume",0.5))
  val inputs=JSONArray()
  for(id in listOf("video","audio"))inputs.put(JSONObject().put("version_id",id).put("blob_sha256",hash).put("uri",android.net.Uri.fromFile(source).toString()))
  return JSONObject().put("operationId","timeline-test").put("spec",spec).put("inputs",inputs)
 }
 @Test fun twoClipsWithAudioAndSubtitlesRenderLocallyAndPreserveSource() {
  val source=fixture();var output:File?=null
  try {
   val before=MediaIntegrity(context).sha256(source.toURI().toString())
   val uri=TimelineRenderer(context).render(request(source).toString());output=File(java.net.URI(uri))
   assertEquals(before,MediaIntegrity(context).sha256(source.toURI().toString()))
   assertEquals(3,MediaIntegrity(context).probeVideo(uri).decodedFrames)
   val streams=FFprobeKit.getMediaInformation(output.absolutePath).mediaInformation.streams
   assertEquals(setOf("video","audio","subtitle"),streams.map { it.type }.toSet())
   assertEquals("mov_text",streams.first { it.type=="subtitle" }.codec)
   assertEquals(720,streams.first { it.type=="video" }.width.toInt())
   assertEquals(1280,streams.first { it.type=="video" }.height.toInt())
  } finally { output?.parentFile?.deleteRecursively();source.delete() }
 }
 @Test fun localProbeProducesBoundedFramesAndAudioMetadataWithoutNetwork() {
  val source=fixture();val decoded=File.createTempFile("inspection-test-",".mp4",context.filesDir)
  try {
   assertTrue(ReturnCode.isSuccess(FFmpegKit.executeWithArguments(arrayOf("-v","error","-i",source.absolutePath,"-t","1","-c:v","mpeg4","-c:a","aac","-sn","-y",decoded.absolutePath)).returnCode))
   val hash=MediaIntegrity(context).sha256(decoded.toURI().toString())
   val inspection=JSONObject(MediaInspection(context).inspect(android.net.Uri.fromFile(decoded).toString(),hash,"video"))
   assertEquals(3,inspection.getJSONArray("frames").length());assertTrue(inspection.getLong("durationMs")>0);assertTrue(inspection.getBoolean("hasAudio"))
   val audio=JSONObject(MediaInspection(context).inspect(android.net.Uri.fromFile(decoded).toString(),hash,"audio"));assertEquals(0,audio.getJSONArray("frames").length())
   for(i in 0 until inspection.getJSONArray("frames").length())File(java.net.URI(inspection.getJSONArray("frames").getJSONObject(i).getString("uri"))).delete()
  } finally { decoded.delete();source.delete() }
 }
 @Test fun projectPackageContainsOnlyManifestAndVerifiedMedia() {
  val source=fixture();var output:File?=null
  try {
   val hash=MediaIntegrity(context).sha256(source.toURI().toString())
   val manifest=JSONObject().put("format","autodl-timeline").put("version",1).put("title","test")
   val files=JSONArray().put(JSONObject().put("sha256",hash).put("uri",android.net.Uri.fromFile(source).toString()))
   output=File(java.net.URI(TimelinePackage(context).create(JSONObject().put("manifest",manifest).put("files",files).toString())))
   java.util.zip.ZipFile(output).use { zip ->
    assertEquals(2,zip.size());assertNotNull(zip.getEntry("manifest.json"))
    val bytes=zip.getInputStream(zip.getEntry("media/"+hash)).readBytes();assertArrayEquals(source.readBytes(),bytes)
   }
  } finally { output?.delete();source.delete() }
 }
 @Test fun wrongHashAndOutOfBoundsTrimFailWithoutOutput() {
  val source=fixture()
  try {
   val wrong=request(source);wrong.getJSONArray("inputs").getJSONObject(0).put("blob_sha256","0".repeat(64))
   try { TimelineRenderer(context).render(wrong.toString());fail("hash accepted") } catch(e:IllegalArgumentException){ assertEquals("TIMELINE_SOURCE_CHANGED",e.message) }
   val trim=request(source);trim.getJSONObject("spec").getJSONArray("clips").getJSONObject(0).put("startMs",3600000)
   try { TimelineRenderer(context).render(trim.toString());fail("trim accepted") } catch(e:IllegalArgumentException){ assertEquals("TIMELINE_TRIM_OUT_OF_RANGE",e.message) }
  } finally { source.delete() }
 }
}
