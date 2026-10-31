package com.example.autodlh3

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.ReturnCode
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** App-private inputs only. No network, shell commands, or external publication. */
class TimelineRenderer(private val context: Context) {
  companion object { private val busy = AtomicBoolean(false) }
  @Volatile private var operation: String? = null
  @Volatile private var sessionId: Long? = null
  @Volatile private var cancelled = false
  fun cancel(id: String): Boolean {
    if (operation != id) return false
    cancelled = true
    sessionId?.let(FFmpegKit::cancel)
    return true
  }
  private fun check() { check(!cancelled && !Thread.currentThread().isInterrupted) { "TIMELINE_CANCELLED" } }
  private fun hash(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input -> val buffer = ByteArray(65536); while (true) { check(); val n=input.read(buffer); if(n<0)break; digest.update(buffer,0,n) } }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }
  private fun run(args: List<String>) {
    check()
    val session = FFmpegSession.create((listOf("-v","error","-nostdin","-xerror","-max_alloc","268435456")+args).toTypedArray())
    sessionId=session.sessionId; check(); FFmpegKitConfig.ffmpegExecute(session); check()
    require(ReturnCode.isSuccess(session.returnCode)) { "TIMELINE_MEDIA_PROCESS_FAILED" }
    sessionId=null
  }
  private fun duration(file: File): Long {
    val probe=MediaMetadataRetriever()
    try { probe.setDataSource(file.absolutePath); return probe.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0 }
    finally { probe.release() }
  }
  private fun sec(ms: Long)=String.format(Locale.US,"%.3f",ms/1000.0)
  private fun stamp(ms: Long)=String.format(Locale.US,"%02d:%02d:%02d,%03d",ms/3600000,(ms/60000)%60,(ms/1000)%60,ms%1000)
  fun render(json: String): String {
    require(busy.compareAndSet(false,true)) { "TIMELINE_BUSY" }
    var folder: File?=null; var complete=false
    val watchdog=Executors.newSingleThreadScheduledExecutor()
    try {
      val request=JSONObject(json); val id=request.getString("operationId")
      require(id.length in 1..200)
      operation=id;cancelled=false
      val root=File(context.cacheDir,"timeline-renders");root.mkdirs()
      root.listFiles()?.filter { System.currentTimeMillis()-it.lastModified()>86400000 }?.forEach { it.deleteRecursively() }
      folder=File.createTempFile("render-","",root);folder.delete();require(folder.mkdir())

      val started=System.nanoTime()
      watchdog.scheduleAtFixedRate({
        if(System.nanoTime()-started>TimeUnit.MINUTES.toNanos(10)||root.usableSpace<64L*1024*1024)cancel(id)
        if(cancelled)sessionId?.let(FFmpegKit::cancel)
      },100,100,TimeUnit.MILLISECONDS)
      val spec=request.getJSONObject("spec");require(spec.getInt("schemaVersion")==1)
      val clips=spec.getJSONArray("clips");require(clips.length() in 1..20)
      val total=(0 until clips.length()).sumOf { clips.getJSONObject(it).getLong("durationMs") }
      require(total in 250..120000)
      val sources=request.getJSONArray("inputs");val files=mutableMapOf<String,File>();var bytes=0L
      require(sources.length() in 1..21)
      val renderReserve=64L*1024*1024+total*2000L
      val sourceBytes=(0 until sources.length()).sumOf { File(requireNotNull(Uri.parse(sources.getJSONObject(it).getString("uri")).path)).length() }
      require(sourceBytes<=536870912 && root.usableSpace>sourceBytes+renderReserve) { "TIMELINE_SPACE_REQUIRED" }
      for(i in 0 until sources.length()) {
        val source=sources.getJSONObject(i);val uri=Uri.parse(source.getString("uri"));require(uri.scheme=="file"&&uri.authority.isNullOrEmpty())
        val file=File(requireNotNull(uri.path)).canonicalFile
        require(file.toPath().startsWith(context.filesDir.canonicalFile.toPath())&&file.isFile) { "TIMELINE_LOCAL_SOURCE_REQUIRED" }
        bytes+=file.length();require(file.length() in 1..104857600 && bytes<=536870912) { "TIMELINE_INPUT_SIZE_LIMIT" }
        val copy=File(folder,"source-$i.media");file.copyTo(copy)
        require(hash(copy)==source.getString("blob_sha256")) { "TIMELINE_SOURCE_CHANGED" }
        files[source.getString("version_id")]=copy
      }
      val landscape=spec.getString("orientation")=="landscape";val width=if(landscape)1280 else 720;val height=if(landscape)720 else 1280
      val subtitles=StringBuilder();var position=0L;var subtitle=0
      for(i in 0 until clips.length()) {
        val clip=clips.getJSONObject(i);val source=requireNotNull(files[clip.getString("versionId")]);val start=clip.getLong("startMs");val length=clip.getLong("durationMs")
        require(start>=0&&length>=250&&start+length<=duration(source)+50) { "TIMELINE_TRIM_OUT_OF_RANGE" }
        val caption=clip.getString("caption");require(caption.length<=500)
        if(caption.isNotBlank()){subtitle++;subtitles.append("$subtitle\n${stamp(position)} --> ${stamp(position+length)}\n${caption.replace("\r","").replace("\n\n","\n")}\n\n")}
        position+=length
        run(listOf("-protocol_whitelist","file","-format_whitelist","mov,matroska,webm","-ss",sec(start),"-i",source.absolutePath,"-t",sec(length),"-map","0:v:0","-an","-sn",
          "-filter_threads","1","-vf","scale=$width:$height:force_original_aspect_ratio=decrease,pad=$width:$height:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p",
          "-c:v","mpeg4","-q:v","4","-threads","2","-map_metadata","-1","-f","mp4","-y",File(folder,"clip-$i.mp4").absolutePath))
      }
      val list=File(folder,"clips.txt");list.writeText((0 until clips.length()).joinToString("\n") { "file 'clip-$it.mp4'" })
      val args=mutableListOf("-protocol_whitelist","file","-f","concat","-safe","1","-i",list.absolutePath)
      val audio=spec.optJSONObject("audio");var inputIndex=1;var audioIndex:Int?=null;var subtitleIndex:Int?=null
      if(audio!=null){
        val source=requireNotNull(files[audio.getString("versionId")]);val start=audio.getLong("startMs");val volume=audio.getDouble("volume")
        require(start>=0&&start<duration(source)&&volume.isFinite()&&volume in 0.0..1.0) { "TIMELINE_AUDIO_INVALID" }
        args+=listOf("-protocol_whitelist","file","-format_whitelist","mov,matroska,webm,mp3,wav,flac,ogg,aac","-ss",sec(start),"-i",source.absolutePath);audioIndex=inputIndex++
      }
      if(subtitles.isNotEmpty()){val file=File(folder,"subtitles.srt");file.writeText(subtitles.toString());args+=listOf("-protocol_whitelist","file","-f","srt","-i",file.absolutePath);subtitleIndex=inputIndex}
      args+=listOf("-map","0:v:0","-c:v","copy")
      if(audioIndex!=null)args+=listOf("-map","$audioIndex:a:0","-af","volume=${audio!!.getDouble("volume")},apad","-c:a","aac","-b:a","128k","-ac","2")
      if(subtitleIndex!=null)args+=listOf("-map","$subtitleIndex:s:0","-c:s","mov_text")
      val output=File(folder,"output.mp4")
      args+=listOf("-t",sec(total),"-map_metadata","-1","-movflags","+faststart","-fs","104857600","-f","mp4","-y",output.absolutePath)
      run(args)
      require(output.length() in 1..104857599 && kotlin.math.abs(duration(output)-total)<150) { "TIMELINE_OUTPUT_INVALID" }
      folder.listFiles()?.filter { it!=output }?.forEach { it.delete() }
      complete=true;return Uri.fromFile(output).toString()
    } finally {
      watchdog.shutdownNow();sessionId=null;operation=null
      if(!complete)folder?.deleteRecursively()
      busy.set(false)
    }
  }
}
