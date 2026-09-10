# LibVLC Android integration

Pinned artifact: `org.videolan.android:libvlc-all:3.7.5` from Maven Central.
AAR SHA-256: `2c25507adb1260aa4d81aad8c2ce98765d98026b9381f49ea454d0b8092f21cb`.

Release source provenance for v1.4.19:

- vlc-android `c78874b9540be9328da92625559933d8a549cec2` is the upstream `libvlc-3.7.5` tag commit. Its buildsystem/compile.sh pins the JNI revision below.
- libvlcjni `81bb02ba48dcad32550e0626139a387b3c30af04` pins VLC `ac6c2a405d652b5576128ceb9fec2c342f0e83ec` in buildsystem/get-vlc.sh.
- scripts/media-source-manifest.json pins these three revisions. The release source bundle includes their complete git tree archives, JNI patches, licenses, contrib recipes/checksums and build scripts, alongside the existing FFmpegKit sources. Git archive output is verified against the requested commit before packaging.
- Dependency tarballs are fetched by VLC contrib recipes from their pinned upstream sources; they are not confused with the unrelated FFmpegKit source version. Rebuilding the full dependency graph requires these downloads and the toolchains specified by upstream.

Rebuild from the included vlc-android and libvlcjni README/buildsystem instructions on Linux. The source archives do not contain git metadata: initialize repositories at extraction locations if running the upstream revision-checking scripts, or obtain the exact pinned commits from the manifest repositories. Apply all libvlcjni/libvlc/patches to the pinned VLC tree (the get-vlc.sh script specifies the procedure). Build contribs with the upstream recipe rather than substituting FFmpegKit libraries. Each library's source files and included license texts remain authoritative.

The application adapter is `LibVlcView.kt` / `LibVlcViewManager.kt`.
Replace the pinned dependency with a locally rebuilt AAR to relink a modified
library; ordinary project Android/JDK build instructions apply. Do not strip or
substitute FFmpeg libraries across LibVLC and FFmpegKit assuming binary ABI
compatibility. LibVLC is a separate playback runtime, not a Media3 FFmpeg renderer.

The current two-ABI debug APK passed ELF and ZIP 16KB alignment checks. Runtime
16KB loading, React Native Fabric interaction, actual file/content playback,
full-screen lifecycle and performance still require device acceptance.
