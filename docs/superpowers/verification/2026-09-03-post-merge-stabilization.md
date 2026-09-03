# Post-merge stabilization verification

Date: 2026-09-03 (Asia/Shanghai)

## Automated media-delivery evidence

- `mediaDeliveryAcceptance.test.ts` uses the real v6 SQLite schema and drives one job through four bounded passes: `SUBMIT -> STATUS_SYNC -> ARTIFACT_DOWNLOAD -> EXPORT`.
- The acceptance assertion verifies the terminal artifact, app media asset, downloaded task projection, exported delivery URI, and completed export operation.
- A second cycle verifies that native publication and the `media_deliveries` row remain singletons.
- Focused repository tests cover transactional artifact replacement, missing projection failure, export enqueue policy, exact blob-reference release, bounded reconciliation, stale-file repair, and transactional task removal.

## Android emulator evidence

Target discovered: `emulator-5554`, Android x86_64.

Installation is currently blocked before APK deployment by an existing Windows/CMake path-regeneration failure in native dependencies:

- Full ABI build: `react-native-worklets:buildCMakeDebug[armeabi-v7a][worklets]` ends with `ninja: error: manifest 'build.ninja' still dirty after 100 tries`.
- x86_64-only retry: `expo-modules-core:buildCMakeDebug[x86_64]` and `react-native-reanimated:buildCMakeDebug[x86_64]` fail with the same dirty-manifest loop; CMake also reports object paths beyond its safe 250-character limit under the worktree path.
- The JavaScript bundle completes before the native build failure. No APK containing this branch was installed, so the five device scenarios below are not marked passed.

Pending on a short-path checkout or fixed native build environment:

1. Auto-export on, private copy on: verify task details, result gallery, and `Movies/AutoDL-H3` all contain the completed video without manual refresh.
2. Auto-export off: verify app gallery playback and no new system-gallery item.
3. Auto-export on, private copy off: verify system-gallery playback, cleared private projections, and later bounded CAS collection.
4. Force-stop between native publication and SQLite success commit: verify restart replays without a duplicate MediaStore row.
5. Seed a pre-fix missing asset/delivery row: verify opening the app repairs it without clearing app data.

## Prompt data-correctness evidence

- Automated matrix: 8 suites and 59 tests passed on 2026-09-03; TypeScript checking passed.
- Covered: same-batch and cross-source attachment identity, mention stability, deterministic history ordering, normalized visible-row counts, duplicate-title disambiguation, runtime generation revocation, final flush, eviction, and late-event rejection.
- The expected provider-failure test logs its deliberately injected `provider failed` error; the suite exits successfully.

Pending device checks remain blocked by the native CMake issue described above: multi-image chip removal, mixed provider/gallery mentions, duplicate-title navigation, visible Timeline counts, model changes during streaming, and deletion during generation.

## Prompt Timeline P0 evidence

- Focus-state tests cover the exact 48-pixel bottom threshold, drag detachment, bottom reattachment, and explicit return-to-latest.
- Component tests verify that streamed content and layout changes do not take over a detached viewport, while reaching the bottom or tapping `回到最新` restores following.
- Run-recovery tests verify inline provider errors and user aborts, issue isolation across thread-keyed sessions, disabled in-flight retry, and direct core reruns that leave the existing user-message array unchanged.
- Action tests verify per-answer clipboard content and that empty-state suggestions populate and focus the composer without calling `submitMessage`.

Pending device checks remain blocked by the native CMake issue described above: long streamed response following, detached viewport stability during tool/keyboard/layout changes, return-to-latest, provider-error retry, stopped-run retry, clipboard inspection, and suggestion focus/send separation.

## Final automated regression

Recorded at 2026-09-03 22:03:41 +08:00 from `codex/post-merge-stabilization` after the final independent review:

- `npm test -- --runInBand`: 104 suites passed, 1 skipped; 520 tests passed, 2 skipped; exit 0.
- `npm run typecheck`: exit 0.
- `git diff --check`: exit 0 for the working tree.
- `git diff --check ce7a6a2c..HEAD`: exit 0.
- The `aguiAgent.test.ts` provider-failure case intentionally emits its injected `provider failed` console error; it is an asserted failure-path fixture, not a suite failure.

## Independent review closure

- The first independent review found seven Important issues in async cycle time, task deletion, reconciliation pagination, runtime replacement, retry-tail handling, MediaStore naming, and CAS collection ordering.
- Two follow-up reviews found and drove closure of cross-executor deletion/GC lease races and valid-to-invalid runtime revocation.
- The final review of `adc4a877..ac6efc78` reported no remaining or newly introduced Critical/Important findings.
- Added regressions cover scheduled-operation clock refresh, transactional operation cancellation, persisted repair-page progress, latest-snapshot runtime hydration, partial-tail removal, native-safe hashed export identity, atomic/renewed CAS GC leases, and invalid-config runtime disposal.
