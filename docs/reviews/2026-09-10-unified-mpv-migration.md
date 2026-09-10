# Unified Media3/libmpv migration verification

## Result

All application video playback now uses one `UnifiedVideoView`, Media3 1.9.0
`PlayerView`, and a `SimpleBasePlayer` adapter backed by libmpv. Auto, strict
hardware, and software preferences configure the same engine; fullscreen reparents
the same controller/player. No VLC or alternative ExoPlayer video route remains.

Removed: expo-video dependency/plugin, VLC dependency/views, HardwareVideoView,
Media3PlayerActivity/manifest entry, software playback routing and orphan native
probe/open APIs. FFmpegKit remains for independently used thumbnail and conversion
operations. Its native dependencies are isolated from mpv by checked ELF relocation,
not by selecting arbitrary duplicate codecs with `pickFirst`.

## Regression fixed during actual application QA

Fabric supplies source props before the TextureView is attached. Loading mpv before
the surface exists produced a black picture while audio/time and Media3 controls
continued. Native tests that configured an already attached view missed this.
`sourceConfiguredBeforeViewAttachmentRendersPixels` reproduced the failure before
the fix and passes afterwards. The adapter now retains pending source/play intent
and issues `loadfile` only after a real output surface is attached. Stop, replacement,
retry, and disposal cancel obsolete pending work.

The installed application was exercised through Gallery → Video Detail with a
synthetic eight-second High10/AAC fixture. Auto and software modes displayed actual
colored frames. Pause, replay, and fullscreen retained visible video and controls.
The temporary emulator database fixture was removed by restoring the exact pre-QA
database, and the decode preference was restored to auto.

## Verification

- `npm test -- --runInBand`: 161 suites / 1122 tests passed; one suite / two existing tests skipped.
- TypeScript typecheck passed; focused player/routing tests passed.
- `:app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest`: successful; 48 JVM tests, zero failures/errors.
- Installed final debug APK and instrumentation APK on API 35 x86_64 emulator.
- UnifiedPlaybackInstrumentedTest: five tests passed, including pre-attachment
  rendering, actual colored screenshot pixels, file/content sources, clocks,
  seek/pause, same-player fullscreen/mode changes, host lifecycle, EOF/replay,
  valid-source replacement, missing-source recovery, double disposal, audio/subtitle
  tracks, and speed. An additional auto-mode run of the main playback test passed.
- OriginalMediaInstrumentedTest and VideoCompatibilityInstrumentedTest: four tests
  passed. Combined final device run: **OK (9 tests)**. FFprobe and FFmpeg thumbnail
  processing coexist with live mpv; both initialization orders were exercised.
- Final APK scan found no VLC libraries/classes, expo-video classes, removed views,
  or Media3PlayerActivity.
- `verify-apk-native-alignment.py`: 171 unique native libraries passed ELF and
  uncompressed ZIP alignment (64-bit 16KB, 32-bit 4KB).
- Independent reviews covered the native adapter/ELF relocation and RN bridge.
  Fullscreen recovery, applied source/retry event identity, combined source/mode
  updates, and pending-surface lifecycle findings were resolved and re-reviewed.

- Source packager completed end to end: 19 pinned dependency payloads; ZIP CRC,
  URL SHA-256s, exact Git revisions/recursive submodules, and bundled current
  relocation/build scripts verified. Git objects preserve source bytes, file modes
  and symlinks independently of Windows checkout settings. Source ZIP SHA-256:
  `0304d93ae7240265ea1fa1e8acefea075007d8c375af0b89fe416a50cf28f28f`.

## Boundaries

Minimum Android version is API 26 (Android 8.0), required by the pinned libmpv AAR.
The emulator uses 4KB pages; 16KB checks are binary/package checks, not an actual
16KB-device execution claim. Physical-device hardware decode, long-running thermal/
power behavior, HDR/Dolby Vision, and release signing/R8 were not validated here.
No release was published. Artifact/source identity, license notices, ABI isolation,
and rebuild instructions are in `mobile/android/LIBMPV.md` and the source manifest.

## Review follow-up

- Fixed FreeType's missing dlg gitlink and fail closed for undeclared Git submodules.
  Added source fixture tests for gitlink opt-in/content, fail-fast hash mismatch,
  fixed ZIP metadata and read-back CRC failure. Git archive explicitly disables
  automatic newline conversion (the Windows regression failed before that fix).
- Moved active playback identity to useLayoutEffect, a commit-phase effect. A passive
  effect would leave a post-commit event window; layout effect avoids that window
  without mutating refs during speculative render. A suspended replacement regression
  fails with the former implementation and passes with the committed identity.
- Preserved the old remote-buffering guarantee: only local file/content sources use
  the cumulative 15-second first-frame watchdog. HTTP/HTTPS transport errors still
  surface normally. This is documented in VIDEO_COMPATIBILITY.md and policy tests.
- Added simultaneous source/mode updates to RN and actual native playback tests, and
  actual Home/return to device coverage. Pitch other than 1 is explicitly rejected;
  host/surface absence is exposed as paused rather than mislabeled focus loss.
- Saturated the deadline counter, suspended inactive ticker work, enforced relocation
  counts separately for every ABI, and made compressed-native ZIP-check scope visible.
- Catch-path identity assignments remain necessary: synchronous event dispatch reads
  source/retry before releasePlayer clears state. They are not dead stores.
- The earlier CRC check was a manual read-back operation; it now runs in the packager.
  The earlier source ZIP hash above is a historical run fingerprint. The packager now emits
  evidence listing every payload hash and the bundle hash on a successful run. Fixed ZIP metadata makes
  reassembly deterministic for identical inputs; changed sources/docs/scripts change it.
- Component license notices remain accurate without making a categorical legal claim
  about how linking GPL components affects the application's overall license.

Reproduction: run scripts/test_package_media_sources.py; run
scripts/package-media-sources.py OUTPUT_DIR to fetch pinned source objects and produce
AutoDL-media-sources-verification.json. Run scripts/verify-mpv-migration.py APK AAR
--output REPORT.json for the compiled artifact checks. Raw device output, per-suite
JVM counts and APK evidence are in docs/reviews/evidence/2026-09-10-mpv-*.
HTTPS transport playback, physical-device/HDR and actual 16KB-page execution are still
not claimed as device-tested. The remote watchdog policy has JVM regression coverage.

Follow-up result: 1124 JS tests, 50 JVM tests, 9 device tests and 3 source-packager
regressions passed; TypeScript passed. The new FreeType archive includes dlg commit
395ccad2c1e0daae535c4d20bb0a3f2424648e17 with its source files. Full source bundle
regeneration was blocked by repeated GitHub HTTPS failures fetching libplacebo
submodules. No new complete-bundle hash is asserted: the historical ZIP is NOT the
review-fixed bundle. See evidence/2026-09-10-mpv-source-rebuild.json and network log;
rerun the packager when GitHub connectivity is restored before publishing sources.

## Second review confirmation and commit verification

Confirmed the second review's nine fix checks and the catch-path identity ruling.
The old device evidence did precede a later source comment edit; this was refreshed
rather than treating that timing difference as harmless. Current source was rebuilt
with testDebugUnitTest, assembleDebug and assembleDebugAndroidTest. All 50 JVM tests
passed. Both APKs were installed, then the full nine-device-test set passed in
17.559 seconds. The installed application APK was read back from the device and
hashed: bbfdc4f82519ada6767d0cd7dc4bb50e207650ee13978dec3f76cd762d0c75af,
identical to the local build and the reviewer's new-build hash.

The updated device-build JSON binds this APK, the instrumentation APK and source
file hashes. Device output, JVM counts and APK alignment/class scan evidence have
been refreshed. Runtime source files were not modified after this build/test run.

The verifier's bare asserts were replaced with explicit ValueError failures. Three
subprocess regression tests run the verifier under python -O: obsolete ZIP paths and
obsolete DEX classes both fail without producing a success report; a clean fixture
passes. The real APK verifier was also run with -O, confirming 171 libraries, absent
obsolete classes and the relocated AAR hash. The report explicitly identifies its
debug APK scope and hash-only AAR identity check. These tests are in
scripts/test_verify_mpv_migration.py.

The review's minor product-policy observations remain documented limitations;
this commit follow-up did not introduce new playback behavior beyond the already
reviewed implementation. HTTPS transport, HDR/physical devices and release/R8 are
not represented as device-verified. Source package publishing still requires the
latest successful complete-bundle verification record, never the historical ZIP.

Second-review source rebuild completed: GitHub connectivity recovered. All 19 pinned
payloads, including FreeType dlg and recursive libplacebo submodules, were packaged.
CRC/payload hashes, bundled scripts and repeat ZIP reassembly were verified.
New complete bundle SHA-256: `204eee034618c49cf542ad145553770a308013aba7c243f4ab3502410d19a524`.
The current source-rebuild JSON supersedes the prior network-blocked status; the
network log remains a historical record. No package was published.
