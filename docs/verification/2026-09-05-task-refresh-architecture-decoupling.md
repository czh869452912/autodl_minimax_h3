# Task refresh decoupling verification — 2026-09-05

Follow-up: a real-device stale task projection and SQLite contention regression was subsequently found and fixed. See the [regression report](2026-09-05-task-refresh-regression-fix.md); the earlier in-process tests below did not establish independent-connection write correctness.

Implementation and inline review are complete through Tasks 1–10. Task 11 remains **partially complete**: there is no public HTTPS endpoint for the generated video, and the measurements below use a self-contained debug APK rather than a release-equivalent build. These measurements do not establish full transfer/UI performance acceptance. Integration remains subject to [PERF-1](2026-09-05-task-refresh-follow-ups.md#perf-1-full-transfer-and-release-performance-acceptance).

## Source and automated checks

Worktree: `.worktrees/task-refresh-decoupling`; branch: `codex/task-refresh-decoupling`; implementation/review commit: `73951187`.

- `npm run typecheck`: passed.
- `npm run verify:workflow-releases`: passed, two pinned workflow releases and `mobile-1.4.10@93a5882eda1013a0232588ec824d817b8dd63f6317f4ecd08c9c09206b6305c5` verified.
- `npm test -- --runInBand`: **120 suites / 692 tests passed**, one suite / two tests skipped. The process-recovery child suite is intentionally gated by environment variables and exercised by its parent acceptance test; the other skipped test requires `AUTODL_CONTRACT_LIVE=1`. Local output: `.superpowers/jest-final.log`.
- Android JVM: **35 tests, zero failures/errors**, including 24 transfer/policy tests. Android matrix completion is recorded below.
- `git diff --check`: passed.

Final static commands from `mobile` returned exit 1 with no matches:

```powershell
rg -n 'syncTaskRun|syncTasks|createSyncTaskRunner|createMediaCommandFacade' app src index.js
rg -n 'new File\([^\r\n]*\)\.write|CryptoJS\.algo\.SHA256' src/media/cas.ts src/workflows/executor/artifactOperation.ts
rg -n 'ExecutorRunner|executorRunner|durableExecutor|\.runSlice\(' 'app/(tabs)/tasks.tsx' 'app/video/[id].tsx' src/create/CreateForm.tsx
rg -n 'new File\([^\r\n]*\)\.write|readChunks\(|wordArray\(' src/media src/workflows/executor -g '!*.test.ts'
```

The broader original Task 10 scan also finds two `readChunks` definitions in test fixtures. Those fixtures feed `src/test/streamCas.ts`; production publication still exercises `src/media/cas.ts`. Excluding `*.test.ts` expresses the intended production boundary without deleting recovery tests.

## Review corrections

Inline review, as requested, identified and corrected:

- Async executor claims now return/verify the owned operation; all lanes share one tick-start SQL snapshot, and recovery-state database errors propagate.
- Maintenance/reconciliation and CAS garbage collection use asynchronous database calls and bounded task batches. Artifact/export recovery guards no longer synchronously query recovery state.
- Maintenance has a persisted five-minute cooldown across runner instances. An outstanding explicit maintenance generation bypasses it once; later wakes survive acknowledgement of an earlier slice.
- History beyond 120 rows can be appended using keyset pages. Refresh rebuilds only the bounded first 120 rows and resets the cursor after deletion/reordering.
- StrictMode effect replay no longer permanently disposes the active session; unused render-created sessions do not subscribe to global events.
- Requests from both pending and completion subscribers preserve single-flight/trailing-read behavior.
- Global task activity uses a covering index on `(status, download_state, export_state)`. A real SQLite `EXPLAIN QUERY PLAN` regression failed before this index and passed afterward, replacing `SCAN tasks` with a covering-index scan.

The new index remains in unshipped schema v8, consistent with the earlier migration ruling. A developer database already upgraded by an intermediate branch commit needs a fresh fixture/reset or a later migration to acquire all v8 additions; shipped v7 databases receive them during upgrade. See [DEV-1](2026-09-05-task-refresh-follow-ups.md#dev-1-intermediate-v8-development-databases).

Route tests verify that first-page hydration and manual refresh finish while worker/maintenance promises remain unresolved. Session tests verify no idle timer, unchanged-object reuse, revision fences, cross-runtime revision discovery, stale recovery, pagination, and disposal. Command tests verify atomic intent/projection/wake rollback and durable acknowledgement. Native tests verify redirect policy, timeouts, cancellation, limits, hashes, and publication ownership. These automated checks are distinct from an interactive device test during a real download.

## Device and fixture

- AVD: `test_phone` (verified with `adb emu avd name`), serial `emulator-5554`, model `sdk_gphone64_x86_64`.
- Android 15 / API 35; fingerprint `google/sdk_gphone64_x86_64/emu64xa:15/AE3A.240806.036/12592187:user/release-keys`.
- Reported memory: 2,532,432 KiB. Host: Windows; Node 22.22.2; Java 21.
- Benchmark: x86_64 self-contained debug APK, Hermes bytecode, dedicated benchmark entry. It uses a separate `task-refresh-v7.db`; the user's normal application database is not seeded or cleared.
- 1,000 tasks: 50 RUNNING, 950 SUCCESS; 20 pending operations, mixed due times. Task inputs and attachment JSON are deliberately large.
- Database SHA-256 before migration: `b97aa07346e2c5a9f6895183cf23b03653c1416f3ee378edccdbe071a56ccecd`.
- Video: 134,217,728 bytes (128 MiB), deterministic two-second 320×180 H.264 MP4 with a valid `free` atom for padding. The media payload itself is small; this exercises large-file hashing/I/O, not high-resolution decoding throughput.
- Video SHA-256: `bba18adeb06df21717dd9105721fdba4ea9c5d17f03bccb33d3243a8d6733c07`.

## Measured results

Raw samples: [before index](task-refresh-benchmark-before.json), [after index](task-refresh-benchmark-after.json). Both runs use the same emulator, fixture and benchmark harness. The after run restores the v7 fixture before migration. No device reboot or OS page-cache eviction was performed. Each of the five reads opens a new SQLite connection; these are **connection-cold reads**, not five independent cold application starts. Index creation and fixture copying can warm filesystem caches, so the full improvement cannot be attributed exclusively to the index.

| Measurement | Before index | After index | Assessment |
|---|---:|---:|---|
| First 40-row read p95, five samples | 440.63 ms | 10.36 ms | After sample set below 150 ms; full release gate pending |
| First-page raw samples, ms | 440.63, 18.35, 17.70, 17.12, 15.94 | 10.05, 9.38, 9.48, 10.36, 9.42 | Connection-cold method above |
| Native hash 1 | 141.56 ms | 179.90 ms | Correct SHA-256 |
| Native hash 2 | 144.04 ms | 112.90 ms | Correct SHA-256 |
| Native video probe | 454.46 ms | 454.50 ms | 3 decoded frames, 48 samples, 1 video track |
| CAS adoption + publication | 224.09 ms | 410.72 ms | Correct hash, byte count and CAS path |
| Maximum JS event-loop stall | 30.61 ms | 30.58 ms | Below 250 ms during measured local phases only |
| Unchanged revision card-window reads | 0 | 0 | Pass; all existing card references reused |
| Full HTTPS transfer | Not run | Not run | [PERF-1](2026-09-05-task-refresh-follow-ups.md#perf-1-full-transfer-and-release-performance-acceptance) |

p95 uses nearest rank (`ceil(0.95 × 5)`), therefore the maximum of five values. Twenty warm revision samples per run and every event-loop sample are in the linked JSON files. Stall is `max(0, actual interval − 16 ms)` from a 16 ms JS interval surrounding native hashes, probe, fixture copy and CAS publication. The harness invokes the real native hasher twice on a local file; it does not substitute these timings for the transfer's streaming hash or durable reread.

Logcat scans for `ANR in`, `FATAL EXCEPTION`, and `Input dispatching timed out` returned no matches during these runs. Local full logs: `.superpowers/device-benchmark-logcat.txt` and `.superpowers/device-benchmark-after-logcat.txt`. No claim is made about input latency or ANRs during an unperformed HTTPS download.

## Reproduction

From `mobile`, with Node 22 supporting TypeScript stripping and `ffmpeg` on PATH:

```powershell
node scripts/seed-task-refresh-benchmark.mjs ../.superpowers/task-refresh-benchmark
```

Use a fresh output directory on each generation. Save the printed JSON as `.superpowers/benchmark-fixture.json`. It supplies the expected video hash to the harness.

The installed SDK's Ninja 1.10.2 repeatedly failed with `build.ninja still dirty after 100 tries` on long worktree paths. Ninja 1.13.2 at `C:/msys64/ucrt64/bin/ninja.exe` compiled the same graph. An ignored `.superpowers/ninja.init.gradle` provides this local tool override without changing the SDK or committed Gradle configuration:

```groovy
allprojects {
  afterEvaluate { p ->
    if (p.hasProperty('android')) {
      p.android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_MAKE_PROGRAM=C:/msys64/ucrt64/bin/ninja.exe'
    }
  }
}
```

For the dedicated harness, copy that init file to `.superpowers/benchmark.init.gradle` and add inside `afterEvaluate`:

```groovy
if (p.name == 'app') {
  p.extensions.getByName('react').entryFile.set(p.file('../../scripts/task-refresh-device-benchmark.jsx'))
}
```

From `mobile/android`:

```powershell
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --max-workers=2 -I ../../.superpowers/benchmark.init.gradle --no-daemon --console=plain
```

Install this debug APK with `adb install -r`. Push the generated database/video/config to `/data/local/tmp`, then copy with `adb shell run-as com.example.autodlh3 cp` into `files/SQLite/task-refresh-v7.db`, `files/task-refresh-128MiB.mp4`, and `files/task-refresh-benchmark-config.json`. Force-stop the app before replacing the dedicated fixture; launch `com.example.autodlh3/.MainActivity`. Read results with:

```powershell
adb exec-out run-as com.example.autodlh3 cat files/task-refresh-benchmark-results.json
adb logcat -d
```

The harness writes `files/task-refresh-benchmark-error.txt` if validation fails. For subsequent runs, preserve the previous result, restore the fixture and clear stale result/error files before launch. Fixtures, APKs, complete logs and Gradle caches stay ignored; only scripts and small raw results are committed.

Restore the normal app entry by building without the benchmark init file and installing the normal APK. Full Android matrix:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:connectedDebugAndroidTest --max-workers=2 -I ../../.superpowers/ninja.init.gradle --no-daemon --console=plain
```

Android matrix: **BUILD SUCCESSFUL in 4m 33s**, 429 tasks, all default ABIs assembled; JVM 35/35 and connected instrumentation 1/1 passed (1.221 s, zero failures/errors). Output: `.superpowers/android-final.log`; connected XML: `mobile/android/app/build/outputs/androidTest-results/connected/debug/`. An earlier direct instrumentation invocation also passed 1/1 after an interrupted Gradle run; the complete final matrix supersedes it.

Normal-entry UI smoke: rebuilt once more after the final session change (`BUILD SUCCESSFUL in 1m 17s`) and installed with `adb install -r`. Cold launch succeeded (ActivityManager reported 1,887 ms; not a projection-read measurement). Opened task queue, observed `暂无任务` and `已更新 08:51:54`, tapped refresh and observed `已更新 08:52:17` without a pending indicator, navigated to settings and back to tasks. This normal database is empty; the 1,000-task fixture remains isolated in the benchmark database. UI trees and screenshot are under `.superpowers/task-refresh-*-ui.xml` and `.superpowers/task-refresh-normal.png`. Logcat error/ANR/input-timeout scans returned no matches. This confirms normal-entry navigation and idle refresh only, not interaction during transfer.
