# Unified mpv playback implementation plan

> Execute with superpowers:subagent-driven-development; user approved direct migration and full obsolete-path removal.

**Goal:** One Media3 PlayerView backed by libmpv for all application video playback, with no VLC or ExoPlayer video fallback.
**Architecture:** React Native passes source and decode preference to UnifiedVideoView. MpvPlayer implements Media3 SimpleBasePlayer, owns native playback, surface and audio lifecycle, and exposes consistent commands/events. File/content/HTTPS inputs use the same path.
**Tech stack:** Android Kotlin, Media3 1.9.0, pinned Android libmpv, React Native 0.86.
**Spec:** User-approved architecture in this conversation (2026-09-10).

## Constraints
- Preserve original bytes, media integrity validation and durable redownload only for proven corruption.
- Remove VLC, expo-video, strict-hardware view, orphan playback Activity and routing probe APIs.
- Keep decode preferences, implemented inside mpv; no re-created UI on preference changes.
- Preserve unrelated FFmpeg thumbnail/conversion functionality and user-owned docs/workflows.
- Real Android compilation and emulator playback required; report unverified physical-device performance explicitly.

## Tasks
- [x] 1. Pin and inspect native artifact/API/provenance; verify ABI and 16KB loading compatibility. Update dependency/source packaging and notices.
- [x] 2. Write unified RN behavior tests, observe expected failures, implement native bridge UI and validation/retry, remove legacy routing tests and expo-video dependency/configuration.
- [x] 3. Implement MpvPlayer state mapping and UnifiedVideoView with surface/audio/lifecycle ownership; verify state tests and Android build. Remove obsolete native classes and probe/open APIs.
- [x] 4. Replace instrumentation tests with actual unified PlayerView playback, file/content, pause/seek, fullscreen/lifecycle and source replacement coverage; run on emulator.
- [x] 5. Inspect obsolete references and APK contents, run TypeScript/Jest/JVM/build/device checks, update active documentation, independently review and fix findings.

## Ownership and integration
RN task owns mobile/src/media, package files, app.json and decode help text. Native dependency task owns build dependency/provenance scripts and notices. Root owns Kotlin Player/View/manager, native removals and integration tests. Interface: AutoDLVideoView props source:string, decodeMode:auto|hardware|software, retryToken:number; onPlayback event status:loading|firstFrame|playing|paused|ended|decodeFailed|sourceUnavailable, positionMs:number. Same native view stays mounted during ordinary state/mode changes.

## Execution record
Working on codex/unified-mpv-playback in existing prepared checkout to retain Android build/runtime access. Existing untracked docs/workflows is user-owned and excluded. Native dependency and RN tasks have disjoint files; native Player consumes artifact/API findings and RN contract above.

- RN implementation and dependency removal: complete. Typed native events now also echo source/retryToken; JS drops stale queued events. Focused 114 tests + TypeScript passed; full Jest 1122 passed, 2 existing skipped.
- Android source and instrumentation compiled; 48 JVM tests passed again after final native/surface fixes. Test-first failures observed for missing unified view and policy implementations.
- Ruling: minimum Android API raised to26 to match audited libmpv artifact, instead of overriding its manifest compatibility requirement. User informed.
- Ruling: preserve FFmpegKit thumbnail/export processing, but isolate libmpv's differently versioned FFmpeg/C++ dynamic dependencies with a deterministic ELF SONAME/NEEDED relocation. Never use pickFirst to substitute incompatible codecs.
- Final native build and nine device tests passed. Actual RN auto/software and fullscreen pictures verified after fixing pre-attachment loading. APK contains no VLC/expo-video/obsolete player classes, and all 171 native libraries pass required alignment checks. Physical-device performance/HDR and actual 16KB-runtime claims require separate evidence.
- Final verification record: docs/reviews/2026-09-10-unified-mpv-migration.md. Source package end-to-end generation and ZIP/source identity checks passed (19 pinned payloads, no obsolete VLC sources).

## Review follow-up boundary
Review fixes and updated tests complete. FreeType dlg archive rebuilt; full corrected source ZIP awaits GitHub connectivity for libplacebo submodules. Do not distribute the previous ZIP as the review-fixed source package. See review evidence for the failed network operations.

Second review: current-source rebuild and nine device tests passed, installed APK hash matched. Optimized verifier regressions passed. Full source ZIP including dlg rebuilt and repeat assembly hashes matched; previous network block is resolved.
