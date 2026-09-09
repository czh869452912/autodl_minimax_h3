# Local video compatibility engine

`VideoCompatibility.kt` exposes `prepareCompatibleVideo` and `cancelCompatibleVideo` through `AutoDLMedia`. The TypeScript contract lives in `mobile/src/native/videoCompatibility.ts`. The original is opened read-only and copied to a bounded private snapshot whose SHA-256 must match the caller's checkpoint. A successful result is an uncommitted CAS part: `files/cas/parts/sha256(operationId + NUL + decimalAttempt).part`. The caller owns CAS commit and gallery publication.

Software FFmpeg decoders (`h264`, `hevc`, `vp9`) read SDR files, including H.264 High10. Android's `h264_mediacodec` encoder produces 8-bit YUV420 AVC baseline and FFmpeg's native AAC encoder handles audio. This does not require the device to decode High10. Missing or failing AVC encoders produce an explicit conversion failure. HDR/PQ/HLG, BT.2020, Dolby Vision and mastering/light metadata are rejected; there is no tone mapping. Inputs without explicit HDR metadata are treated as SDR. Network URLs and nested network protocols are rejected.

Limits: one process-wide conversion, two codec threads, one filter thread, 1 GiB source/output maximum, 10 minute source duration, 4096-pixel input axes, output within 1920×1080, 4 Mbps video/128 kbps stereo audio, 15 minute wall-clock watchdog. Caller `maxBytes` can reduce the output cap. Full source decode uses `-xerror -err_detect explode`; output is fully decoded again, frame counts/duration/8-bit AVC are checked, and Android `MediaIntegrity` must accept it. Cancellation targets the exact operation and attempt, including work queued on the bridge. Input snapshots and unsuccessful owned parts are removed in `finally`; the next serialized conversion removes input snapshots left by process death, while abandoned CAS parts remain the application's CAS reconciliation responsibility. Native cancellation is cooperative (a broken vendor codec or blocked content provider can delay return).

## Dependency and provenance

Pinned Maven Central artifact: `io.github.jamaismagic.ffmpeg:ffmpeg-kit-main-min-16kb:6.1.4`.

- AAR SHA-256: `9f7bbf88628a8c0c5b30063e545c25d78183971eb088635ca11d1112950f3518`.
- Source/build scripts: https://github.com/JamaisMagic/ffmpeg-kit-16KB
- Release: `ffmpeg-kit-android-min-2026-01-27T12-56-32`, source revision `c7ca204` (upstream GitHub release), NDK r27d. Embedded library build configuration also records the r27d toolchain.
- Variant enables MediaCodec and zlib; no x264 or GPL codec libraries are bundled. Software decoders and AAC are FFmpeg built-ins.
- All four Android ABIs are present: armeabi-v7a, arm64-v8a, x86, x86_64. All 36 ELF `.so` libraries were inspected and every PT_LOAD alignment is at least 16384 bytes. Actual 16KB-page device execution is separate from ELF alignment verification.
- Artifact POM declares LGPLv3. FFmpegKit is a community fork of retired Arthenica FFmpegKit. Its Java dependency is `com.arthenica:smart-exception-java:0.2.1`.

When distributing APKs, include dependency copyright/license notices, LGPLv3 and GPLv3 license text (LGPLv3 incorporates GPLv3), corresponding library source/build materials and the applicable means for replacing/relinking the LGPL libraries. Do not infer that a Maven POM alone meets redistribution obligations. This change does not relicense application source. Preserve the above exact dependency/build provenance when preparing release materials.

## Device verification

`VideoCompatibilityInstrumentedTest` converts the synthetic High10 fixture using the actual Android AAR, verifies `h264`/`yuv420p` through native FFprobe, checks Android decoding and preserves the original SHA-256. It also tests hash mismatch and cancellation attempt ownership. Run:

```powershell
.\gradlew.bat :app:connectedDebugAndroidTest -PreactNativeArchitectures=x86_64 -Pandroid.testInstrumentationRunnerArguments.class=com.example.autodlh3.VideoCompatibilityInstrumentedTest
```
