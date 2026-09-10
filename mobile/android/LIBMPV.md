# libmpv Android integration

## Binary and source identity

The app pins Maven Central artifact `dev.jdtech.mpv:libmpv:1.0.0`.

- Original AAR SHA-256: `df146592480fc8418415a06b1f1a1d6318b0088e21f52254b0e9a82b61ca8fa2`.
- Maven project metadata identifies `jarnedemeulemeester/libmpv-android` v1.0.0. The release tag resolves to commit `fcf6745703dc1265bca88f12fee8fc355ddf251e`.
- The source archive for that commit has SHA-256 `0006e4243da3ebfb3d43cc4c87a07026384b47807337d9180e221cd8b9389589` and is included in `AutoDL-media-sources.zip`.
- The release workflow and wrapper source identify the artifact, and the compiled Kotlin/JNI API matches that source. The published AAR contains no embedded git commit or reproducible-build attestation, so this is not a claim that a local rebuild is byte-for-byte identical.

The upstream build pins Android API 26, NDK `29.0.14206865`, mpv 0.41.0 and FFmpeg 8.1. It also pins Lua 5.2.4, libunibreak 6.1, libass 0.17.4, HarfBuzz 14.1.0, FriBidi 1.0.16, FreeType 2.14.3, libxml2 2.15.2, Fontconfig 2.17.1, Mbed TLS 3.6.6, libplacebo 7.360.1 and dav1d 1.5.3. The release source bundle contains the exact source archives or commit checkouts for this graph, including recursively pinned submodules.

## Local ELF relocation

FFmpegKit and the published libmpv AAR both use generic FFmpeg and C++ runtime filenames. Android cannot package two different `libavcodec.so` or `libc++_shared.so` implementations for one ABI, and selecting either implementation would be an unsupported ABI substitution.

`gradle/libmpv.gradle` therefore verifies the original AAR hash and produces a local AAR before packaging. It parses each ELF program and dynamic table, changes only equal-length `DT_SONAME` and `DT_NEEDED` strings, and renames the corresponding ZIP entries:

| Published name | App-local name |
| --- | --- |
| `libavcodec.so` | `libmpcodec.so` |
| `libavdevice.so` | `libmpdevice.so` |
| `libavfilter.so` | `libmpfilter.so` |
| `libavformat.so` | `libmpformat.so` |
| `libavutil.so` | `libmputil.so` |
| `libswresample.so` | `libmpresample.so` |
| `libswscale.so` | `libmpscale.so` |
| `libc++_shared.so` | `libmpv_shared.so` |

`libmpv.so` and `libplayer.so` retain their names because `MPVLib` loads those names. The task fails if the input hash changes, a requested dynamic string is absent, an ELF is malformed, or replacement names differ in byte length. The generated AAR used for the validated v1.4.20 build had SHA-256 `980d80f5d6e0cccf7857a2130531cb1d41a16d693e33856d9ea120848e742ba3`; the original AAR hash is the stable dependency identity.

The original and relocated AARs contain `armeabi-v7a`, `arm64-v8a`, `x86` and `x86_64`. All 64-bit shared objects have `PT_LOAD` alignment of at least 16384 bytes. Successful APK alignment and emulator execution remain required release checks.

## Wrapper API and lifecycle constraints

The Kotlin package is `dev.jdtech.mpv.MPVLib`. `MPVLib.create(Context)` returns a nullable, independent instance; it is not a singleton. An instance exposes `setOptionString`, `init`, `command`, typed nullable property getters, property setters/observers, `attachSurface`/`detachSurface`, event and log observer registration/removal, and `destroy`. Property callbacks and event callbacks originate on the native event thread and must be marshalled before touching Android views. Observers should be removed before `destroy`; the wrapper does not clear its observer collections, and calls after destruction fail because the native handle is zero.

The wrapper reports numeric `MPV_EVENT_END_FILE` but discards libmpv's reason and error fields. End-of-media therefore uses observed `eof-reached` with `keep-open=yes`; a bare end-file callback cannot distinguish EOF from stop or failure. Log strings are diagnostic, human-oriented output and are not a stable error protocol.

mpv 0.41.0's `fd://` stream keeps the supplied descriptor number without duplicating or owning it. `mpv_command(["stop"])` returning is not a stream-teardown barrier. Keep each `ParcelFileDescriptor` alive until the matching playback generation has ended; when callback attribution is ambiguous, keep it until `MPVLib.destroy()` completes. Reusing a descriptor number earlier can make a pending open or read target an unrelated file.

## License and rebuild

The Android wrapper is MIT licensed. Its FFmpeg build explicitly enables GPL and version-3 code, so the combined native playback engine is distributed under GPLv3; the individual bundled libraries retain their own notices and licenses. Release distribution includes the corresponding source graph and license texts described here.

To rebuild, extract the wrapper and dependency archives from `AutoDL-media-sources.zip`, place them under the wrapper's `buildscripts/deps` paths, and follow the included build scripts with the pinned SDK/NDK. Preserve `-Wl,-z,max-page-size=16384`. Replace the Maven input only after updating the pinned AAR hash and validating every relocated `DT_SONAME`/`DT_NEEDED`, ABI, page alignment, APK load and playback test. The source bundle also includes the unmodified Maven AAR so the exact relocation input remains available.

## Source archive verification

The packager requires explicit recursive-submodule opt-in whenever a pinned Git
tree contains gitlinks, including FreeType's `subprojects/dlg`. It exports fixed Git
objects with automatic newline conversion disabled. ZIP entry order, times, modes
and compression are fixed; identical input payloads produce identical ZIP bytes.
Git-source gzip generation uses the same toolchain for reproducibility; rebuilding
with a different Git/zlib version is not claimed to produce identical gzip bytes.
After writing, the script reads every entry back to verify CRC and payload SHA-256,
then writes `AutoDL-media-sources-verification.json`. Historical hashes in review
records identify individual runs, not a promise that changed docs/scripts yield the
same archive. Hash mismatch aborts immediately; only transport failures are retried.
