# Task Sync, Background Monitoring, and Large-List Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all generated tasks recoverable and monitorable in foreground, Android background, and optional Android foreground-service mode, while keeping large task and gallery lists responsive.

**Architecture:** Persist jobs and artifacts as the source of truth and keep `TaskRecord` as a complete compatibility projection. A single `TaskSyncCoordinator` will be called by the screen, Expo background task, and Android foreground service. Provider operation/workflow identity, credentials, typed errors, and transport remain inside the validated adapter boundary. Repository pages, watermark queries, keyed UI patches, and bounded poster work keep the UI windowed.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, Jest, expo-sqlite, Android Kotlin foreground service, WorkManager via `expo-background-task`, `FlatList`, existing AutoDL provider adapter.

---

## File map and boundaries

- `mobile/src/tasks/repository.ts`: complete task projection persistence, paged and watermark queries.
- `mobile/src/jobs/repository.ts`: job/artifact source of truth and migration lookup.
- `mobile/src/jobs/types.ts`, `mobile/src/tasks/types.ts`: normalized statuses and sync metadata.
- `mobile/src/workflows/providers/autodl/client.ts`: AutoDL protocol, target workflow ID, typed error parsing.
- `mobile/src/workflows/providers/autodl/adapter.ts`, `mobile/src/workflows/providers/registry.ts`: adapter context and credential contract.
- `mobile/src/workflows/runtime/runtime.ts`: validated operation context and artifact-returning sync.
- `mobile/src/tasks/coordinator.ts`: shared synchronization and media-delivery orchestration.
- `mobile/src/tasks/sync.ts`, `mobile/src/tasks/background.ts`: compatibility exports and entry points only.
- `mobile/app/(tabs)/tasks.tsx`: paged task window, sync status, continuous-monitor controls.
- `mobile/src/media/repository.ts`, `mobile/app/(tabs)/gallery.tsx`: paged media query and bounded poster loading.
- `mobile/android/app/src/main/java/com/example/autodlh3/TaskMonitorModule.kt`: JS bridge for monitor start/stop/status.
- `mobile/android/app/src/main/java/com/example/autodlh3/TaskMonitorService.kt`: Android foreground service and two-minute scheduler.
- `mobile/android/app/src/main/java/com/example/autodlh3/MediaPackage.kt`: register the monitor native module.
- `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/app.json`: service declaration, permissions, and notification configuration.

The Android service must not reimplement AutoDL HTTP. It invokes the JS coordinator through the native bridge or starts a headless JS task using the same persisted database and provider modules.

---

### Task 1: Persist complete task provenance and artifact projections

**Files:**
- Modify: `mobile/src/tasks/repository.ts:5-13`
- Modify: `mobile/src/tasks/types.ts:1-4`
- Modify: `mobile/src/jobs/repository.ts:44-46`
- Test: `mobile/src/tasks/repository.test.ts`
- Test: `mobile/src/jobs/repository.test.ts`

- [ ] **Step 1: Write failing repository round-trip tests**

Add a fake database that records all task columns and assert that a task containing `workflowId`, `workflowVersion`, `workflowContentHash`, `adapterId`, `adapterVersion`, and `inputSnapshot` is identical after `upsert()` then `list()`. Add a partial-update assertion: updating only `status` must retain workflow fields, media fields, and input JSON.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run: `npm test -- --runInBand src/tasks/repository.test.ts src/jobs/repository.test.ts`

Expected: the new round-trip assertion fails because `tasks/repository.ts` currently omits the workflow columns from its SQL and its fake row mapping.

- [ ] **Step 3: Implement explicit non-destructive task upsert**

Replace the 22-column `INSERT OR REPLACE` with an explicit upsert that includes all current columns:

```ts
const columns = [
  'id', 'prompt', 'status', 'resolution', 'duration', 'seed', 'images_json', 'audios_json',
  'video_url', 'local_uri', 'thumbnail_url', 'download_state', 'download_error', 'download_progress',
  'gallery_uri', 'export_state', 'export_error', 'exported_at', 'created_at', 'updated_at',
  'started_at', 'execution_duration', 'workflow_id', 'workflow_version', 'workflow_hash',
  'adapter_id', 'adapter_version', 'input_json', 'sync_error', 'last_sync_at',
].join(',');
```

Use `ON CONFLICT(id) DO UPDATE` so future partial patches do not erase existing values. Add nullable `sync_error` and `last_sync_at` columns through the existing migration list and map them to `TaskRecord`.

- [ ] **Step 4: Preserve existing projection values when artifacts are absent**

Change `jobRecordToTaskProjection()` to accept an optional previous `TaskRecord` and use `video?.uri ?? previous.videoUrl`. Preserve download/export fields and include provider timing in the projection. Add `PARTIAL_SUCCEEDED` and `UNKNOWN` compatibility mappings without converting them to `QUEUED`.

- [ ] **Step 5: Verify the focused tests**

Run: `npm test -- --runInBand src/tasks/repository.test.ts src/jobs/repository.test.ts`

Expected: all focused tests pass, including provenance retention across partial updates and artifact URL retention.

- [ ] **Step 6: Commit the persistence slice**

Run:

```bash
git add mobile/src/tasks/repository.ts mobile/src/tasks/types.ts mobile/src/jobs/repository.ts mobile/src/tasks/repository.test.ts mobile/src/jobs/repository.test.ts
git commit -m "fix: persist task provenance and artifact projections"
```

---

### Task 2: Finish provider-owned operation, credentials, and errors

**Files:**
- Modify: `mobile/src/workflows/providers/autodl/client.ts:7-58`
- Modify: `mobile/src/workflows/providers/autodl/adapter.ts:1-14`
- Modify: `mobile/src/workflows/providers/registry.ts:7-15`
- Modify: `mobile/src/workflows/runtime/runtime.ts:6-34`
- Modify: `mobile/src/tasks/api.ts:1-58`
- Test: `mobile/src/workflows/providers/autodl/client.test.ts`
- Test: `mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts`
- Test: `mobile/src/workflows/runtime/runtime.test.ts`
- Test: `mobile/src/tasks/api.test.ts`

- [ ] **Step 1: Add failing tests for operation-driven target and auth errors**

Assert that `client.submit({ workflowId: 'alternate', ... })` requests `/alternate`; assert that an HTTP 401 body shaped as `{ error: { message: 'Invalid authentication credentials' } }` yields `ProviderError.kind === 'auth'` and preserves that message. Assert runtime calls `adapter.validateCredentials()` before `adapter.submit()` and passes the validated operation context.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --runInBand src/workflows/providers/autodl/client.test.ts src/workflows/adapters/autodlComfyUi/adapter.test.ts src/workflows/runtime/runtime.test.ts src/tasks/api.test.ts`

Expected: tests fail because the client hard-codes H3, has no `auth` category, and runtime currently passes only raw inputs.

- [ ] **Step 3: Implement typed provider request context**

Define:

```ts
type ProviderRequestContext = {
  operation: string;
  workflowId: string;
  inputs: Record<string, unknown>;
};
```

Make the adapter accept this context, keep the AutoDL base URL code-owned, and validate `operation === 'workflow.submit'` plus a non-empty workflow ID. Keep arbitrary URL/header fields out of the type and validator.

- [ ] **Step 4: Normalize authentication and network errors**

Extend `ProviderErrorKind` with `timeout` and `auth`. Parse both `{ code, msg, data }` and `{ error: { message } }`; map 401/403 to `auth`. Add an abort timeout around transport requests and preserve `cause` and HTTP status.

- [ ] **Step 5: Convert legacy `tasks/api.ts` into the provider compatibility facade**

Build the facade with `createAutodlClient({ transport: getNativeHttpTransport(), token })`, use the supplied task's provider ID when available, and return the same `TaskRecord` shape. No code in this file may call the global LLM streaming fetch directly.

- [ ] **Step 6: Verify focused tests and commit**

Run the focused command from Step 2, then:

```bash
git add mobile/src/workflows mobile/src/tasks/api.ts mobile/src/workflows/providers/autodl/client.test.ts mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts mobile/src/workflows/runtime/runtime.test.ts mobile/src/tasks/api.test.ts
git commit -m "feat: make provider operations and errors workflow aware"
```

---

### Task 3: Build the shared, failure-isolated synchronization coordinator

**Files:**
- Create: `mobile/src/tasks/coordinator.ts`
- Modify: `mobile/src/tasks/sync.ts:1-45`
- Modify: `mobile/src/tasks/background.ts:1-16`
- Modify: `mobile/src/jobs/types.ts:1-3`
- Test: `mobile/src/tasks/coordinator.test.ts`
- Modify: `mobile/src/tasks/syncWorkflow.test.ts`

- [ ] **Step 1: Write failing coordinator tests**

Cover these behaviors with fake repositories and adapters:

```ts
test('uses remote provider id and projects persisted artifacts', async () => { /* job id local-1, remote id remote-1, video artifact -> videoUrl */ });
test('one provider failure does not abort other jobs', async () => { /* first rejects, second becomes RUNNING */ });
test('concurrent calls share one in-flight pass', async () => { /* adapter.getStatus called once */ });
test('missing token returns stale tasks with an explicit offline summary', async () => { /* no provider call */ });
```

- [ ] **Step 2: Run the new tests and verify failure**

Run: `npm test -- --runInBand src/tasks/coordinator.test.ts src/tasks/syncWorkflow.test.ts`

Expected: the coordinator module is missing and the existing sync path still aborts on the first rejected request.

- [ ] **Step 3: Implement coordinator contracts and mutex**

Define:

```ts
export type SyncSummary = {
  updated: number;
  failed: number;
  skipped: number;
  remaining: number;
  lastSyncAt?: number;
};
export type TaskSyncCoordinator = {
  run(options?: { reason?: 'foreground' | 'background' | 'service' }): Promise<{ tasks: TaskRecord[]; summary: SyncSummary }>;
};
```

Use a module-level in-flight promise. Select active jobs/tasks, resolve a matching `workflow_jobs` row before falling back to legacy conversion, poll with a concurrency limit of four, and wrap each item in its own `try/catch`.

- [ ] **Step 4: Persist job/artifact/task updates in order**

For each successful poll: `runtime.sync(job)`, `jobStore.listArtifacts(job.id)`, `jobRecordToTaskProjection(updated, artifacts, previousTask)`, then `taskStore.upsert()`. For failures, write `syncError` and `lastSyncAt` without changing the provider status to `FAILED`. Invoke `ensureTaskMedia` only after a successful video projection and isolate media errors separately.

- [ ] **Step 5: Make all entry points delegate to the coordinator**

Keep `syncTasks()` as a compatibility function returning `coordinator.run().tasks`. Make `background.ts` call the same coordinator and return `Success` when stale data was preserved but no fatal local-storage error occurred. Remove duplicated provider construction from the screen.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- --runInBand src/tasks/coordinator.test.ts src/tasks/sync.test.ts src/tasks/syncWorkflow.test.ts
git add mobile/src/tasks/coordinator.ts mobile/src/tasks/sync.ts mobile/src/tasks/background.ts mobile/src/jobs/types.ts mobile/src/tasks/coordinator.test.ts mobile/src/tasks/syncWorkflow.test.ts
git commit -m "feat: coordinate resilient task synchronization"
```

---

### Task 4: Add paged task queries and efficient task-list rendering

**Files:**
- Modify: `mobile/src/tasks/repository.ts:10-13`
- Modify: `mobile/src/tasks/types.ts:1-4`
- Modify: `mobile/app/(tabs)/tasks.tsx:13-24`
- Test: `mobile/src/tasks/repository.test.ts`
- Modify: `mobile/src/route-tests/tasks.test.tsx`

- [ ] **Step 1: Write failing pagination and watermark tests**

Assert `listPage({ limit: 20, cursor })` uses stable `(created_at, id)` ordering, returns `nextCursor`, and filters by status/query. Assert `listUpdatedSince(watermark)` returns only changed rows. Assert task screen renders a finite page and requests the next page on `onEndReached`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --runInBand src/tasks/repository.test.ts src/route-tests/tasks.test.tsx`

Expected: the repository has only unbounded `list()` and the screen has no pagination contract.

- [ ] **Step 3: Implement indexed page and watermark queries**

Add indexes on `(status, updated_at, id)` and `(created_at, id)`. Implement `listPage` with keyset pagination rather than `OFFSET`, and return only the fields required for task cards. Keep `list()` as a compatibility wrapper using a bounded limit for existing callers.

- [ ] **Step 4: Update the task screen without replacing unchanged rows**

Keep a keyed `Map` or reducer for rows, merge coordinator updates by ID, and append page results. Move the one-second clock into a small timing component or memoized row so the `FlatList` data reference remains stable. Set `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `updateCellsBatchingPeriod`, and `removeClippedSubviews` explicitly after testing.

- [ ] **Step 5: Add visible sync/offline state and monitor controls**

Show last successful sync, partial failure count, stale/offline state, and per-task error text without hiding the locally cached rows. Add a monitor toggle that calls the native monitor bridge only for active tasks and reflects service state.

- [ ] **Step 6: Verify and commit**

Run the focused tests, then:

```bash
git add mobile/src/tasks/repository.ts mobile/src/tasks/types.ts mobile/app/(tabs)/tasks.tsx mobile/src/tasks/repository.test.ts mobile/src/route-tests/tasks.test.tsx
git commit -m "perf: page and incrementally update task list"
```

---

### Task 5: Make gallery queries and poster generation bounded

**Files:**
- Modify: `mobile/src/media/repository.ts:5-47`
- Modify: `mobile/src/gallery/presentation.ts:1-40`
- Modify: `mobile/app/(tabs)/gallery.tsx:13-25`
- Test: `mobile/src/media/repository.test.ts`
- Modify: `mobile/src/route-tests/gallery.test.tsx`

- [ ] **Step 1: Write failing media-page and concurrency tests**

Assert `listPage` returns only card fields and a stable cursor. In the gallery route test, seed more assets than the first page and assert `extractPoster` never has more than four concurrent calls and is invoked only for visible/unposterized rows.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --runInBand src/media/repository.test.ts src/route-tests/gallery.test.tsx`

Expected: current gallery loads all tasks and starts an unbounded `Promise.all` poster extraction.

- [ ] **Step 3: Implement media-page query and indexes**

Add `(status, created_at, id)` and `(updated_at, id)` indexes. Implement keyset-paged `listMediaPage` selecting only card columns. Keep `projectGallery` for compatibility but make the route use the media store/page API when available.

- [ ] **Step 4: Implement bounded lazy poster loading**

Render the first page immediately, load additional pages on end reached, and run poster extraction through a four-slot queue. Cache poster paths in the task/media repository and update only the affected card by ID. Never use `Promise.all(mapped.map(...))` over the complete dataset.

- [ ] **Step 5: Verify and commit**

Run the focused tests, then:

```bash
git add mobile/src/media/repository.ts mobile/src/gallery/presentation.ts mobile/app/(tabs)/gallery.tsx mobile/src/media/repository.test.ts mobile/src/route-tests/gallery.test.tsx
git commit -m "perf: page gallery data and bound poster work"
```

---

### Task 6: Implement optional Android foreground monitoring

**Files:**
- Create: `mobile/android/app/src/main/java/com/example/autodlh3/TaskMonitorModule.kt`
- Create: `mobile/android/app/src/main/java/com/example/autodlh3/TaskMonitorService.kt`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/MediaPackage.kt:1-16`
- Modify: `mobile/android/app/src/main/AndroidManifest.xml:1-40`
- Modify: `mobile/app.json:1-18`
- Create: `mobile/src/native/taskMonitor.ts`
- Test: `mobile/src/native/taskMonitor.test.ts`
- Modify: `mobile/src/route-tests/tasks.test.tsx`

- [ ] **Step 1: Write failing JS bridge and lifecycle tests**

Mock `NativeModules.AutoDLTaskMonitor` and assert `start({ taskIds })`, `stop()`, and `getStatus()` calls. Assert the task screen disables the toggle when there are no active tasks and reflects a stopped service after all selected tasks become terminal.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --runInBand src/native/taskMonitor.test.ts src/route-tests/tasks.test.tsx`

Expected: the bridge and native module do not exist.

- [ ] **Step 3: Implement the Kotlin service and bridge**

`TaskMonitorService` must:

1. Create a notification channel and call `startForeground()` immediately.
2. Persist the selected task IDs in `SharedPreferences`.
3. Schedule a coroutine/alarm loop with a two-minute delay between coordinator triggers.
4. Stop when the bridge requests stop or the coordinator reports zero selected active jobs.
5. Update the notification with active/completed/failed counts.

`TaskMonitorModule` exposes `start`, `stop`, and `status` and uses explicit intents. It must not duplicate AutoDL URLs, token handling, or polling logic.

- [ ] **Step 4: Register permissions and service declaration**

Declare `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, and `POST_NOTIFICATIONS` as required by the target SDK, add the non-exported service declaration, and keep the existing media playback permission only for the media feature. Update `MediaPackage` to register both modules. Document that Expo Go is unsupported and this requires a development/release native build.

- [ ] **Step 5: Verify native compilation and bridge tests**

Run:

```bash
npm test -- --runInBand src/native/taskMonitor.test.ts src/route-tests/tasks.test.tsx
cd android
./gradlew.bat :app:assembleDebug
```

Expected: bridge tests pass and Gradle exits with code 0.

- [ ] **Step 6: Commit the Android monitoring slice**

```bash
git add mobile/android mobile/app.json mobile/src/native/taskMonitor.ts mobile/src/native/taskMonitor.test.ts mobile/src/route-tests/tasks.test.tsx
git commit -m "feat: add optional Android foreground task monitoring"
```

---

### Task 7: Full verification, migration checks, and performance evidence

**Files:**
- Modify: `README.md` only for user-facing monitoring interval/permission wording.
- Modify: `docs/superpowers/reviews/PROVIDER_INTEGRATION_REVIEW.md` with resolved status and links to tests.

- [ ] **Step 1: Run all JavaScript verification**

Run from `mobile`:

```bash
npm test -- --runInBand
npm run typecheck
```

Expected: zero failed suites/tests and TypeScript exit code 0.

- [ ] **Step 2: Build Android and inspect manifest**

```bash
cd android
./gradlew.bat :app:assembleDebug
adb shell dumpsys package com.example.autodlh3 | Select-String 'TaskMonitorService|FOREGROUND_SERVICE|POST_NOTIFICATIONS'
```

Expected: debug APK builds and the service/permissions are present.

- [ ] **Step 3: Validate foreground-service lifecycle on a device/emulator**

Seed active tasks, enable continuous monitoring, capture `logcat`, wait for one scheduled interval using a test-configured short delay, then restore the production two-minute constant. Confirm notification creation, persisted state reload after process recreation, and automatic stop when all jobs are terminal.

- [ ] **Step 4: Capture large-list performance evidence**

Seed at least 1,000 tasks and 1,000 gallery assets. Capture `dumpsys gfxinfo` for task-list refresh and gallery scroll, and a focused Perfetto trace when available. Record frame counts, janky frames, and the exact seeded dataset/build variant; do not claim improvement without comparing before/after numbers.

- [ ] **Step 5: Update documentation and review checklist**

Document that WorkManager fallback is inexact and no less than 15 minutes, while foreground monitoring is approximately two minutes and subject to Android power restrictions. Mark every review finding as resolved with test references. Run `git diff --check` and confirm `local.properties` remains untracked and untouched.

- [ ] **Step 6: Commit verification documentation**

```bash
git add README.md docs/superpowers/reviews/PROVIDER_INTEGRATION_REVIEW.md
git commit -m "docs: record task monitoring and performance verification"
```

---

## Plan self-review

- Spec coverage: all review findings are addressed in Tasks 1–3; background semantics in Task 6; task/gallery performance in Tasks 4–5; device verification in Task 7.
- No production change is planned before a failing test for that behavior.
- Provider endpoint safety remains code-owned; workflow definitions supply only validated operation/workflow identity.
- The plan does not claim exact two-minute Android scheduling and keeps the 15-minute WorkManager limitation explicit.
- Existing legacy tasks remain readable through the compatibility facade and migration lookup.
