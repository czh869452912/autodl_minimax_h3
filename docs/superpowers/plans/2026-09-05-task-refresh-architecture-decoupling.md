# Task Refresh Architecture Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task-list refresh a fast SQLite projection read, while durable executor work, media transfer, hashing, maintenance, and retries run independently without freezing the React Native UI or losing refresh requests.

**Architecture:** SQLite task projections remain authoritative. A `TaskListSession` owns consistent revision-fenced reads, pagination, trailing refreshes, and structural sharing. `TaskCommandService` persists intent and signals a durable wake; a foreground scheduler, BackgroundTask, and Headless JS call `ExecutorRunner` separately. Android performs artifact network streaming and both full-file SHA-256 passes on a native executor.

**Tech Stack:** React Native 0.86, Expo 57, TypeScript 6, React 19 external-store APIs, expo-sqlite, Kotlin/Android, OkHttp 4.12, Jest 29, JUnit 4.

---

## Working rules

- Work from `D:\Claude-project\autodl_minimax_h3`; run JavaScript commands from `mobile` unless a command says otherwise.
- Preserve the untracked review document under `docs/reviews/`; do not include it in implementation commits unless explicitly requested.
- Follow red-green-refactor for every task. Run the focused failing test before changing production code and record the expected failure named below.
- Do not let UI modules import `ExecutorRunner`, `syncTaskRun`, `cycle`, or `durableExecutor`.
- Do not claim the responsiveness fix complete until the Android device acceptance in Task 11 has fresh measurements.

## Review finding traceability

| Finding | Disposition | Implementation tasks |
|---|---|---|
| F1: two CryptoJS full-file hashes | Confirmed; runtime magnitude still requires device measurement | 1, 2, 10, 11 |
| F2: synchronous `File.write()` per chunk | Confirmed | 1, 2, 10, 11 |
| F3: synchronous SQLite executor hot paths | Confirmed; exact performance share is not yet measured | 3, 5, 11 |
| F4: UI refresh awaits a complete executor cycle | Confirmed | 6, 7, 9, 10 |
| L1: 250 ms executor-driven UI poll | Confirmed as a hot poll, not overlapping execution | 6, 8, 9 |
| L2: whole-list replacement and excess JSON parsing | Confirmed | 4, 8, 9 |
| L3: manual refresh forces maintenance | Confirmed | 3, 6, 7, 9 |
| C1: `loadInFlight` drops overlapping requests | Confirmed | 8, 9 |
| C2: visible-page-only activity detection | Partly confirmed; persisted wakes mask some cases | 4, 8, 9 |
| C3: second read makes the snapshot older | Rejected as a root cause; the redundant compound read still disappears | 4, 9, 10 |
| C4: automatic refresh errors are invisible | Confirmed | 8, 9 |
| C5: no event-driven invalidation | Confirmed as an architectural limitation | 3, 6, 8 |

## Task 1: Move artifact transfer and hashing off the JS thread

**Files:**

- Modify: `mobile/android/app/build.gradle`
- Create: `mobile/android/app/src/main/java/com/example/autodlh3/ArtifactTransferPolicy.kt`
- Create: `mobile/android/app/src/main/java/com/example/autodlh3/ArtifactTransfer.kt`
- Create: `mobile/android/app/src/test/java/com/example/autodlh3/ArtifactTransferPolicyTest.kt`
- Create: `mobile/android/app/src/test/java/com/example/autodlh3/ArtifactTransferTest.kt`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt`
- Modify: `mobile/src/native/media.ts`
- Modify: `mobile/src/native/media.test.ts`

- [ ] **Step 1: Add failing native policy and transfer tests**

  Cover HTTPS-only URLs, embedded credentials, host allowlist, DNS results containing loopback/private/link-local addresses, safe redirects, unsafe redirect rejection, MIME mismatch, declared and streamed size overflow, connect/read timeout, cancellation, provider SHA mismatch, and durable reread mismatch. Inject DNS, clock, validator, and an HTTP client so `MockWebServer` can exercise redirects without weakening production localhost rejection.

- [ ] **Step 2: Run the focused tests and confirm red**

  Run:

  ```powershell
  Set-Location mobile/android
  .\gradlew.bat :app:testDebugUnitTest --tests "com.example.autodlh3.ArtifactTransfer*" --no-daemon --console=plain
  ```

  Expected: compilation fails because `ArtifactTransferPolicy` and `ArtifactTransfer` do not exist.

- [ ] **Step 3: Add explicit HTTP test/runtime dependencies**

  Add to `dependencies` in `mobile/android/app/build.gradle`:

  ```groovy
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
  ```

- [ ] **Step 4: Implement the native security policy**

  `ArtifactTransferPolicy` must normalize the provider host allowlist, reject non-HTTPS URLs and user-info, resolve every candidate host, reject any non-public address result, and repeat the checks for every redirect. Use `InetAddress` properties plus explicit carrier-grade NAT, benchmark, documentation, multicast, unspecified, IPv4-mapped IPv6, and unique-local IPv6 ranges. Limit redirects to five.

  Expose these concrete types:

  ```kotlin
  data class ArtifactTransferRequest(
    val url: String,
    val allowedHosts: Set<String>,
    val allowProviderSuppliedPublicHosts: Boolean,
    val acceptedMimes: Set<String>,
    val maxBytes: Long,
    val connectTimeoutMs: Long,
    val idleTimeoutMs: Long,
    val expectedSha256: String?,
    val operationId: String,
    val operationAttempt: Int,
  )

  data class ArtifactTransferResult(
    val partUri: String,
    val finalUrl: String,
    val mime: String,
    val byteSize: Long,
    val sha256: String,
  )
  ```

- [ ] **Step 5: Implement streaming, cancellation, and durable reread**

  Configure OkHttp with redirects disabled and per-request connect/read timeouts. Follow redirects manually through the policy. Stream 64 KiB chunks directly to `filesDir/cas/parts/{sha256(operationId + "\u0000" + operationAttempt)}.part`, update `MessageDigest` during the write, enforce the actual byte limit, flush and close, then call the existing `MediaIntegrity.sha256()` for a second native reread. Remove the part on all failures and cancellation. Throttle progress to at most one callback per second or each additional 5 MiB.

- [ ] **Step 6: Expose the React Native bridge**

  Add `transferArtifact(options, promise)` and `cancelArtifactTransfer(operationId, promise)` to `MediaModule`; execute both through the module's dedicated executor and track active OkHttp calls by operation ID. Add validated TypeScript wrappers:

  ```ts
  export type NativeArtifactTransferRequest = Readonly<{
    url: string;
    allowedHosts: readonly string[];
    allowProviderSuppliedPublicHosts: boolean;
    acceptedMimes: readonly string[];
    maxBytes: number;
    connectTimeoutMs: number;
    idleTimeoutMs: number;
    expectedSha256?: string;
    operationId: string;
    operationAttempt: number;
  }>;

  export type NativeArtifactTransferResult = Readonly<{
    partUri: string;
    finalUrl: string;
    mime: string;
    byteSize: number;
    sha256: string;
  }>;
  ```

  The wrapper must reject malformed hashes, non-positive byte sizes, unexpected URI schemes, or a missing Android module as `MediaIntegrityError` with stable diagnostic codes.

- [ ] **Step 7: Run focused tests and commit**

  ```powershell
  Set-Location mobile/android
  .\gradlew.bat :app:testDebugUnitTest --tests "com.example.autodlh3.ArtifactTransfer*" --no-daemon --console=plain
  Set-Location ../..
  npm test -- --runInBand src/native/media.test.ts
  git add android/app/build.gradle android/app/src/main/java/com/example/autodlh3/ArtifactTransferPolicy.kt android/app/src/main/java/com/example/autodlh3/ArtifactTransfer.kt android/app/src/main/java/com/example/autodlh3/MediaModule.kt android/app/src/test/java/com/example/autodlh3/ArtifactTransferPolicyTest.kt android/app/src/test/java/com/example/autodlh3/ArtifactTransferTest.kt src/native/media.ts src/native/media.test.ts
  git commit -m "feat: stream artifacts on the Android executor"
  ```

  Expected: both focused suites pass.

## Task 2: Adopt native parts into CAS and remove production JS media hashing

**Files:**

- Modify: `mobile/src/media/cas.ts`
- Modify: `mobile/src/media/cas.test.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.test.ts`
- Modify: `mobile/src/workflows/executor/mediaDeliveryAcceptance.test.ts`

- [ ] **Step 1: Write failing CAS adoption tests**

  Add tests proving a native part is accepted only when its URI is below `documentDirectory/cas/parts`, its size and native reread hash match the native result, provider hash matches case-insensitively, publication keeps the existing quarantine/race behavior, lease loss aborts, and abort removes only the owned part. Add an artifact-operation test that fails if `openArtifactDownload`, `CasFiles.write`, or CryptoJS full-file hashing is reached.

- [ ] **Step 2: Run the focused tests and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/media/cas.test.ts src/workflows/executor/artifactOperation.test.ts
  ```

  Expected: tests fail because `ArtifactCas.adoptNativePart` and the native transfer dependency do not exist.

- [ ] **Step 3: Add native-part adoption without weakening CAS publication**

  Extend `ArtifactCas` with:

  ```ts
  export type NativeStagedArtifact = Readonly<{
    partUri: string;
    mime: string;
    byteSize: number;
    sha256: string;
  }>;

  export type ArtifactCas = {
    adoptNativePart(input: NativeStagedArtifact, options: ArtifactCasPutOptions): Promise<StagedArtifact>;
    stage(stream: AsyncIterable<Uint8Array>, options: ArtifactCasPutOptions): Promise<StagedArtifact>;
    put(stream: AsyncIterable<Uint8Array>, options: ArtifactCasPutOptions): Promise<ArtifactCasBlob>;
  };
  ```

  Reuse the current destination inspection, quarantine, move/copy race, and abort state machine. Production adoption must use injected native `sha256File`; it must not call `readChunks` or `wordArray`. Keep stream staging only for compatibility-focused unit tests and non-production callers until Task 10 removes unused code.

- [ ] **Step 4: Switch artifact execution to native transfer**

  Replace `openDownload` in `ArtifactOperationDeps` with `transferArtifact`. Pass the current policy and expected provider hash, adopt the returned part, then preserve the existing sequence: video probe, blob reservation, CAS publish, atomic projection/operation commit. On lease loss call native cancellation and abort the part. Map native diagnostics through `artifactError()` to the existing retry/terminal policy.

- [ ] **Step 5: Verify focused behavior and commit**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/media/cas.test.ts src/workflows/executor/artifactOperation.test.ts src/workflows/executor/mediaDeliveryAcceptance.test.ts
  npm run typecheck
  git add src/media/cas.ts src/media/cas.test.ts src/workflows/executor/artifactOperation.ts src/workflows/executor/artifactOperation.test.ts src/workflows/executor/mediaDeliveryAcceptance.test.ts
  git commit -m "refactor: publish native artifact parts through CAS"
  ```

  Expected: all focused suites and typecheck pass; the artifact production path contains no `openArtifactDownload` call.

## Task 3: Add schema v8 projection revision, wake generation, and claim index

**Files:**

- Modify: `mobile/src/storage/schema.ts`
- Create: `mobile/src/storage/migrations/v8TaskRefresh.ts`
- Modify: `mobile/src/storage/migrations/runner.ts`
- Modify: `mobile/src/storage/migrations/runner.test.ts`
- Modify: `mobile/src/storage/schemaOwnership.test.ts`

- [ ] **Step 1: Write failing v8 migration tests**

  Cover fresh creation, v7-to-v8 upgrade, idempotent rerun, backup failure recovery, and preservation of representative rows in `workflow_jobs`, `tasks`, `workflow_operations`, `workflow_artifacts`, `artifact_blobs`, `artifact_blob_refs`, `media_assets`, and `media_deliveries`. Verify each task insert, update, and delete increments revision exactly once. Verify an expired-claim query uses the new index with `EXPLAIN QUERY PLAN`.

- [ ] **Step 2: Run the migration tests and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/storage/migrations/runner.test.ts src/storage/schemaOwnership.test.ts
  ```

  Expected: assertions expecting schema version 8 and the new tables/triggers fail.

- [ ] **Step 3: Implement the v8 migration**

  Set `APP_SCHEMA_VERSION = 8`, add both tables to `APP_TABLES`, and apply exactly these durable shapes:

  ```sql
  CREATE TABLE IF NOT EXISTS task_projection_state (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1),
    revision INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO task_projection_state(singleton, revision) VALUES (1, 0);

  CREATE TABLE IF NOT EXISTS executor_wake_state (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1),
    generation INTEGER NOT NULL,
    handled_generation INTEGER NOT NULL,
    maintenance_generation INTEGER NOT NULL,
    requested_at INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO executor_wake_state(
    singleton, generation, handled_generation, maintenance_generation, requested_at
  ) VALUES (1, 0, 0, 0, 0);

  CREATE TRIGGER IF NOT EXISTS tasks_projection_revision_insert
  AFTER INSERT ON tasks BEGIN
    UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1;
  END;
  CREATE TRIGGER IF NOT EXISTS tasks_projection_revision_update
  AFTER UPDATE ON tasks BEGIN
    UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1;
  END;
  CREATE TRIGGER IF NOT EXISTS tasks_projection_revision_delete
  AFTER DELETE ON tasks BEGIN
    UPDATE task_projection_state SET revision = revision + 1 WHERE singleton = 1;
  END;

  CREATE INDEX IF NOT EXISTS idx_workflow_operations_expired_claim
  ON workflow_operations(state, lease_expires_at, id);
  ```

  Register `v8TaskRefresh` after `v7RegistryRelease`, and call it from `applyCurrentSchema`. Keep the reserved D-Core migration at v9.

- [ ] **Step 4: Run migration tests and commit**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/storage/migrations/runner.test.ts src/storage/schemaOwnership.test.ts src/storage/database.test.ts
  git add src/storage/schema.ts src/storage/migrations/v8TaskRefresh.ts src/storage/migrations/runner.ts src/storage/migrations/runner.test.ts src/storage/schemaOwnership.test.ts
  git commit -m "feat: add task projection revision and executor wake state"
  ```

  Expected: the focused suites pass and an upgraded v7 database reports `PRAGMA user_version = 8`.

## Task 4: Build the lightweight projection repository

**Files:**

- Create: `mobile/src/tasks/taskCard.ts`
- Create: `mobile/src/tasks/projectionRepository.ts`
- Create: `mobile/src/tasks/projectionRepository.test.ts`
- Modify: `mobile/src/tasks/repository.ts`

- [ ] **Step 1: Write failing projection tests**

  Seed 1,000 tasks including large invalid `input_json`, `images_json`, and `audios_json` values. Assert the first 40 `TaskCard` values still load, proving the query neither selects nor parses those columns. Cover keyset pagination, a 120-row cap, task status/download/export activity outside page one, operation due/scheduled counts, revision reads, and a revision change between the two fences.

- [ ] **Step 2: Run the focused test and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/tasks/projectionRepository.test.ts
  ```

  Expected: Jest cannot resolve `projectionRepository`.

- [ ] **Step 3: Define the displayed DTO**

  `TaskCard` contains only fields rendered or used for task-row actions:

  ```ts
  export type TaskCard = Readonly<{
    id: string;
    prompt: string;
    status: TaskStatus;
    resolution: string;
    duration: number;
    videoUrl?: string;
    localUri?: string;
    thumbnailUrl?: string;
    downloadState: DownloadState;
    downloadError?: string;
    downloadProgress?: number;
    galleryUri?: string;
    exportState: ExportState;
    exportError?: string;
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    executionDuration?: number;
    syncError?: string;
    lastSyncAt?: number;
  }>;
  ```

- [ ] **Step 4: Implement async lightweight reads**

  Add `readRevision()`, `readWindow(limit)`, `readActivity(now)`, and `readConsistentWindow(limit, maxAttempts = 2)`. Use only `getFirstAsync`/`getAllAsync`; list the DTO columns explicitly. `readConsistentWindow` reads revision before and after page plus activity; if the fence changes twice, return a typed `ProjectionChangedDuringRead` so the session schedules a trailing read instead of publishing mixed data.

  Global activity is based on the entire database, not the visible page. Count active task states and pending/claimed workflow operations; return `remainingDue`, `remainingScheduled`, and the earliest effective `nextWakeAt`.

- [ ] **Step 5: Verify and commit**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/tasks/projectionRepository.test.ts src/tasks/repository.test.ts
  npm run typecheck
  git add src/tasks/taskCard.ts src/tasks/projectionRepository.ts src/tasks/projectionRepository.test.ts src/tasks/repository.ts
  git commit -m "feat: add lightweight revision-fenced task projections"
  ```

  Expected: tests pass even with invalid large JSON in unselected columns.

## Task 5: Make executor database hot paths asynchronous and bounded

**Files:**

- Modify: `mobile/src/workflows/executor/operationRepository.ts`
- Modify: `mobile/src/workflows/executor/operationRepository.test.ts`
- Modify: `mobile/src/workflows/executor/tick.ts`
- Modify: `mobile/src/workflows/executor/tick.test.ts`
- Modify: `mobile/src/workflows/executor/durableExecutor.ts`
- Modify: `mobile/src/workflows/executor/durableExecutor.test.ts`
- Modify: `mobile/src/workflows/executor/cycle.ts`
- Modify: `mobile/src/workflows/executor/cycle.test.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.test.ts`
- Modify: `mobile/src/workflows/executor/exportOperation.ts`
- Modify: `mobile/src/workflows/executor/exportOperation.test.ts`
- Modify: `mobile/src/workflows/executor/mediaCommandService.ts`
- Modify: `mobile/src/workflows/executor/mediaCommandService.test.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/tasks/sync.test.ts`

- [ ] **Step 1: Change tests to the asynchronous contract**

  Update repository consumers in tests to await reads and writes. Add a regression proving `recoverExpired(now, limit)` repairs no more than 32 rows and reports `hasMore`; add a tick test proving work inserted during a running tick is left as due work for the next slice.

- [ ] **Step 2: Run focused tests and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/workflows/executor/operationRepository.test.ts src/workflows/executor/tick.test.ts src/workflows/executor/cycle.test.ts
  ```

  Expected: tests fail because repository methods are synchronous and `recoverExpired` has no bound.

- [ ] **Step 3: Convert executor hot paths to expo-sqlite async methods**

  Make `get`, `listDue`, `pendingSummary`, `countOutstanding`, `claimById`, `renew`, `release`, `retry`, `finish`, and `recoverExpired` return promises. Use `withExclusiveTransactionAsync` for claim and recovery compare-and-set groups. Update artifact, export, durable-executor, cycle, temporary sync-runner, and media-command consumers to await the new contract. Keep the durable command enqueue transaction synchronous only until Task 7 replaces it with an async exclusive transaction.

  Define recovery output as:

  ```ts
  export type ExpiredRecovery = Readonly<{
    uncertainSubmits: readonly WorkflowOperation[];
    reopened: number;
    hasMore: boolean;
  }>;
  ```

- [ ] **Step 4: Bound tick/cycle work**

  Await every operation repository call. Keep lane limits `{ SUBMIT: 1, STATUS_SYNC: 4, ARTIFACT_DOWNLOAD: 1, EXPORT: 1 }`, cap one tick at eight operations and one cycle at 32 operations or 2,000 ms, whichever occurs first. Remove the `inFlight` coalescer from `tick`; concurrency belongs to the scheduler lease in Task 6.

- [ ] **Step 5: Verify executor acceptance and commit**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/workflows/executor/operationRepository.test.ts src/workflows/executor/tick.test.ts src/workflows/executor/durableExecutor.test.ts src/workflows/executor/cycle.test.ts src/workflows/executor/artifactOperation.test.ts src/workflows/executor/exportOperation.test.ts src/workflows/executor/mediaCommandService.test.ts src/workflows/executor/recoveryAcceptance.test.ts src/workflows/executor/recoveryProcessAcceptance.test.ts src/tasks/sync.test.ts
  npm run typecheck
  git add src/workflows/executor/operationRepository.ts src/workflows/executor/operationRepository.test.ts src/workflows/executor/tick.ts src/workflows/executor/tick.test.ts src/workflows/executor/durableExecutor.ts src/workflows/executor/durableExecutor.test.ts src/workflows/executor/cycle.ts src/workflows/executor/cycle.test.ts src/workflows/executor/artifactOperation.ts src/workflows/executor/artifactOperation.test.ts src/workflows/executor/exportOperation.ts src/workflows/executor/exportOperation.test.ts src/workflows/executor/mediaCommandService.ts src/workflows/executor/mediaCommandService.test.ts src/tasks/sync.ts src/tasks/sync.test.ts
  git commit -m "refactor: bound asynchronous executor database work"
  ```

  Expected: focused executor suites and typecheck pass.

## Task 6: Introduce durable wake state, runner, and foreground scheduler

**Files:**

- Create: `mobile/src/tasks/executorWakeRepository.ts`
- Create: `mobile/src/tasks/executorWakeRepository.test.ts`
- Create: `mobile/src/tasks/executorEvents.ts`
- Create: `mobile/src/tasks/executorRunner.ts`
- Create: `mobile/src/tasks/executorRunner.test.ts`
- Create: `mobile/src/tasks/foregroundExecutorScheduler.ts`
- Create: `mobile/src/tasks/foregroundExecutorScheduler.test.ts`
- Modify: `mobile/src/tasks/scheduler.ts`
- Modify: `mobile/src/tasks/scheduler.test.ts`

- [ ] **Step 1: Write failing wake and scheduler tests**

  Cover atomic generation increments, maintenance coalescing, acknowledge-through generation without consuming a newer wake, two runtimes competing for the scheduler lease, a wake arriving during a slice, exact persisted wake time, one-second minimum continuation, bounded exponential backoff with deterministic jitter, and clean stop/dispose.

- [ ] **Step 2: Run focused tests and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/tasks/executorWakeRepository.test.ts src/tasks/executorRunner.test.ts src/tasks/foregroundExecutorScheduler.test.ts src/tasks/scheduler.test.ts
  ```

  Expected: new modules cannot be resolved.

- [ ] **Step 3: Implement the generation protocol**

  `requestWake()` increments `generation` and sets `maintenance_generation` to the new generation only for `force-next-slice`. A runner captures generation `N`, performs work, and advances `handled_generation` only through `N`. Therefore a command committed during that slice leaves `generation > handled_generation` and forces a trailing slice.

  Use these ports:

  ```ts
  export type ExecutorTrigger = 'command' | 'foreground' | 'connectivity' | 'timer' | 'background' | 'service';
  export type WorkerRequest = Readonly<{ trigger: ExecutorTrigger; taskIds?: readonly string[] }>;
  export type WorkerResult = Readonly<{
    capturedGeneration: number;
    handledGeneration: number;
    remainingDue: number;
    remainingScheduled: number;
    nextWakeAt?: number;
    budgetExhausted: boolean;
  }>;
  ```

- [ ] **Step 4: Implement scheduler ownership**

  `ExecutorRunner.runSlice()` acquires the existing cross-runtime scheduler lease, runs the bounded cycle, claims a maintenance window only when its captured generation includes an unhandled maintenance request, performs bounded repair/reconciliation/GC, and acknowledges only the captured generation. `startForegroundExecutorScheduler()` subscribes to in-memory wake events, owns timers, publishes `idle/scheduled/running/backoff` events, and invokes the runner. UI modules can subscribe to events but cannot import the runner.

- [ ] **Step 5: Verify and commit**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/tasks/executorWakeRepository.test.ts src/tasks/executorRunner.test.ts src/tasks/foregroundExecutorScheduler.test.ts src/tasks/scheduler.test.ts
  npm run typecheck
  git add src/tasks/executorWakeRepository.ts src/tasks/executorWakeRepository.test.ts src/tasks/executorEvents.ts src/tasks/executorRunner.ts src/tasks/executorRunner.test.ts src/tasks/foregroundExecutorScheduler.ts src/tasks/foregroundExecutorScheduler.test.ts src/tasks/scheduler.ts src/tasks/scheduler.test.ts
  git commit -m "feat: add durable executor wake scheduling"
  ```

  Expected: scheduler tests prove a mid-slice wake is not lost.

## Task 7: Separate durable commands from executor completion

**Files:**

- Create: `mobile/src/tasks/taskCommandService.ts`
- Create: `mobile/src/tasks/taskCommandService.test.ts`
- Modify: `mobile/src/workflows/executor/mediaCommandService.ts`
- Modify: `mobile/src/workflows/executor/mediaCommandService.test.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/tasks/sync.test.ts`

- [ ] **Step 1: Write failing command boundary tests**

  Use a never-resolving runner and prove download/export/redownload/manual-refresh promises still settle after the SQLite transaction. Verify immediate task projection state, stable idempotency keys, duplicate receipts, wake generation increments, and same-runtime invalidation after commit. Assert `taskCommandService.ts` has no executor import.

- [ ] **Step 2: Run focused tests and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/tasks/taskCommandService.test.ts src/workflows/executor/mediaCommandService.test.ts src/tasks/sync.test.ts
  ```

  Expected: `TaskCommandService` is missing and the existing facade waits for `runCycle`.

- [ ] **Step 3: Implement command receipts and atomic wake persistence**

  Define:

  ```ts
  export type CommandReceipt = Readonly<{
    status: 'accepted' | 'coalesced' | 'already-complete';
    wakeGeneration: number;
    acceptedAt: number;
  }>;
  ```

  Each command uses `withExclusiveTransactionAsync` to update/enqueue the operation, update the immediate task projection, and increment wake generation atomically. Emit projection invalidation and the in-memory executor signal only after commit. `requestRefresh({ maintenance: 'force-next-slice' })` writes only the coalesced maintenance generation; it does not mutate task rows.

- [ ] **Step 4: Remove executor waiting from the public command facade**

  Replace `createMediaCommandFacade(commands, runCycle)` with `createTaskCommandService`. Keep temporary command, `syncTaskRun`, and `syncTasks` re-exports in `sync.ts` so callers and route tests can migrate in Tasks 9-10, but make command re-exports acknowledge persistence without running a cycle. Mark compound sync exports as migration-only and do not add new callers.

- [ ] **Step 5: Verify and commit**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/tasks/taskCommandService.test.ts src/workflows/executor/mediaCommandService.test.ts src/tasks/sync.test.ts
  npm run typecheck
  git add src/tasks/taskCommandService.ts src/tasks/taskCommandService.test.ts src/workflows/executor/mediaCommandService.ts src/workflows/executor/mediaCommandService.test.ts src/tasks/sync.ts src/tasks/sync.test.ts
  git commit -m "refactor: acknowledge task commands before executor work"
  ```

  Expected: command tests pass while the fake runner remains unresolved.

## Task 8: Implement `TaskListSession`

**Files:**

- Create: `mobile/src/tasks/taskProjectionEvents.ts`
- Create: `mobile/src/tasks/taskListSession.ts`
- Create: `mobile/src/tasks/taskListSession.test.ts`
- Create: `mobile/src/tasks/useTaskListSession.ts`

- [ ] **Step 1: Write the session state-machine tests**

  With fake timers, cover cold hydration, single-flight plus dirty trailing read, ten refresh requests coalescing into at most two reads, revision change during read, stale-result rejection, cross-runtime revision discovery without a memory event, automatic error retaining items with `phase: 'stale'`, manual error propagation, unchanged-card object reuse, changed-card replacement, load-more merge/reorder/delete, a 120-row refresh cap, second-page activity, timer policy, visibility changes, and disposal.

- [ ] **Step 2: Run the focused test and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/tasks/taskListSession.test.ts
  ```

  Expected: Jest cannot resolve `taskListSession`.

- [ ] **Step 3: Implement stable snapshots and trailing reads**

  Implement the approved `TaskListSnapshot`/`TaskListSession` interfaces from `docs/superpowers/specs/2026-09-05-task-refresh-architecture-design.md`. The core refresh loop must have these semantics:

  ```ts
  const requestRead = (cause: ReadCause): Promise<RefreshReceipt> => {
    dirty = true;
    causes.add(cause);
    if (!readPromise) readPromise = drainReads().finally(() => { readPromise = undefined; });
    return readPromise;
  };

  const drainReads = async (): Promise<RefreshReceipt> => {
    let receipt = { revision: snapshot.revision, checkedAt: clock() };
    while (dirty && !disposed) {
      dirty = false;
      const requestedCauses = new Set(causes);
      causes.clear();
      receipt = await performRead(requestedCauses);
    }
    return receipt;
  };
  ```

  Publish immutable snapshots only when observable state changes. Reuse card objects after comparing every `TaskCard` field. Use a monotonically increasing request sequence to discard older completions.

- [ ] **Step 4: Implement bounded checking policy**

  A visible session checks revision no faster than once per second when due/running work exists; uses `nextWakeAt` capped at ten seconds for active tasks; sleeps until exact wake for inactive scheduled work; and owns no timer when there is no active task or outstanding operation. A revision-only check performs no full card reconstruction. Same-runtime projection events request an immediate check.

- [ ] **Step 5: Add the React hook and verify**

  `useTaskListSession()` must use `useSyncExternalStore`, set visibility from focus state, and dispose only sessions it created.

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/tasks/taskListSession.test.ts
  npm run typecheck
  git add src/tasks/taskProjectionEvents.ts src/tasks/taskListSession.ts src/tasks/taskListSession.test.ts src/tasks/useTaskListSession.ts
  git commit -m "feat: add consistent task list projection sessions"
  ```

  Expected: all session state-machine cases pass with deterministic timers.

## Task 9: Migrate the task screen to the projection session

**Files:**

- Create: `mobile/src/tasks/TaskCardRow.tsx`
- Create: `mobile/src/tasks/TaskCardRow.test.tsx`
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Rewrite: `mobile/src/route-tests/tasks.test.tsx`
- Delete: `mobile/src/tasks/pollSchedule.ts`
- Delete: `mobile/src/tasks/pollSchedule.test.ts`

- [ ] **Step 1: Rewrite route tests around observable behavior**

  Cover immediate first projection, pull-to-refresh ending after the projection read rather than worker completion, overlapping focus/manual/invalidation producing a trailing read, retry and export returning after durable acknowledgement, scrolling/navigation while `work.phase === 'running'`, non-modal stale status, manual read alert, pagination, monitor controls using full-database activity, and no 250 ms executor loop.

- [ ] **Step 2: Run route tests and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/route-tests/tasks.test.tsx src/tasks/TaskCardRow.test.tsx
  ```

  Expected: tests fail because the route still imports and awaits `syncTaskRun`.

- [ ] **Step 3: Replace route-local orchestration**

  Remove `loadInFlight`, `pollState`, `pollGeneration`, `load()`, `syncTaskRun`, `taskStore.listPage`, and inline `renderItem`. Subscribe to one `TaskListSession`; manual refresh concurrently calls `session.refresh('manual')` and `taskCommandService.requestRefresh({ maintenance: 'force-next-slice' })`, with the spinner tied only to `snapshot.read.pending`.

  Render `snapshot.work.phase` as independent background activity. Keep valid items during stale reads. Derive monitor task IDs from a repository query by active status, not the loaded cards.

- [ ] **Step 4: Memoize the row boundary**

  `TaskCardRow` accepts one structurally shared `TaskCard`, navigation/action callbacks, and no parent snapshot. Export `React.memo(TaskCardRow)`; keep timing calculation memoized and do not parse serialized task input.

- [ ] **Step 5: Remove the UI executor polling utility and verify**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/route-tests/tasks.test.tsx src/tasks/TaskCardRow.test.tsx src/tasks/taskListSession.test.ts
  npm run typecheck
  git add 'app/(tabs)/tasks.tsx' src/route-tests/tasks.test.tsx src/tasks/TaskCardRow.tsx src/tasks/TaskCardRow.test.tsx src/tasks/pollSchedule.ts src/tasks/pollSchedule.test.ts
  git commit -m "refactor: render tasks from the projection session"
  ```

  Expected: route tests pass and `rg -n "syncTaskRun|loadInFlight|250" 'app/(tabs)/tasks.tsx'` returns no matches.

## Task 10: Migrate every non-list caller and remove the compound sync API

**Files:**

- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/src/route-tests/root-layout.test.tsx`
- Modify: `mobile/app/video/[id].tsx`
- Modify: `mobile/src/route-tests/video-detail.test.tsx`
- Modify: `mobile/src/create/CreateForm.tsx`
- Modify: `mobile/src/create/createForm.test.ts`
- Modify: `mobile/src/tasks/networkRecovery.ts`
- Modify: `mobile/src/tasks/networkRecovery.test.ts`
- Modify: `mobile/src/tasks/background.ts`
- Modify: `mobile/src/native/taskMonitor.ts`
- Modify: `mobile/src/native/taskMonitor.test.ts`
- Modify: `mobile/index.js`
- Modify: `mobile/src/tasks/sync.ts`
- Delete: `mobile/src/tasks/sync.test.ts`

- [ ] **Step 1: Update tests to enforce role-specific ports**

  Root layout starts/stops the foreground scheduler and signals `foreground`. Video detail reads task/media projections first, then issues commands without an executor wait. Create submission signals a command wake. Connectivity recovery expedites eligible operations and signals `connectivity`. BackgroundTask and Headless JS call `ExecutorRunner.runSlice` directly and use its remaining counts to decide rescheduling/monitor shutdown.

- [ ] **Step 2: Run the focused tests and confirm red**

  ```powershell
  Set-Location mobile
  npm test -- --runInBand src/route-tests/root-layout.test.tsx src/route-tests/video-detail.test.tsx src/create/createForm.test.ts src/tasks/networkRecovery.test.ts src/native/taskMonitor.test.ts
  ```

  Expected: tests fail while callers still mock or await `syncTaskRun`.

- [ ] **Step 3: Migrate callers by responsibility**

  Use this exact mapping:

  | Caller | New capability |
  |---|---|
  | `app/_layout.tsx` | foreground scheduler lifecycle plus wake signal |
  | `app/video/[id].tsx` | task/media repositories plus `TaskCommandService` |
  | `CreateForm.tsx` | durable submit command plus wake signal |
  | `networkRecovery.ts` | async expedite transaction plus wake signal |
  | `background.ts` | dynamic import of `ExecutorRunner.runSlice` |
  | `taskMonitor.ts` / `index.js` | service-scoped `ExecutorRunner.runSlice` |

- [ ] **Step 4: Delete the compound boundary and dead JS transfer code**

  Remove `createSyncTaskRunner`, `syncTaskRun`, `syncTasks`, `createMediaCommandFacade`, and their obsolete tests. Remove `openArtifactDownload` from the production artifact path. If `cas.ts` has no remaining production stream-staging caller, move the stream implementation into a test helper and remove `File.write`, `readChunks`, `wordArray`, and CryptoJS full-file hashing from `cas.ts`. Keep CryptoJS only where small identifiers still need SHA-256.

- [ ] **Step 5: Prove forbidden imports and calls are gone**

  ```powershell
  Set-Location mobile
  rg -n "syncTaskRun|syncTasks|createSyncTaskRunner|createMediaCommandFacade" app src index.js
  rg -n "new File\([^\r\n]*\)\.write|readChunks\(|wordArray\(" src/media src/workflows/executor
  npm test -- --runInBand src/route-tests/root-layout.test.tsx src/route-tests/video-detail.test.tsx src/create/createForm.test.ts src/tasks/networkRecovery.test.ts src/native/taskMonitor.test.ts
  npm run typecheck
  ```

  Expected: both `rg` commands return exit code 1 with no matches; tests and typecheck pass.

- [ ] **Step 6: Commit the caller migration**

  ```powershell
  Set-Location mobile
  git add app/_layout.tsx 'app/video/[id].tsx' src/route-tests/root-layout.test.tsx src/route-tests/video-detail.test.tsx src/create/CreateForm.tsx src/create/createForm.test.ts src/tasks/networkRecovery.ts src/tasks/networkRecovery.test.ts src/tasks/background.ts src/native/taskMonitor.ts src/native/taskMonitor.test.ts index.js src/tasks/sync.ts src/tasks/sync.test.ts src/media/cas.ts
  git commit -m "refactor: separate projection readers from executor runners"
  ```

## Task 11: Full verification and Android performance acceptance

**Files:**

- Create: `mobile/scripts/seed-task-refresh-benchmark.mjs`
- Create: `docs/verification/2026-09-05-task-refresh-architecture-decoupling.md`

- [ ] **Step 1: Add a deterministic benchmark data generator**

  Generate an upgradeable SQLite fixture containing exactly 1,000 task rows: 50 active, 950 terminal, 20 pending operations with mixed due times, and realistic large task input/media JSON. Generate or select a deterministic 128 MiB video fixture for a local HTTPS test endpoint. The script must print the database path, row counts, and SHA-256.

- [ ] **Step 2: Run the complete JavaScript verification matrix**

  ```powershell
  Set-Location mobile
  npm run typecheck
  npm run verify:workflow-releases
  npm test -- --runInBand
  ```

  Expected: all commands exit 0 with no failed suites.

- [ ] **Step 3: Run the complete Android verification matrix**

  ```powershell
  Set-Location mobile/android
  .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon --console=plain
  adb devices
  .\gradlew.bat :app:connectedDebugAndroidTest --no-daemon --console=plain
  ```

  Expected: JVM tests, APK assembly, and connected instrumentation tests pass; `adb devices` shows one authorized emulator/device.

- [ ] **Step 4: Record device performance evidence**

  Use a release-equivalent build and the 1,000-task/128-MiB fixture. Record device model, Android version, build variant, five cold 40-row reads, twenty warm revision checks, and the full native transfer. Capture:

  - p95 first-page projection read below 150 ms;
  - maximum JS event-loop stall below 250 ms during download, both native hashes, probe, and CAS publication;
  - no ANR or multi-second lost input;
  - pull-to-refresh ends after projection read, not media completion;
  - unchanged revision creates zero new `TaskCard` objects;
  - no timer when no task or operation is active;
  - before/after measurements on the same device if an absolute threshold is missed.

  Put the commands, raw samples, computed p95/max, logcat ANR search, and pass/fail conclusion in `docs/verification/2026-09-05-task-refresh-architecture-decoupling.md`. Do not substitute subjective smoothness for numbers.

- [ ] **Step 5: Run final static boundary checks**

  ```powershell
  Set-Location mobile
  rg -n "syncTaskRun|syncTasks|createSyncTaskRunner|createMediaCommandFacade" app src index.js
  rg -n "new File\([^\r\n]*\)\.write|CryptoJS\.algo\.SHA256" src/media/cas.ts src/workflows/executor/artifactOperation.ts
  rg -n "ExecutorRunner|executorRunner|durableExecutor|\.runSlice\(" 'app/(tabs)/tasks.tsx' 'app/video/[id].tsx' src/create/CreateForm.tsx
  ```

  Expected: all three commands return exit code 1 with no matches.

- [ ] **Step 6: Commit verification artifacts**

  ```powershell
  Set-Location ..
  git add mobile/scripts/seed-task-refresh-benchmark.mjs docs/verification/2026-09-05-task-refresh-architecture-decoupling.md
  git commit -m "test: verify responsive task refresh architecture"
  ```

  Expected: the verification document contains actual values for every acceptance item and links each failure, if any, to a follow-up issue before integration.

---

## Final review gate

- [ ] Compare the resulting diff with `docs/superpowers/specs/2026-09-05-task-refresh-architecture-design.md` and the original review findings.
- [ ] Confirm every UI read is projection-only and every command promise ends at durable acknowledgement.
- [ ] Confirm native transfer revalidates every redirect and performs both hashes outside the JS thread.
- [ ] Confirm persistent revision and wake generations provide correctness across foreground, BackgroundTask, and Headless JS runtimes.
- [ ] Confirm the full automated matrix and recorded Android measurements are fresh and passing.
- [ ] Use `superpowers:requesting-code-review`, address accepted findings, then use `superpowers:verification-before-completion` before claiming completion.

## Execution handoff

Two supported execution modes:

1. **Subagent-driven development (recommended):** stay in this task, implement one task at a time with a fresh worker and a review checkpoint after each commit.
2. **Inline plan execution:** continue in a dedicated execution session using `superpowers:executing-plans`, stopping at the native boundary, projection/session boundary, caller migration, and final device-verification checkpoints.
