package com.example.autodlh3
import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class TimelinePackage(private val context:Context){
 fun create(request:String):String{
  val input=JSONObject(request);val manifest=input.getJSONObject("manifest");val files=input.getJSONArray("files")
  require(manifest.getString("format")=="autodl-timeline"&&manifest.getInt("version")==1&&files.length() in 1..21)
  require(manifest.toString().length<=200000)
  val entries=mutableMapOf<String,File>();var total=0L
  for(i in 0 until files.length()){
   val entry=files.getJSONObject(i);val hash=entry.getString("sha256");require(hash.matches(Regex("[a-f0-9]{64}")))
   val uri=Uri.parse(entry.getString("uri"));require(uri.scheme=="file"&&uri.authority.isNullOrEmpty())
   val file=File(requireNotNull(uri.path)).canonicalFile;require(file.toPath().startsWith(context.filesDir.canonicalFile.toPath())&&file.isFile)
   if(!entries.containsKey(hash)){entries[hash]=file;total+=file.length()}
  }
  require(total in 1..94371840) { "PACKAGE_LIMIT_90MB" }
  require(context.cacheDir.usableSpace>total+32*1024*1024) { "PACKAGE_SPACE_REQUIRED" }
  val folder=File(context.cacheDir,"timeline-packages");folder.mkdirs();folder.listFiles()?.filter{System.currentTimeMillis()-it.lastModified()>86400000}?.forEach{it.delete()}
  val output=File.createTempFile("timeline-",".zip",folder)
  try{
   ZipOutputStream(output.outputStream()).use { zip ->
    zip.putNextEntry(ZipEntry("manifest.json"));zip.write(manifest.toString(2).toByteArray(Charsets.UTF_8));zip.closeEntry()
    for((hash,file) in entries){
     zip.putNextEntry(ZipEntry("media/$hash"));val digest=MessageDigest.getInstance("SHA-256");var bytes=0L
     file.inputStream().use{stream->val buffer=ByteArray(65536);while(true){check(!Thread.currentThread().isInterrupted);val count=stream.read(buffer);if(count<0)break;bytes+=count;require(bytes<=94371840);digest.update(buffer,0,count);zip.write(buffer,0,count)}}
     require(digest.digest().joinToString(""){"%02x".format(it)}==hash) { "PACKAGE_SOURCE_CHANGED" };zip.closeEntry()
    }
   }
   return Uri.fromFile(output).toString()
  }catch(e:Exception){output.delete();throw e}
 }
}
