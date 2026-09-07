# B Release Media Hotfix Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete verified private-video recovery, enforce bidirectional task projection ownership, strengthen concurrency regressions, and restore a visibly usable Android build.

**Architecture:** Keep the existing Workflow and media repositories, but add narrow media-owned task writes and a primary-video lookup. All media flows resolve an existing `file://` candidate before export or download; stale paths fall through to the existing fail-closed adapter download policy. Android completion requires visible compositing and interaction evidence, not process state alone.

**Tech Stack:** React Native 0.86, Expo 57, Expo SQLite/FileSystem, TypeScript 6, Jest 29, Android adb/Gradle.

---

## File structure

- Modify `mobile/src/tasks/repository.ts`: add media-owned task projection persistence.
- Modify `mobile/src/tasks/repository.test.ts`: execute competing projection writes against a stateful fixture.
- Create `mobile/src/test/realSqlite.ts`: adapt Node 22's in-memory SQLite for repository behavior tests.
- Modify `mobile/src/tasks/media.ts`: verify every local candidate before download/export.
- Modify `mobile/src/tasks/media.test.ts`: cover stale non-empty paths, remote paths, and asset-only recovery.
- Modify `mobile/src/tasks/localMedia.ts`: continue candidate search after inspection errors.
- Modify `mobile/src/tasks/localMedia.test.ts`: cover rejected-candidate fallback.
- Modify `mobile/src/media/types.ts`: add primary-video lookup to `MediaStore`.
- Modify `mobile/src/media/repository.ts`: query the primary video by task id.
- Modify `mobile/src/media/repository.test.ts`: verify lookup and executed artifact merge behavior.
- Modify `mobile/src/tasks/mediaQueue.ts`: load the asset candidate and use media-only task writes.
- Modify `mobile/src/tasks/coordinator.ts`: expose the expanded queue dependency contracts.
- Modify `mobile/src/tasks/sync.ts`: pass the asset candidate into media orchestration.
- Modify `mobile/src/tasks/coordinator.test.ts`: prove automatic media writes cannot overwrite Workflow fields.
- Modify `mobile/app/(tabs)/tasks.tsx`: resolve asset/task paths and persist only media columns for manual actions.
- Modify `mobile/src/route-tests/tasks.test.tsx`: verify manual asset recovery and protected persistence.
- Modify `mobile/app/video/[id].tsx`: persist repairs and export progress through media-only task writes.
- Modify `mobile/src/route-tests/video-detail.test.tsx`: verify protected repair/export persistence.
- Modify `mobile/src/jobs/repository.test.ts`: overlap two exclusive artifact replacements.
- Modify `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`: replace the insufficient cold-start claim with exact visible acceptance evidence.

### Task 1: Media-owned task projection writes

**Files:**
- Create: `mobile/src/test/realSqlite.ts`
- Modify: `mobile/src/tasks/repository.test.ts`
- Modify: `mobile/src/tasks/repository.ts`

- [ ] **Step 1: Write a failing executed ownership test**

Add this reusable real-SQLite adapter:

```ts
import { DatabaseSync } from 'node:sqlite';

export function createRealSqliteTestDb() {
  const database = new DatabaseSync(':memory:');
  return {
    execSync(source: string) { database.exec(source); },
    runSync(source: string, ...params: unknown[]) { return database.prepare(source).run(...params); },
    async runAsync(source: string, ...params: unknown[]) { return database.prepare(source).run(...params); },
    getFirstSync<T>(source: string, ...params: unknown[]) { return database.prepare(source).get(...params) as T | undefined; },
    async getFirstAsync<T>(source: string, ...params: unknown[]) { return database.prepare(source).get(...params) as T | undefined; },
    getAllSync<T>(source: string, ...params: unknown[]) { return database.prepare(source).all(...params) as T[]; },
    async getAllAsync<T>(source: string, ...params: unknown[]) { return database.prepare(source).all(...params) as T[]; },
    close() { database.close(); },
  };
}
```

Then seed a row through the public repository, apply `upsertMediaProjection`, and read it back:

```ts
test('media projection update preserves newer workflow-owned fields', async () => {
  const db = createRealSqliteTestDb();
  const store = createTaskRepository(db as never);
  await store.upsert({
    id: 'task-1', prompt: 'new prompt', status: 'SUCCESS', resolution: '768p竖', duration: 5,
    videoUrl: 'https://provider/new.mp4', workflowId: 'h3', workflowVersion: '2',
    adapterId: 'autodl-comfyui', executionDuration: 27, lastSyncAt: 8_000,
    downloadState: 'IDLE', exportState: 'NOT_REQUESTED', createdAt: 1_000, updatedAt: 8_000,
  });

  await store.upsertMediaProjection({
    id: 'task-1', prompt: 'stale prompt', status: 'RUNNING', resolution: '480p竖', duration: 5,
    videoUrl: 'https://provider/stale.mp4', localUri: 'file:///private.mp4',
    downloadState: 'DOWNLOADED', exportState: 'NOT_REQUESTED',
    createdAt: 1_000, updatedAt: 9_000,
  });

  await expect(store.get('task-1')).resolves.toMatchObject({
    prompt: 'new prompt', status: 'SUCCESS', videoUrl: 'https://provider/new.mp4',
    workflowVersion: '2', executionDuration: 27, lastSyncAt: 8_000,
    localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED', updatedAt: 9_000,
  });
  db.close();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/tasks/repository.test.ts
```

Expected: FAIL because `upsertMediaProjection` does not exist.

- [ ] **Step 3: Implement the media projection upsert**

Reuse the complete insert column/value list, with this conflict clause:

```sql
ON CONFLICT(id) DO UPDATE SET
local_uri=excluded.local_uri,
thumbnail_url=excluded.thumbnail_url,
download_state=excluded.download_state,
download_error=excluded.download_error,
download_progress=excluded.download_progress,
gallery_uri=excluded.gallery_uri,
export_state=excluded.export_state,
export_error=excluded.export_error,
exported_at=excluded.exported_at,
updated_at=MAX(tasks.updated_at, excluded.updated_at)
```

Do not include any Workflow-owned column in the conflict clause.

- [ ] **Step 4: Run the focused repository tests and verify GREEN**

Run the same command. Expected: all task repository tests PASS.

- [ ] **Step 5: Commit the projection boundary**

```powershell
git add mobile/src/test/realSqlite.ts mobile/src/tasks/repository.ts mobile/src/tasks/repository.test.ts
git commit -m "fix: isolate media task projection writes"
```

### Task 2: Verify stale and recovered private sources

**Files:**
- Modify: `mobile/src/tasks/localMedia.test.ts`
- Modify: `mobile/src/tasks/localMedia.ts`
- Modify: `mobile/src/tasks/media.test.ts`
- Modify: `mobile/src/tasks/media.ts`

- [ ] **Step 1: Write RED resolver and orchestration tests**

Add separate tests proving:

```ts
test('continues after an unreadable asset candidate', async () => {
  const getInfo = jest.fn(async (uri: string) => {
    if (uri === 'file:///broken.mp4') throw new Error('invalid uri');
    return { exists: uri === 'file:///task-copy.mp4' };
  });
  await expect(resolveLocalVideoSource({
    task: { ...task, localUri: 'file:///task-copy.mp4' },
    asset: { ...asset, localPath: 'file:///broken.mp4' },
  }, { documentDirectory: 'file:///docs/', getInfo })).resolves.toBe('file:///task-copy.mp4');
});
```

```ts
it('does not export a stale non-empty localUri and securely redownloads', async () => {
  const deps = {
    resolveLocal: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue({ ...task, localUri: 'file:///restored.mp4', downloadState: 'DOWNLOADED' }),
    publish: jest.fn().mockResolvedValue({ uri: 'content://media/video/11', displayName: 'task-1.mp4', relativePath: 'Movies/AutoDL-H3/', alreadyExisted: false }),
    removePrivate: jest.fn().mockResolvedValue(undefined),
  };
  const result = await exportTaskVideo({ ...task, localUri: 'file:///missing.mp4' }, {
    policy: { autoExportToGallery: false, keepPrivateCopy: true },
    allowedHosts: ['example'], deps, onUpdate: jest.fn(async () => undefined),
  });
  expect(deps.publish).not.toHaveBeenCalledWith('file:///missing.mp4', expect.anything());
  expect(deps.download).toHaveBeenCalledWith(expect.objectContaining({ localUri: undefined }), expect.anything());
  expect(result).toMatchObject({ localUri: 'file:///restored.mp4', exportState: 'EXPORTED' });
});
```

```ts
it('recovers an asset-only private source before export', async () => {
  const deps = {
    resolveLocal: jest.fn().mockResolvedValue('file:///asset-copy.mp4'),
    download: jest.fn(),
    publish: jest.fn().mockResolvedValue({ uri: 'content://media/video/12', displayName: 'task-1.mp4', relativePath: 'Movies/AutoDL-H3/', alreadyExisted: false }),
    removePrivate: jest.fn().mockResolvedValue(undefined),
  };
  await exportTaskVideo(task, {
    asset: { localPath: 'file:///asset-copy.mp4' },
    policy: { autoExportToGallery: false, keepPrivateCopy: true }, deps,
    onUpdate: jest.fn(async () => undefined),
  });
  expect(deps.resolveLocal).toHaveBeenCalledWith(task, { localPath: 'file:///asset-copy.mp4' });
  expect(deps.publish).toHaveBeenCalledWith('file:///asset-copy.mp4', expect.anything());
});
```

Add the non-file rejection explicitly:

```ts
it('never sends a remote localUri to native export', async () => {
  const deps = {
    resolveLocal: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue({ ...task, localUri: 'file:///safe.mp4', downloadState: 'DOWNLOADED' }),
    publish: jest.fn().mockResolvedValue({ uri: 'content://media/video/13', displayName: 'task-1.mp4', relativePath: 'Movies/AutoDL-H3/', alreadyExisted: false }),
    removePrivate: jest.fn().mockResolvedValue(undefined),
  };
  await exportTaskVideo({ ...task, localUri: 'https://untrusted.example/video.mp4' }, {
    policy: { autoExportToGallery: false, keepPrivateCopy: true },
    allowedHosts: ['example'], deps, onUpdate: jest.fn(async () => undefined),
  });
  expect(deps.publish).not.toHaveBeenCalledWith('https://untrusted.example/video.mp4', expect.anything());
  expect(deps.publish).toHaveBeenCalledWith('file:///safe.mp4', expect.anything());
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
cd mobile
npm test -- --runInBand src/tasks/localMedia.test.ts src/tasks/media.test.ts
```

Expected failures: candidate exception aborts resolution; stale `localUri` bypasses resolution; `asset` is not an option.

- [ ] **Step 3: Make candidate inspection resilient**

Change the resolver loop to reject a candidate without rejecting the resolution pass:

```ts
for (const candidate of [...new Set(candidates)]) {
  try {
    if ((await deps.getInfo(candidate)).exists) return candidate;
  } catch {
    // Try the next reviewed private candidate.
  }
}
```

- [ ] **Step 4: Resolve before every download/export decision**

Change the dependency and option contracts:

```ts
type LocalCandidate = Pick<MediaAsset, 'localPath'>;
resolveLocal(task: TaskRecord, asset?: LocalCandidate | null): Promise<string | undefined>;
asset?: LocalCandidate | null;
```

At the start of `downloadIfNeeded`, resolve first. Repair a recovered path; otherwise clear a stale `localUri` before evaluating `videoUrl` and invoking the secure downloader:

```ts
const deps = options.deps ?? defaultDeps;
const verified = await deps.resolveLocal(task, options.asset);
if (verified) {
  const patch = { localUri: verified, downloadState: 'DOWNLOADED' as const, downloadError: undefined, downloadProgress: 1, updatedAt: Date.now() };
  if (task.localUri !== verified || task.downloadState !== 'DOWNLOADED' || task.downloadError) await options.onUpdate(patch);
  return { task: { ...task, ...patch }, downloadedNow: false };
}
let current = task;
if (current.localUri) {
  const patch = { localUri: undefined, downloadState: 'IDLE' as const, downloadError: undefined, downloadProgress: undefined, updatedAt: Date.now() };
  await options.onUpdate(patch);
  current = { ...current, ...patch };
}
if (!current.videoUrl) return { task: current, downloadedNow: false };
```

Pass `current`, not the stale input task, to `download`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 2 command. Expected: both suites PASS.

- [ ] **Step 6: Commit verified-source behavior**

```powershell
git add mobile/src/tasks/localMedia.ts mobile/src/tasks/localMedia.test.ts mobile/src/tasks/media.ts mobile/src/tasks/media.test.ts
git commit -m "fix: verify every private media source"
```

### Task 3: Supply asset candidates to automatic delivery

**Files:**
- Modify: `mobile/src/media/types.ts`
- Modify: `mobile/src/media/repository.test.ts`
- Modify: `mobile/src/media/repository.ts`
- Modify: `mobile/src/tasks/mediaQueue.ts`
- Modify: `mobile/src/tasks/coordinator.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/tasks/coordinator.test.ts`

- [ ] **Step 1: Write RED primary-video lookup and queue tests**

Add a repository assertion for the task-scoped query:

```ts
test('loads the primary video asset by task id', async () => {
  const store = createSqliteMediaStore(fakeDb());
  await store.upsert({ ...asset, id: 'video-1', taskId: 'task-1', kind: 'video', localPath: 'file:///asset.mp4' });
  await expect(store.getPrimaryVideoByTaskId?.('task-1')).resolves.toMatchObject({ id: 'video-1', localPath: 'file:///asset.mp4' });
});
```

In coordinator/queue tests, expose `getPrimaryVideoByTaskId`, return an asset, run delivery, and assert the fifth `ensureMedia` argument is `{ localPath: 'file:///asset.mp4' }`. Also assert media progress calls `upsertMediaProjection` and never `upsert`.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
cd mobile
npm test -- --runInBand src/media/repository.test.ts src/tasks/coordinator.test.ts
```

Expected: lookup and media projection methods are missing from the queue path.

- [ ] **Step 3: Implement primary-video lookup**

Add to `MediaStore`:

```ts
getPrimaryVideoByTaskId?(taskId: string): Promise<MediaAsset | null>;
```

Implement with:

```sql
SELECT * FROM media_assets
WHERE task_id = ? AND kind = 'video'
ORDER BY updated_at DESC, id ASC
LIMIT 1
```

- [ ] **Step 4: Route automatic delivery through protected dependencies**

Extend `ensureMedia` with an optional fifth asset argument. In `processTask`:

```ts
const asset = await deps.mediaStore?.getPrimaryVideoByTaskId?.(current.id);
const persistMedia = (task: TaskRecord) =>
  deps.taskStore.upsertMediaProjection?.(task) ?? deps.taskStore.upsert(task);
```

Use `persistMedia(current)` in `onUpdate`, and pass `asset ? { localPath: asset.localPath } : null` to `ensureMedia`. In `sync.ts`, forward it as `asset` to `ensureTaskMedia`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 3 command plus `src/tasks/media.test.ts`. Expected: all suites PASS.

- [ ] **Step 6: Commit automatic delivery wiring**

```powershell
git add mobile/src/media/types.ts mobile/src/media/repository.ts mobile/src/media/repository.test.ts mobile/src/tasks/mediaQueue.ts mobile/src/tasks/coordinator.ts mobile/src/tasks/sync.ts mobile/src/tasks/coordinator.test.ts
git commit -m "fix: recover asset media in delivery queue"
```

### Task 4: Protect manual and detail media writes

**Files:**
- Modify: `mobile/src/route-tests/tasks.test.tsx`
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Modify: `mobile/src/route-tests/video-detail.test.tsx`
- Modify: `mobile/app/video/[id].tsx`

- [ ] **Step 1: Write RED route tests**

Update route mocks to expose `mediaStore.getPrimaryVideoByTaskId` and `taskStore.upsertMediaProjection`. Add tests that:

- a task with stale `localUri` and valid asset path repairs to the asset path before export;
- retry download passes `localUri: undefined` when no candidate exists;
- repair/export callbacks call `upsertMediaProjection` and do not call full `upsert` for progress.

Example assertion:

```ts
expect(taskStore.upsertMediaProjection).toHaveBeenCalledWith(expect.objectContaining({
  id: 'task-1', localUri: 'file:///asset-copy.mp4', downloadState: 'DOWNLOADED',
}));
expect(taskStore.upsert).not.toHaveBeenCalledWith(expect.objectContaining({ downloadState: 'DOWNLOADING' }));
```

- [ ] **Step 2: Run route tests and verify RED**

```powershell
cd mobile
npm test -- --runInBand src/route-tests/tasks.test.tsx src/route-tests/video-detail.test.tsx
```

Expected: route code does not query the asset and continues to use full task upserts.

- [ ] **Step 3: Wire the task-list actions**

Import the exported `mediaStore` and resolver. Before retry/export:

```ts
const asset = await mediaStore.getPrimaryVideoByTaskId?.(task.id);
const verified = await resolveLocalVideoSource({ task, asset });
const current = verified
  ? { ...task, localUri: verified, downloadState: 'DOWNLOADED' as const, downloadError: undefined }
  : { ...task, localUri: undefined };
```

Persist callback snapshots with:

```ts
await (taskStore.upsertMediaProjection?.(value) ?? taskStore.upsert(value));
```

Pass the asset candidate into `exportTaskVideo`.

- [ ] **Step 4: Protect detail repairs and export callbacks**

Use `upsertMediaProjection` for repaired task state, export progress, and final exported state. Keep `mediaStore.upsert` for the asset snapshot and delivery row.

- [ ] **Step 5: Run route and media tests and verify GREEN**

Run the Task 4 command plus `src/tasks/media.test.ts`. Expected: all suites PASS.

- [ ] **Step 6: Commit route convergence**

```powershell
git add mobile/app/(tabs)/tasks.tsx mobile/app/video/[id].tsx mobile/src/route-tests/tasks.test.tsx mobile/src/route-tests/video-detail.test.tsx
git commit -m "fix: protect manual media actions"
```

### Task 5: Strengthen transaction and conflict regressions

**Files:**
- Modify: `mobile/src/jobs/repository.test.ts`
- Modify: `mobile/src/tasks/repository.test.ts`
- Modify: `mobile/src/media/repository.test.ts`

- [ ] **Step 1: Add an overlapping replacement regression**

Use two distinct transaction objects and overlap both repository calls:

```ts
const transactions: Array<{ runAsync: jest.Mock }> = [];
const db = {
  execSync: jest.fn(), getFirstAsync: jest.fn(), getAllAsync: jest.fn(),
  withExclusiveTransactionAsync: jest.fn(async (callback: (tx: { runAsync: jest.Mock }) => Promise<void>) => {
    const tx = { runAsync: jest.fn(async () => undefined) };
    transactions.push(tx);
    await Promise.resolve();
    await callback(tx);
  }),
};
const store = createJobRepository(db as never);
await Promise.all([
  store.replaceArtifacts('job-1', [{ id: 'a', jobId: 'job-1', kind: 'video', uri: 'https://cdn/a' }]),
  store.replaceArtifacts('job-2', [{ id: 'b', jobId: 'job-2', kind: 'video', uri: 'https://cdn/b' }]),
]);
expect(transactions).toHaveLength(2);
expect(transactions[0].runAsync.mock.calls.flat()).not.toContain('job-2');
expect(transactions[1].runAsync.mock.calls.flat()).not.toContain('job-1');
```

- [ ] **Step 2: Replace SQL-string-only assertions with executed fixtures**

For task and media artifact projection tests, seed a stateful row, execute the repository method, then read and assert the preserved values. Keep one small SQL-contract assertion only where it verifies the forbidden conflict columns.

- [ ] **Step 3: Run focused repository tests**

```powershell
cd mobile
npm test -- --runInBand src/jobs/repository.test.ts src/tasks/repository.test.ts src/media/repository.test.ts
```

Expected: all suites PASS, including the overlapping calls and read-back ownership assertions.

- [ ] **Step 4: Commit regression strengthening**

```powershell
git add mobile/src/jobs/repository.test.ts mobile/src/tasks/repository.test.ts mobile/src/media/repository.test.ts
git commit -m "test: execute media concurrency regressions"
```

### Task 6: Full verification and visible Android acceptance

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`

- [ ] **Step 1: Run static and complete automated verification**

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
cd ..
git diff --check
```

Expected: typecheck exits 0; every Jest suite passes; diff check exits 0.

- [ ] **Step 2: Build the x86_64 debug APK**

Use the configured JDK 21 and run:

```powershell
cd mobile/android
./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --console=plain
```

Expected: `BUILD SUCCESSFUL` and `app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 3: Install and cold-start without clearing app data**

```powershell
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 logcat -c
adb -s emulator-5554 shell am force-stop com.example.autodlh3
adb -s emulator-5554 shell am start -W -n com.example.autodlh3/.MainActivity
```

Expected: install succeeds and launch reports `Status: ok`.

- [ ] **Step 4: Prove visible and interactive rendering**

Dump the UI tree, derive the task-tab center from its bounds, tap it, and dump again. Capture a PNG through a device file plus `adb pull` to avoid PowerShell binary redirection.

Acceptance assertions:

- first UI tree contains `MiniMax H3`;
- second UI tree contains `任务队列`;
- screenshot inspection visibly shows app content, not only system bars;
- `dumpsys window windows` reports the MainActivity surface `shown=true` and effective alpha greater than zero;
- `logcat -b crash -d` contains no `com.example.autodlh3` crash;
- app-process logs contain no fatal ReactNativeJS error.

If the React tree is healthy but the launch animation remains stuck, restart the emulator/window state and repeat Steps 3-4 with the unchanged APK.

- [ ] **Step 5: Update exact handoff evidence**

Replace the old pid/top-resumed-only statement with the automated counts, build/install result, visible screenshot result, route-interaction result, WindowManager surface result, and any remaining credentialed acceptance items. Do not claim credentialed export acceptance unless it was executed.

- [ ] **Step 6: Run final clean-state gate and commit evidence**

```powershell
git add docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md
git diff --cached --check
git commit -m "docs: verify corrected B media hotfix"
git status --short --branch
```

Expected: only branch-ahead state plus user-owned `local.properties` and generated `mobile/.expo/` remain untracked.
