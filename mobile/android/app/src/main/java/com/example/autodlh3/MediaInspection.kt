package com.example.autodlh3

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class MediaInspection(private val context:Context) {
 fun inspect(source:String,expectedHash:String,kind:String):String {
  val uri=Uri.parse(source);require(uri.scheme=="file"&&uri.authority.isNullOrEmpty())
  val file=File(requireNotNull(uri.path)).canonicalFile
  require(file.toPath().startsWith(context.filesDir.canonicalFile.toPath())&&file.isFile&&file.length()<=100L*1024*1024)
  require(MediaIntegrity(context).sha256(source)==expectedHash) { "INSPECTION_SOURCE_CHANGED" }
  val folder=File(context.cacheDir,"media-inspections");folder.mkdirs()
  folder.listFiles()?.filter { System.currentTimeMillis()-it.lastModified()>86400000 }?.forEach { it.delete() }
  val frames=JSONArray();val result=JSONObject().put("kind",kind).put("sha256",expectedHash).put("byteSize",file.length()).put("frames",frames)
  fun save(bitmap:Bitmap,time:Long){
   val scale=minOf(1.0,1024.0/maxOf(bitmap.width,bitmap.height));val width=maxOf(1,(bitmap.width*scale).toInt());val height=maxOf(1,(bitmap.height*scale).toInt())
   val reduced=Bitmap.createScaledBitmap(bitmap,width,height,true)
   val frame=File(folder,"$expectedHash-$time.jpg");frame.outputStream().use { require(reduced.compress(Bitmap.CompressFormat.JPEG,80,it)) }
   frames.put(JSONObject().put("timestampMs",time).put("uri",Uri.fromFile(frame).toString()).put("width",width).put("height",height))
   if(reduced!==bitmap)reduced.recycle();bitmap.recycle()
  }
  if(kind=="image"){
   val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true };BitmapFactory.decodeFile(file.absolutePath,bounds)
   require(bounds.outWidth>0&&bounds.outHeight>0) { "INSPECTION_IMAGE_INVALID" }
   result.put("width",bounds.outWidth).put("height",bounds.outHeight)
   var sample=1;while(maxOf(bounds.outWidth,bounds.outHeight)/sample>2048)sample*=2
   save(requireNotNull(BitmapFactory.decodeFile(file.absolutePath,BitmapFactory.Options().apply { inSampleSize=sample })),0)
  }else{
   require(kind=="video"||kind=="audio")
   val probe=MediaMetadataRetriever()
   try{
    probe.setDataSource(file.absolutePath)
    val duration=probe.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?:0
    require(duration>0) { "INSPECTION_DURATION_INVALID" };result.put("durationMs",duration)
    result.put("hasAudio",probe.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO)=="yes")
    if(kind=="video"){
     result.put("width",probe.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()?:0)
     result.put("height",probe.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()?:0)
     for(time in listOf(0L,duration/2,maxOf(0,duration-100)).distinct()){
      val bitmap=if(android.os.Build.VERSION.SDK_INT>=27)probe.getScaledFrameAtTime(time*1000,MediaMetadataRetriever.OPTION_CLOSEST,1024,1024) else probe.getFrameAtTime(time*1000,MediaMetadataRetriever.OPTION_CLOSEST)
      save(requireNotNull(bitmap) { "INSPECTION_FRAME_UNAVAILABLE" },time)
     }
    }
   }finally{probe.release()}
  }
  return result.toString()
 }
}
