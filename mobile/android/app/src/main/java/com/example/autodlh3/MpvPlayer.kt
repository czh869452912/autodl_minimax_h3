package com.example.autodlh3

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.view.Surface
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.TrackGroup
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import dev.jdtech.mpv.MPVLib
import java.io.File
import java.util.concurrent.Executors

/** Media3 controls and timeline backed exclusively by an instance of libmpv. */
@UnstableApi
class MpvPlayer(context: Context) : SimpleBasePlayer(Looper.getMainLooper()) {
  var onPlaybackEvent: ((String, Long) -> Unit)? = null

  private val appContext = context.applicationContext
  private val main = Handler(Looper.getMainLooper())
  private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var native: MPVLib? = null
  private var engineUnavailable = false
  @Volatile private var generation = 0L
  @Volatile private var callbackGeneration = 0L
  @Volatile private var disposed = false
  private var item: MediaItem? = null
  private var sourcePath: String? = null
  private var descriptor: ParcelFileDescriptor? = null
  private val retiredDescriptors = mutableListOf<ParcelFileDescriptor>()
  private var prepared = false
  private var pendingSurfaceLoad = false
  private var loaded = false
  private var awaitingStart = false
  private var firstFrame = false
  private var outputHasFrame = false
  private var newlyRenderedFrame = false
  private var wantedPlay = false
  private var hostPaused = false
  private var hasFocus = false
  private var focusRequested = false
  private var ducked = false
  private var decodeMode = "auto"
  private var playback = Player.STATE_IDLE
  private var failure: PlaybackException? = null
  private var lastEvent: String? = null
  private var position = 0L
  private var mediaDuration = C.TIME_UNSET
  private var bufferedPosition = 0L
  private var seekable = false
  private var awaitingSeekRestart = false
  private var awaitingDecoderRestart = false
  private var parameters = PlaybackParameters.DEFAULT
  private var playerVolume = 1f
  private var videoSize = VideoSize.UNKNOWN
  private var tracks = Tracks.EMPTY
  private var trackParameters = TrackSelectionParameters.DEFAULT
  private var outputSize = Size.ZERO
  private var attachedSurface: Surface? = null
  private val firstFrameDeadline = MpvFirstFrameDeadline(15_000)
  private var cachePaused = false
  private var focusRequest: AudioFocusRequest? = null
  private var focusGeneration = 0L
  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY && !disposed) pause()
    }
  }
  private val observer = object : MPVLib.EventObserver {
    override fun eventProperty(property: String) = postNative { onProperty(property, null) }
    override fun eventProperty(property: String, value: Long) = postNative { onProperty(property, value) }
    override fun eventProperty(property: String, value: Double) = postNative { onProperty(property, value) }
    override fun eventProperty(property: String, value: Boolean) = postNative { onProperty(property, value) }
    override fun eventProperty(property: String, value: String) = postNative { onProperty(property, value) }
    override fun event(eventId: Int) = postNative { onNativeEvent(eventId) }
  }
  private val videoOutput = MpvVideoOutput(::onSurfaceChanged, ::onFrameRendered)
  private val ticker = object : Runnable {
    override fun run() {
      if (disposed) return
      closeRetiredDescriptorsIfIdle()
      if (prepared && failure == null) {
        pollPosition()
        updateTimeout()
        // mpv's AAR drops END_FILE's reason; keep-open + eof-reached is the reliable EOF signal.
        if (loaded && !awaitingSeekRestart && native?.getPropertyBoolean("eof-reached") == true) finishPlayback()
        publish()
      }
      scheduleTicker()
    }
  }

  init {
    try {
      val mpv = checkNotNull(MPVLib.create(appContext)) { "libmpv initialization failed" }
      native = mpv
      mapOf(
        "config" to "no", "terminal" to "no", "msg-level" to "all=no",
        "idle" to "yes", "keep-open" to "yes", "vo" to "gpu",
        "gpu-context" to "android", "hwdec" to "auto", "pause" to "yes",
        "input-default-bindings" to "no", "force-window" to "no",
      ).forEach { (name, value) -> mpv.setOptionString(name, value) }
      mpv.init()
      mpv.addObserver(observer)
      listOf("time-pos", "duration", "demuxer-cache-time").forEach { mpv.observeProperty(it, 5) }
      listOf("pause", "paused-for-cache", "eof-reached", "seekable", "idle-active").forEach { mpv.observeProperty(it, 3) }
      mpv.observeProperty("hwdec-current", 1)
      mpv.observeProperty("video-params", 0)
      mpv.observeProperty("track-list", 0)
    } catch (_: Throwable) {
      engineUnavailable = true
      val failedNative = native
      native = null
      if (failedNative != null) RELEASE_EXECUTOR.execute { runCatching { failedNative.destroy() } }
    }
    if (android.os.Build.VERSION.SDK_INT >= 33) {
      appContext.registerReceiver(noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      appContext.registerReceiver(noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
    }
    scheduleTicker()
  }

  fun setDecodeMode(mode: String) {
    verifyApplicationThread()
    val next = mode.takeIf { it == "hardware" || it == "software" } ?: "auto"
    if (disposed || next == decodeMode) return
    val decoderChanges = MpvPlaybackPolicy.hardwareDecoder(next) != MpvPlaybackPolicy.hardwareDecoder(decodeMode)
    if (loaded) callbackGeneration++
    awaitingDecoderRestart = loaded && decoderChanges && playback != Player.STATE_ENDED
    decodeMode = next
    native?.setPropertyString("hwdec", MpvPlaybackPolicy.hardwareDecoder(next))
    // Changing hwdec reinitializes mpv's decoder in place, retaining source, position and intent.
    if (prepared && failure == null && playback != Player.STATE_ENDED) {
      firstFrame = false
      outputHasFrame = false
      firstFrameDeadline.reset()
      playback = Player.STATE_BUFFERING
      emit("loading")
      applyPlaybackIntent()
      publish()
    } else if (item != null && failure != null) {
      // An explicit mode change after a terminal decoder failure is an explicit retry.
      loadSource()
    }
  }

  fun setHostPaused(paused: Boolean) {
    verifyApplicationThread()
    if (disposed || hostPaused == paused) return
    updateTimeout()
    hostPaused = paused
    applyPlaybackIntent()
    publish()
  }

  override fun getState(): State {
    val playlist = item?.let {
      listOf(MediaItemData.Builder(generation).setMediaItem(it)
        .setDurationUs(if (mediaDuration == C.TIME_UNSET) C.TIME_UNSET else mediaDuration * 1000)
        .setTracks(tracks)
        .setIsSeekable(seekable).build())
    } ?: emptyList()
    val rendered = newlyRenderedFrame
    newlyRenderedFrame = false
    return State.Builder()
      .setAvailableCommands(COMMANDS)
      .setPlaylist(playlist)
      .setPlayWhenReady(wantedPlay && !hostPaused && attachedSurface != null, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaybackSuppressionReason(if (wantedPlay && !hostPaused && attachedSurface != null && !hasFocus) Player.PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS else Player.PLAYBACK_SUPPRESSION_REASON_NONE)
      .setPlaybackState(playback)
      .setPlayerError(failure)
      .setIsLoading(playback == Player.STATE_BUFFERING)
      .setContentPositionMs(position)
      .setContentBufferedPositionMs(PositionSupplier.getConstant(bufferedPosition.coerceAtLeast(position)))
      .setTotalBufferedDurationMs(PositionSupplier.getConstant((bufferedPosition - position).coerceAtLeast(0)))
      .setPlaybackParameters(parameters)
      .setTrackSelectionParameters(trackParameters)
      .setVolume(playerVolume)
      .setVideoSize(videoSize)
      .setSurfaceSize(outputSize)
      .setNewlyRenderedFirstFrame(rendered)
      .build()
  }

  override fun handleSetMediaItems(mediaItems: MutableList<MediaItem>, startIndex: Int, startPositionMs: Long): ListenableFuture<*> {
    generation++
    stopSource()
    item = mediaItems.getOrNull(if (startIndex == C.INDEX_UNSET) 0 else startIndex)
    position = MpvPlaybackPolicy.seekPositionMs(startPositionMs, C.TIME_UNSET)
    mediaDuration = C.TIME_UNSET
    bufferedPosition = position
    videoSize = VideoSize.UNKNOWN
    tracks = Tracks.EMPTY
    seekable = false
    awaitingSeekRestart = false
    awaitingDecoderRestart = false
    lastEvent = null
    failure = null
    playback = Player.STATE_IDLE
    return done()
  }

  override fun handlePrepare(): ListenableFuture<*> {
    if (item != null && (!prepared || failure != null)) loadSource()
    return done()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    updateTimeout()
    wantedPlay = playWhenReady
    if (wantedPlay && playback == Player.STATE_ENDED) {
      position = 0
      awaitingSeekRestart = true
      native?.command(arrayOf("seek", "0", "absolute+exact"))
      playback = Player.STATE_READY
    }
    applyPlaybackIntent()
    publish()
    return done()
  }

  override fun handleStop(): ListenableFuture<*> {
    generation++
    stopSource()
    failure = null
    playback = Player.STATE_IDLE
    emit("paused")
    return done()
  }

  override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
    position = MpvPlaybackPolicy.seekPositionMs(positionMs, mediaDuration)
    if (loaded) {
      awaitingSeekRestart = true
      native?.command(arrayOf("seek", (position / 1000.0).toString(), "absolute+exact"))
      if (playback == Player.STATE_ENDED) playback = Player.STATE_READY
      applyPlaybackIntent()
    }
    return done()
  }

  override fun handleSetPlaybackParameters(playbackParameters: PlaybackParameters): ListenableFuture<*> {
    require(playbackParameters.pitch == 1f) { "Independent audio pitch is unsupported; pitch must be 1" }
    parameters = PlaybackParameters(playbackParameters.speed.coerceIn(0.25f, 4f))
    native?.setPropertyDouble("speed", parameters.speed.toDouble())
    return done()
  }

  override fun handleSetVolume(volume: Float, volumeOperationType: Int): ListenableFuture<*> {
    playerVolume = volume.coerceIn(0f, 1f)
    updateNativeVolume()
    return done()
  }

  override fun handleSetTrackSelectionParameters(trackSelectionParameters: TrackSelectionParameters): ListenableFuture<*> {
    trackParameters = trackSelectionParameters
    if (loaded) { applyTrackSelection(); updateVideoSize() }
    return done()
  }

  override fun handleSetVideoOutput(videoOutput: Any): ListenableFuture<*> {
    this.videoOutput.set(videoOutput)
    return done()
  }

  override fun handleClearVideoOutput(videoOutput: Any?): ListenableFuture<*> {
    this.videoOutput.clear(videoOutput)
    return done()
  }

  override fun handleRelease(): ListenableFuture<*> {
    disposed = true
    generation++
    callbackGeneration++
    main.removeCallbacksAndMessages(null)
    onPlaybackEvent = null
    videoOutput.clear()
    abandonFocus()
    runCatching { appContext.unregisterReceiver(noisyReceiver) }
    val mpv = native
    native = null
    val oldDescriptors = retiredDescriptors.toMutableList()
    descriptor?.let(oldDescriptors::add)
    descriptor = null
    retiredDescriptors.clear()
    // Native destroy joins its event pthread. Observer callbacks never wait for the UI looper.
    // Remove callbacks first, outside callback monitors; release descriptors after native unload.
    if (mpv != null) {
      mpv.removeObserver(observer)
      RELEASE_EXECUTOR.execute { try { mpv.destroy() } finally { oldDescriptors.forEach { runCatching { it.close() } } } }
    } else oldDescriptors.forEach { runCatching { it.close() } }
    playback = Player.STATE_IDLE
    return done()
  }

  private fun loadSource() {
    val uri = item?.localConfiguration?.uri ?: return fail("sourceUnavailable")
    stopSource()
    failure = null
    cachePaused = false
    awaitingSeekRestart = false
    awaitingDecoderRestart = false
    firstFrame = false
    outputHasFrame = false
    newlyRenderedFrame = false
    firstFrameDeadline.reset()
    prepared = true
    awaitingStart = true
    playback = Player.STATE_BUFFERING
    emit("loading")
    val mpv = native.takeUnless { engineUnavailable } ?: return fail("decodeFailed")
    try {
      sourcePath = when (uri.scheme?.lowercase()) {
        "content" -> {
          val opened = appContext.contentResolver.openFileDescriptor(uri, "r") ?: return fail("sourceUnavailable")
          descriptor = opened
          "fd://${opened.fd}"
        }
        "file", null -> {
          val path = if (uri.scheme == "file") uri.path else uri.toString()
          val file = path?.let(::File)
          if (file == null || !file.isFile || !file.canRead()) return fail("sourceUnavailable")
          file.absolutePath
        }
        "http", "https" -> uri.toString()
        else -> return fail("sourceUnavailable")
      }
      mpv.setPropertyString("hwdec", MpvPlaybackPolicy.hardwareDecoder(decodeMode))
      mpv.setPropertyBoolean("pause", true)
      pendingSurfaceLoad = true
      loadWhenSurfaceReady()
    } catch (_: Exception) {
      fail("sourceUnavailable")
    }
  }

  private fun stopSource() {
    callbackGeneration++
    prepared = false
    pendingSurfaceLoad = false
    loaded = false
    awaitingStart = false
    awaitingSeekRestart = false
    awaitingDecoderRestart = false
    firstFrameDeadline.reset()
    sourcePath = null
    native?.command(arrayOf("stop"))
    descriptor?.let(retiredDescriptors::add)
    descriptor = null
    abandonFocus()
  }

  private fun closeRetiredDescriptorsIfIdle() {
    if (retiredDescriptors.isNotEmpty() && (native == null || native?.getPropertyBoolean("idle-active") == true)) {
      closeRetiredDescriptors()
    }
  }

  private fun closeRetiredDescriptors() {
    retiredDescriptors.forEach { runCatching { it.close() } }
    retiredDescriptors.clear()
  }

  private fun postNative(action: () -> Unit) {
    val token = callbackGeneration
    if (!disposed) main.post { if (!disposed && callbackGeneration == token) action() }
  }

  private fun onNativeEvent(event: Int) {
    if (!prepared || failure != null) return
    when (event) {
      6 -> if (native?.getPropertyString("path") == sourcePath) awaitingStart = false
      8 -> {
        if (native?.getPropertyString("path") != sourcePath || native?.getPropertyBoolean("idle-active") == true) return
        // FILE_LOADED for the replacement proves the previous stream has been unloaded.
        closeRetiredDescriptors()
        awaitingStart = false
        loaded = true
        if (position > 0) {
          awaitingSeekRestart = true
          native?.command(arrayOf("seek", (position / 1000.0).toString(), "absolute+exact"))
        }
        updateVideoSize()
        applyTrackSelection()
        pollPosition()
        applyPlaybackIntent()
      }
      7 -> {
        // A replaced source can deliver its END_FILE after the next load was queued.
        // Only an idle engine proves that no current source is still opening/playing.
        val result = MpvPlaybackPolicy.terminalEvent(awaitingStart, loaded,
          !awaitingSeekRestart && native?.getPropertyBoolean("eof-reached") == true,
          native?.getPropertyBoolean("idle-active") == true)
        when (result) {
          "ended" -> finishPlayback()
          null -> Unit
          else -> fail(result)
        }
      }
      17 -> updateVideoSize()
      21 -> {
        if (!loaded || native?.getPropertyString("path") != sourcePath) return
        if (native?.getPropertyBoolean("seeking") != true) {
          awaitingSeekRestart = false
          awaitingDecoderRestart = false
          checkHardwareDecoder()
        }
        pollPosition()
      }
    }
    publish()
  }

  private fun onProperty(name: String, value: Any?) {
    if (name == "idle-active") {
      closeRetiredDescriptorsIfIdle()
      return
    }
    if (!prepared || awaitingStart || failure != null) return
    when (name) {
      "time-pos" -> if (value is Number) position = MpvPlaybackPolicy.positionMs(value.toDouble())
      "duration" -> if (value is Number) mediaDuration = MpvPlaybackPolicy.positionMs(value.toDouble())
      "demuxer-cache-time" -> if (value is Number) bufferedPosition = MpvPlaybackPolicy.positionMs(value.toDouble())
      "seekable" -> seekable = value == true
      "paused-for-cache" -> {
        cachePaused = value == true
        if (firstFrame && playback != Player.STATE_ENDED) playback = if (cachePaused) Player.STATE_BUFFERING else Player.STATE_READY
      }
      // Property notifications may describe the previous decoder during reinitialization.
      // Strict hardware mode is enforced against the current decoder at restart/new frame.
      "video-params", "track-list" -> updateVideoSize()
      "eof-reached" -> if (loaded && !awaitingSeekRestart && value == true && native?.getPropertyBoolean("eof-reached") == true) finishPlayback()
    }
    publish()
  }

  private fun onSurfaceChanged(surface: Surface?, width: Int, height: Int) {
    updateTimeout()
    val mpv = native
    if (attachedSurface !== surface) {
      outputHasFrame = false
      if (attachedSurface != null) {
        mpv?.setPropertyString("vo", "null")
        mpv?.setPropertyString("force-window", "no")
        mpv?.detachSurface()
      }
      attachedSurface = surface
      if (surface != null) {
        mpv?.attachSurface(surface)
        mpv?.setPropertyString("force-window", "yes")
        mpv?.setPropertyString("vo", "gpu")
      }
    }
    outputSize = Size(width.coerceAtLeast(0), height.coerceAtLeast(0))
    if (surface != null && width > 0 && height > 0) mpv?.setPropertyString("android-surface-size", "${width}x${height}")
    loadWhenSurfaceReady()
    if (!disposed) { applyPlaybackIntent(); publish() }
  }

  private fun loadWhenSurfaceReady() {
    // Fabric applies props before attachment. mpv must see a real output before loadfile;
    // attaching after decoder initialization can leave the GPU output permanently black.
    if (!pendingSurfaceLoad || attachedSurface == null || disposed) return
    pendingSurfaceLoad = false
    try {
      native?.command(arrayOf("loadfile", checkNotNull(sourcePath), "replace"))
      applyPlaybackIntent()
    } catch (_: Exception) { fail("sourceUnavailable") }
    catch (_: LinkageError) { fail("decodeFailed") }
  }

  private fun onFrameRendered() {
    if (disposed || !prepared || !loaded || awaitingDecoderRestart || failure != null || attachedSurface == null || outputHasFrame) return
    if (!checkHardwareDecoder()) return
    outputHasFrame = true
    newlyRenderedFrame = true
    if (!firstFrame) {
      firstFrame = true
      firstFrameDeadline.reset()
      playback = if (cachePaused) Player.STATE_BUFFERING else Player.STATE_READY
      emit("firstFrame")
    }
    publish()
  }

  private fun checkHardwareDecoder(): Boolean {
    val actual = native?.getPropertyString("hwdec-current")
    if (MpvPlaybackPolicy.rejectSoftware(decodeMode, actual) && native?.getPropertyString("video-codec") != null) {
      fail("decodeFailed")
      return false
    }
    return true
  }

  private fun updateVideoSize() {
    val mpv = native ?: return
    val width = mpv.getPropertyInt("dwidth") ?: mpv.getPropertyInt("width") ?: 0
    val height = mpv.getPropertyInt("dheight") ?: mpv.getPropertyInt("height") ?: 0
    if (width > 0 && height > 0) videoSize = VideoSize(width, height)
    val groups = mutableListOf<Tracks.Group>()
    val count = (mpv.getPropertyInt("track-list/count") ?: 0).coerceIn(0, 128)
    for (index in 0 until count) {
      val prefix = "track-list/$index"
      val type = mpv.getPropertyString("$prefix/type")
      if (type != "video" && type != "audio" && type != "sub") continue
      val selected = mpv.getPropertyBoolean("$prefix/selected") == true
      val format = Format.Builder()
        .setId(mpv.getPropertyInt("$prefix/id")?.toString() ?: index.toString())
        .setLabel(mpv.getPropertyString("$prefix/title"))
        .setLanguage(mpv.getPropertyString("$prefix/lang"))
        // mpv reports the decoder's codec name, not an RFC 6381 MIME codec string.
        .setSampleMimeType(when (type) {
          "video" -> "video/x-unknown"
          "audio" -> "audio/x-unknown"
          else -> "text/x-unknown"
        })
      if (type == "video") format.setWidth(width).setHeight(height)
      groups += Tracks.Group(TrackGroup("mpv-$type-$index", format.build()), false,
        intArrayOf(C.FORMAT_HANDLED), booleanArrayOf(selected))
    }
    tracks = Tracks(groups)
  }

  private fun applyTrackSelection() {
    val mpv = native ?: return
    mpv.setPropertyString("alang", trackParameters.preferredAudioLanguages.joinToString(","))
    mpv.setPropertyString("slang", trackParameters.preferredTextLanguages.joinToString(","))
    for ((type, property) in listOf(C.TRACK_TYPE_VIDEO to "vid", C.TRACK_TYPE_AUDIO to "aid", C.TRACK_TYPE_TEXT to "sid")) {
      val selectedOverride = trackParameters.overrides.values.firstOrNull { override ->
        override.type == type && override.trackIndices.isNotEmpty() &&
          tracks.groups.any { it.mediaTrackGroup == override.mediaTrackGroup }
      }
      val selection = when {
        type in trackParameters.disabledTrackTypes -> "no"
        selectedOverride != null -> selectedOverride.mediaTrackGroup
          .getFormat(selectedOverride.trackIndices.first()).id ?: "auto"
        else -> "auto"
      }
      mpv.setPropertyString(property, selection)
    }
  }

  private fun pollPosition() {
    if (!loaded) return
    val mpv = native ?: return
    mpv.getPropertyDouble("time-pos")?.let { position = MpvPlaybackPolicy.positionMs(it) }
    mpv.getPropertyDouble("duration")?.let { mediaDuration = MpvPlaybackPolicy.positionMs(it) }
    mpv.getPropertyBoolean("seekable")?.let { seekable = it }
  }

  private fun scheduleTicker() {
    main.removeCallbacks(ticker)
    if (!disposed && (retiredDescriptors.isNotEmpty() || (prepared && wantedPlay && canPlay() && failure == null && playback != Player.STATE_ENDED))) {
      main.postDelayed(ticker, 250)
    }
  }

  private fun canPlay() = !hostPaused && attachedSurface != null && hasFocus

  private fun applyPlaybackIntent() {
    if (wantedPlay && prepared && !hostPaused && attachedSurface != null && failure == null && playback != Player.STATE_ENDED) requestFocus()
    val run = wantedPlay && prepared && canPlay() && failure == null && playback != Player.STATE_ENDED
    native?.setPropertyBoolean("pause", !run)
    if (!wantedPlay || hostPaused || attachedSurface == null || failure != null || playback == Player.STATE_ENDED) abandonFocus()
    updateTimeout()
    scheduleTicker()
  }

  private fun updateTimeout() {
    val active = MpvPlaybackPolicy.usesFirstFrameDeadline(item?.localConfiguration?.uri?.scheme?.lowercase()) && prepared && !firstFrame && failure == null && wantedPlay && canPlay() && playback != Player.STATE_ENDED
    if (firstFrameDeadline.update(SystemClock.elapsedRealtime(), active)) fail(if (loaded) "decodeFailed" else "sourceUnavailable")
  }

  private fun finishPlayback() {
    if (playback == Player.STATE_ENDED) return
    playback = Player.STATE_ENDED
    firstFrameDeadline.reset()
    abandonFocus()
    emit("ended")
  }

  private fun fail(status: String) {
    if (disposed || failure != null) return
    failure = PlaybackException(
      if (status == "sourceUnavailable") "Video source is unavailable" else "Video decoding failed",
      null,
      if (status == "sourceUnavailable") PlaybackException.ERROR_CODE_IO_UNSPECIFIED else PlaybackException.ERROR_CODE_DECODING_FAILED,
    )
    playback = Player.STATE_IDLE
    firstFrameDeadline.reset()
    stopSource()
    emit(status)
    invalidateState()
  }

  private fun publish() {
    if (disposed) return
    invalidateState()
    if (failure != null || !prepared || playback == Player.STATE_ENDED) return
    if (!wantedPlay || hostPaused || (attachedSurface != null && !hasFocus)) emit("paused")
    else if (firstFrame && playback == Player.STATE_READY && canPlay()) emit("playing")
    else if (playback == Player.STATE_BUFFERING) emit("loading")
  }

  private fun emit(status: String) {
    if (disposed || lastEvent == status) return
    lastEvent = status
    onPlaybackEvent?.invoke(status, position)
  }

  private fun requestFocus() {
    if (focusRequested) return
    focusRequested = true
    val token = ++focusGeneration
    val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
      // AudioManager already dispatches on main. Each request has a distinct token so an
      // abandoned request's queued callback cannot pause or resume the next source.
      if (!disposed && token == focusGeneration && focusRequested) {
        when (change) {
          AudioManager.AUDIOFOCUS_GAIN -> { hasFocus = true; ducked = false }
          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> { hasFocus = true; ducked = true }
          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> hasFocus = false
          AudioManager.AUDIOFOCUS_LOSS -> { hasFocus = false; wantedPlay = false; abandonFocus() }
        }
        updateNativeVolume()
        applyPlaybackIntent()
        publish()
      }
    }
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(android.media.AudioAttributes.Builder()
          .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
          .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MOVIE).build())
        .setOnAudioFocusChangeListener(focusListener, main).build()
    focusRequest = request
    val result = audioManager.requestAudioFocus(request)
    hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    if (!hasFocus) focusRequested = false
  }

  private fun abandonFocus() {
    focusGeneration++
    if (focusRequested) {
      focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
    }
    focusRequest = null
    focusRequested = false
    hasFocus = false
    ducked = false
    updateNativeVolume()
  }

  private fun updateNativeVolume() = native?.setPropertyDouble("volume", playerVolume * if (ducked) 20.0 else 100.0)
  private fun done(): ListenableFuture<Void?> = Futures.immediateVoidFuture()

  companion object {
    private val RELEASE_EXECUTOR = Executors.newSingleThreadExecutor { task -> Thread(task, "mpv-release").apply { isDaemon = true } }
    private val COMMANDS = Player.Commands.Builder().addAll(
      Player.COMMAND_PLAY_PAUSE, Player.COMMAND_PREPARE, Player.COMMAND_STOP,
      Player.COMMAND_RELEASE, Player.COMMAND_SET_MEDIA_ITEM, Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
      Player.COMMAND_GET_TIMELINE, Player.COMMAND_GET_METADATA,
      Player.COMMAND_GET_TRACKS,
      Player.COMMAND_SET_TRACK_SELECTION_PARAMETERS,
      Player.COMMAND_GET_VOLUME, Player.COMMAND_SET_VOLUME, Player.COMMAND_SET_SPEED_AND_PITCH,
      Player.COMMAND_SET_VIDEO_SURFACE, Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
      Player.COMMAND_SEEK_TO_DEFAULT_POSITION, Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD,
    ).build()
  }
}
