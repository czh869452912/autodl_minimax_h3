# App 全链路性能解耦 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除长时间运行后由流式保存风暴、同步/媒体串行、无差异写库、重复调度和全表扫描造成的 UI 卡顿与设备发热。

**Architecture:** 以一个共享 SQLite 实例和异步 Repository 为数据边界，将状态同步与媒体交付拆成两个受租约保护的队列；Prompt 运行时使用最新快照合并持久化，页面采用增量/虚拟化读取。前台、Expo 后台和 Android Headless 统一进入调度中心，并通过重试退避和幂等状态避免重复工作。

**Tech Stack:** React Native, Expo Router, Expo SQLite, TypeScript, Jest, Kotlin Android Foreground/Headless Service.

---

## 文件与职责映射

- Create: `mobile/src/storage/databaseClient.ts` — 共享数据库实例、一次性初始化和迁移入口。
- Create: `mobile/src/tasks/mediaQueue.ts` — 有界、任务级互斥的媒体下载/导出队列。
- Create: `mobile/src/tasks/scheduler.ts` — 状态同步/媒体队列租约和入口去重。
- Modify: `mobile/src/tasks/repository.ts`, `mobile/src/jobs/repository.ts`, `mobile/src/media/repository.ts` — 异步 SQLite、差异写入、按 ID/增量查询。
- Modify: `mobile/src/tasks/coordinator.ts`, `mobile/src/tasks/sync.ts` — 只做状态同步并投递媒体队列。
- Modify: `mobile/src/workflows/runtime/runtime.ts` — Job/artifact 指纹比较和重试元数据。
- Modify: `mobile/src/agent/runtimeStore.ts`, `mobile/src/agent/PromptAssistantUi.tsx`, `mobile/src/agent/AgentScreen.tsx`, `mobile/src/agent/threadStore.ts` — Prompt 快照合并、长会话增量渲染和历史分页。
- Modify: `mobile/app/(tabs)/tasks.tsx`, `mobile/app/video/[id].tsx` — 活动行计时、按 ID 查询和状态/媒体解耦。
- Modify: `mobile/src/shims/copilotKitStreamingFetch.ts`, `mobile/src/agent/skillBundle.ts` — 流式 flush 合并和技能包缓存。
- Modify: `mobile/src/tasks/background.ts`, `mobile/index.js`, `mobile/android/app/src/main/java/com/example/autodlh3/TaskMonitorService.kt`, `TaskMonitorHeadlessService.kt` — 统一调度、任务 ID 过滤和后台防重入。
- Test: 对应现有 `*.test.ts(x)`，新增 `databaseClient.test.ts`, `mediaQueue.test.ts`, `scheduler.test.ts`。

### Task 1: 建立共享数据库客户端与按 ID 查询

**Files:**
- Create: `mobile/src/storage/databaseClient.ts`
- Modify: `mobile/src/storage/database.ts`, `mobile/src/tasks/repository.ts`, `mobile/src/jobs/repository.ts`, `mobile/src/media/repository.ts`
- Modify: `mobile/app/video/[id].tsx`, `mobile/src/agent/AgentScreen.tsx`, `mobile/src/create/CreateForm.tsx`, `mobile/app/(tabs)/gallery.tsx`, `mobile/src/tasks/sync.ts`
- Test: `mobile/src/storage/databaseClient.test.ts`, `mobile/src/tasks/repository.test.ts`, `mobile/src/jobs/repository.test.ts`, `mobile/src/media/repository.test.ts`, `mobile/src/route-tests/video-detail.test.tsx`

- [ ] **Step 1: Write the failing tests**

  - Assert `getDatabase()` returns the same handle for repeated calls.
  - Assert `taskStore.get(id)` issues a single-ID query and video detail does not call `list()`.
  - Assert repositories use async methods for reads/writes after initialization.

- [ ] **Step 2: Run the focused tests and confirm RED**

  Run: `npm test -- --runInBand mobile/src/storage/databaseClient.test.ts mobile/src/tasks/repository.test.ts mobile/src/route-tests/video-detail.test.tsx`

  Expected: failures for missing `getDatabase`/`get` and the current full-list call.

- [ ] **Step 3: Implement the minimal database client and repository APIs**

  Add a module-level cached `openDatabaseAsync/openDatabaseSync` handle as supported by the installed Expo SQLite version, expose `getDatabase()`, and ensure schema/index setup runs once. Add `get(id)` and `listUpdatedSince()` while retaining bounded `listPage()`.

- [ ] **Step 4: Migrate consumers and remove the video full scan**

  Replace module-level `openDatabaseSync(...)` calls with `getDatabase()` and replace `store.list().find(...)` with `store.get(taskId)`.

- [ ] **Step 5: Run focused tests and commit**

  Run: `npm test -- --runInBand mobile/src/storage/databaseClient.test.ts mobile/src/tasks/repository.test.ts mobile/src/jobs/repository.test.ts mobile/src/media/repository.test.ts mobile/src/route-tests/video-detail.test.tsx`

  Expected: all focused tests pass.

  Commit: `git add mobile/src/storage mobile/src/tasks/repository.ts mobile/src/jobs/repository.ts mobile/src/media/repository.ts mobile/app/video mobile/src/agent/AgentScreen.tsx mobile/src/create/CreateForm.tsx mobile/app/(tabs)/gallery.tsx mobile/src/tasks/sync.ts mobile/src/*test* && git commit -m "perf: centralize database access and bounded reads"`

### Task 2: Make Job/artifact synchronization diff-based and add backoff

**Files:**
- Modify: `mobile/src/jobs/types.ts`, `mobile/src/tasks/types.ts`, `mobile/src/tasks/repository.ts`, `mobile/src/jobs/repository.ts`
- Modify: `mobile/src/workflows/runtime/runtime.ts`, `mobile/src/tasks/coordinator.ts`
- Test: `mobile/src/workflows/runtime/runtime.test.ts`, `mobile/src/tasks/coordinator.test.ts`, repository tests

- [ ] **Step 1: Write failing tests**

  Assert unchanged Provider status does not call `replaceArtifacts` or rewrite the Job; changed artifacts perform only required inserts/deletes. Assert a failed task has a future `nextRetryAt` and is excluded until that time.

- [ ] **Step 2: Run tests and confirm RED**

  Run: `npm test -- --runInBand mobile/src/workflows/runtime/runtime.test.ts mobile/src/tasks/coordinator.test.ts`

  Expected: current implementation rewrites artifacts and retries failed tasks immediately.

- [ ] **Step 3: Implement stable fingerprints and metadata**

  Add deterministic status/artifact fingerprints, `syncFailureCount`, `nextRetryAt`, and `lastSyncError` fields with a schema migration. Compare before writing; update only changed artifact rows.

- [ ] **Step 4: Apply exponential backoff in target selection**

  Filter `listActive/listSyncCandidates` by `next_retry_at <= now`, calculate bounded delays after errors, and clear retry metadata after a successful sync.

- [ ] **Step 5: Run tests and commit**

  Run: `npm test -- --runInBand mobile/src/workflows/runtime/runtime.test.ts mobile/src/tasks/coordinator.test.ts mobile/src/tasks/repository.test.ts mobile/src/jobs/repository.test.ts`

  Commit: `git add mobile/src/jobs mobile/src/tasks mobile/src/workflows/runtime && git commit -m "perf: avoid redundant sync writes and back off failures"`

### Task 3: Split status synchronization from media delivery

**Files:**
- Create: `mobile/src/tasks/mediaQueue.ts`
- Modify: `mobile/src/tasks/coordinator.ts`, `mobile/src/tasks/sync.ts`, `mobile/app/(tabs)/tasks.tsx`, `mobile/src/tasks/media.ts`
- Test: `mobile/src/tasks/mediaQueue.test.ts`, `mobile/src/tasks/coordinator.test.ts`, `mobile/src/route-tests/tasks.test.tsx`

- [ ] **Step 1: Write failing tests**

  Assert `syncTaskRun()` resolves after Provider/status writes without waiting for a delayed `ensureMedia`; assert media queue processes at most the configured batch/concurrency and deduplicates the same task.

- [ ] **Step 2: Run tests and confirm RED**

  Run: `npm test -- --runInBand mobile/src/tasks/mediaQueue.test.ts mobile/src/tasks/coordinator.test.ts mobile/src/route-tests/tasks.test.tsx`

- [ ] **Step 3: Implement a bounded media queue**

  Add a queue with task-ID locks, max one media worker by default, a per-run item budget, and persisted task progress updates. Queue failures remain retryable without rejecting status sync.

- [ ] **Step 4: Remove media work from the status Promise**

  Make coordinator return after status sync and enqueue pending media. Let the queue run independently and emit per-task updates. Keep manual download/export actions on the same task lock.

- [ ] **Step 5: Run tests and commit**

  Run: `npm test -- --runInBand mobile/src/tasks/mediaQueue.test.ts mobile/src/tasks/coordinator.test.ts mobile/src/route-tests/tasks.test.tsx mobile/src/tasks/media.test.ts`

  Commit: `git add mobile/src/tasks mobile/app/(tabs)/tasks.tsx mobile/src/route-tests/tasks.test.tsx && git commit -m "perf: decouple task status sync from media delivery"`

### Task 4: Add a cross-entry scheduler lease and Android task filtering

**Files:**
- Create: `mobile/src/tasks/scheduler.ts`, `mobile/src/tasks/scheduler.test.ts`
- Modify: `mobile/src/tasks/sync.ts`, `mobile/src/tasks/background.ts`, `mobile/index.js`, `mobile/src/native/taskMonitor.ts`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/TaskMonitorService.kt`, `TaskMonitorHeadlessService.kt`
- Test: `mobile/src/native/taskMonitor.test.ts`, `mobile/src/tasks/sync.test.ts`

- [ ] **Step 1: Write failing tests**

  Assert concurrent foreground/background/service calls share one lease; assert the service entry passes selected IDs and stops when no selected task remains.

- [ ] **Step 2: Run tests and confirm RED**

  Run: `npm test -- --runInBand mobile/src/tasks/scheduler.test.ts mobile/src/tasks/sync.test.ts mobile/src/native/taskMonitor.test.ts`

- [ ] **Step 3: Implement lease acquisition and release**

  Store owner, acquired time, and expiry in a dedicated SQLite table; reclaim expired leases and release them in `finally`. Use separate keys for status and media work.

- [ ] **Step 4: Thread task IDs through Headless JS**

  Read persisted selected IDs in the native/JS bridge, pass them into `syncTaskRun`, and filter coordinator targets. Schedule the next native tick only after the current Headless task completes.

- [ ] **Step 5: Run tests and commit**

  Run: `npm test -- --runInBand mobile/src/tasks/scheduler.test.ts mobile/src/tasks/sync.test.ts mobile/src/native/taskMonitor.test.ts`; run `npm run typecheck`.

  Commit: `git add mobile/src/tasks mobile/src/native mobile/index.js mobile/android/app/src/main/java && git commit -m "perf: unify background scheduling and prevent overlap"`

### Task 5: Coalesce Prompt runtime persistence and stream flushes

**Files:**
- Modify: `mobile/src/agent/runtimeStore.ts`, `mobile/src/agent/PromptAssistantUi.tsx`, `mobile/src/agent/AgentScreen.tsx`, `mobile/src/agent/threadStore.ts`
- Modify: `mobile/src/shims/copilotKitStreamingFetch.ts`, `mobile/src/agent/skillBundle.ts`
- Test: `mobile/src/agent/runtimeStore.test.ts`, `mobile/src/agent/PromptAssistantUi.test.tsx`, `mobile/src/shims/copilotKitStreamingFetch.test.ts`, `mobile/src/agent/skillBundle.test.ts`

- [ ] **Step 1: Write failing tests**

  Assert 20 rapid message/state events produce one delayed save containing the latest snapshot; assert `flush()` forces an immediate save. Assert rapid XHR progress events schedule one pending flush, and skill files are cached between runs.

- [ ] **Step 2: Run tests and confirm RED**

  Run: `npm test -- --runInBand mobile/src/agent/runtimeStore.test.ts mobile/src/shims/copilotKitStreamingFetch.test.ts mobile/src/agent/skillBundle.test.ts`

- [ ] **Step 3: Implement latest-snapshot persistence**

  Replace the unbounded Promise chain with one pending snapshot, one debounce timer, and explicit `flush()`. Combine message/state callbacks and emit UI events without serializing on every delta.

- [ ] **Step 4: Reduce full transcript work**

  Memoize normalized rows by message version, make timeline signature incremental, and pass stable props to the timeline. Replace history `ScrollView` with a bounded virtual list or paged records.

- [ ] **Step 5: Cache skill files and coalesce network flush**

  Cache the normalized immutable skill map and use a single scheduled flush for `onprogress` until the current chunk is consumed.

- [ ] **Step 6: Run tests and commit**

  Run: `npm test -- --runInBand mobile/src/agent/runtimeStore.test.ts mobile/src/agent/PromptAssistantUi.test.tsx mobile/src/shims/copilotKitStreamingFetch.test.ts mobile/src/agent/skillBundle.test.ts`; run `npm run typecheck`.

  Commit: `git add mobile/src/agent mobile/src/shims && git commit -m "perf: coalesce prompt persistence and streaming updates"`

### Task 6: Limit task and history rendering work

**Files:**
- Create or modify: `mobile/src/tasks/TaskRow.tsx`
- Modify: `mobile/app/(tabs)/tasks.tsx`, `mobile/src/agent/PromptAssistantUi.tsx`, `mobile/src/agent/agentPresentation.ts`
- Test: `mobile/src/route-tests/tasks.test.tsx`, `mobile/src/agent/PromptAssistantUi.test.tsx`, `mobile/src/agent/agentPresentation.test.ts`

- [ ] **Step 1: Write failing tests**

  Assert a clock tick re-renders active rows only, while completed rows retain their render count. Assert history search uses paged/summary data rather than deserializing every message.

- [ ] **Step 2: Run tests and confirm RED**

  Run: `npm test -- --runInBand mobile/src/route-tests/tasks.test.tsx mobile/src/agent/PromptAssistantUi.test.tsx mobile/src/agent/agentPresentation.test.ts`

- [ ] **Step 3: Implement memoized task rows**

  Move timing into an active-row timer component, remove list-wide `extraData={now}`, and use `React.memo` with status/download/export fields as the comparison key.

- [ ] **Step 4: Virtualize/paginate history**

  Load session metadata first, fetch full messages only for the selected session, and render history with `FlatList` sections or a bounded list.

- [ ] **Step 5: Run tests and commit**

  Run: `npm test -- --runInBand mobile/src/route-tests/tasks.test.tsx mobile/src/agent/PromptAssistantUi.test.tsx mobile/src/agent/agentPresentation.test.ts`; run `npm run typecheck`.

  Commit: `git add mobile/src/tasks/TaskRow.tsx mobile/app/(tabs)/tasks.tsx mobile/src/agent && git commit -m "perf: isolate active task and history rendering"`

### Task 7: Full verification and device performance evidence

**Files:**
- Modify: only files required by failing verification; do not include `local.properties`.
- Test: all existing mobile tests and Android performance capture.

- [ ] **Step 1: Run the full static test suite**

  Run: `npm run typecheck` and `npm test -- --runInBand --silent` from `mobile`.

  Expected: typecheck succeeds and all Jest suites pass with zero failures.

- [ ] **Step 2: Build the Android app**

  Run: `cd android; .\\gradlew.bat assembleDebug`.

  Expected: Gradle exits 0 and produces the debug APK.

- [ ] **Step 3: Exercise regression flows on a connected emulator/device**

  Verify generation-to-queue immediate visibility, no duplicate submit on repeated taps, status refresh while media download is delayed, foreground/background overlap, Prompt long streaming, video detail lookup, and selected-task monitoring.

- [ ] **Step 4: Capture performance counters**

  Record `adb shell dumpsys gfxinfo`, `dumpsys meminfo`, SQLite write/request counters, and a Perfetto/JS profile before and after a long-history run. Confirm refresh latency no longer includes media delivery and write/request counts remain bounded.

- [ ] **Step 5: Review diff and commit final verification notes**

  Run: `git status --short; git diff --check; git log --oneline -8`.

  Expected: only intended source/test/docs changes are present; `local.properties` remains untracked and untouched.
