# LibVLC Android integration

Pinned artifact: `org.videolan.android:libvlc-all:3.7.5` from Maven Central.
AAR SHA-256: `2c25507adb1260aa4d81aad8c2ce98765d98026b9381f49ea454d0b8092f21cb`.

The matching sources JAR was inspected for MediaPlayer, Media and IVLCVout APIs.
Java bindings alone are not all corresponding native sources. Before a release,
assemble the matching libvlcjni/VLC/contrib source and build-material archive,
audit the actual binary modules and license notices, and update the release
source bundle alongside the APK. The existing FFmpegKit source archive is not
a substitute. The source/build entry points are maintained by VideoLAN:

- https://code.videolan.org/videolan/vlc-android
- https://code.videolan.org/videolan/libvlcjni
- https://code.videolan.org/videolan/vlc

The application adapter is `LibVlcView.kt` / `LibVlcViewManager.kt`.
Replace the pinned dependency with a locally rebuilt AAR to relink a modified
library; ordinary project Android/JDK build instructions apply. Do not strip or
substitute FFmpeg libraries across LibVLC and FFmpegKit assuming binary ABI
compatibility. LibVLC is a separate playback runtime, not a Media3 FFmpeg renderer.

The current two-ABI debug APK passed ELF and ZIP 16KB alignment checks. Runtime
16KB loading, React Native Fabric interaction, actual file/content playback,
full-screen lifecycle and performance still require device acceptance.
