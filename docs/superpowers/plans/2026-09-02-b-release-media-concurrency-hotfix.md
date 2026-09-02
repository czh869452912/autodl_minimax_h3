# B Release Media Concurrency Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve full Workflow synchronization while eliminating concurrent SQLite transaction interference and ensuring downloaded private videos remain the authoritative source for detail status and gallery export.

**Architecture:** Keep provider/job synchronization complete, but introduce explicit projection-write APIs so Workflow-owned columns cannot overwrite media-owned columns. Replace non-exclusive artifact transactions with Expo SQLite exclusive transactions, make artifact materialization non-destructive, and resolve/repair verified app-private files before presenting or exporting media.

**Tech Stack:** React Native 0.86, Expo 57, Expo SQLite, Expo FileSystem, TypeScript 6, Jest 29, Android MediaStore/Kotlin.

---

## File structure

- Modify `mobile/src/jobs/repository.ts`: run artifact replacement through the exclusive transaction connection.
- Modify `mobile/src/jobs/repository.test.ts`: reproduce concurrent/non-exclusive transaction misuse and verify transaction-object writes.
- Modify `mobile/src/tasks/repository.ts`: add a Workflow projection upsert that preserves media-owned database columns.
- Modify `mobile/src/tasks/repository.test.ts`: verify complete Workflow updates and local-media preservation in the generated SQL contract.
- Modify `mobile/src/tasks/coordinator.ts`: route synchronization writes through the Workflow projection API without reducing synchronized fields.
- Modify `mobile/src/tasks/coordinator.test.ts`: prove full projection updates and failure diagnostics use the protected write.
- Modify `mobile/src/media/types.ts`: expose an artifact-projection write on `MediaStore`.
- Modify `mobile/src/media/repository.ts`: merge artifact metadata without downgrading existing local/download/export fields.
- Modify `mobile/src/media/repository.test.ts`: verify the non-destructive SQL merge.
- Modify `mobile/src/media/materializer.ts`: use artifact-projection persistence.
- Modify `mobile/src/media/materializer.test.ts`: preserve downloaded assets across repeated Workflow materialization.
- Create `mobile/src/tasks/localMedia.ts`: resolve and verify task/asset/deterministic private video candidates.
- Create `mobile/src/tasks/localMedia.test.ts`: test local-only resolution, existence checks, and deterministic recovery.
- Modify `mobile/src/workflows/providers/registry.ts`: expose the builtin artifact policy without creating a network transport.
- Modify `mobile/src/workflows/providers/registry.test.ts`: keep exact AutoDL allowlist behavior covered.
- Modify `mobile/app/video/[id].tsx`: resolve/repair local media, display effective state, and export the verified local source.
- Modify `mobile/app/(tabs)/tasks.tsx`: pass the adapter artifact policy to explicit retry/export actions.
- Modify `mobile/src/route-tests/video-detail.test.tsx`: cover stale task state with a valid private asset and direct gallery export.
- Modify `mobile/src/route-tests/tasks.test.tsx`: cover policy propagation on explicit retry/export.
- Modify `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`: record the B hotfix and keep C/D paused until Android acceptance.

### Task 1: Exclusive SQLite artifact replacement

**Files:**
- Modify: `mobile/src/jobs/repository.test.ts`
- Modify: `mobile/src/jobs/repository.ts`

- [ ] **Step 1: Replace the old async-transaction test with a RED exclusive-transaction test**

Add a fake root database whose `runAsync` throws if artifact SQL uses the shared connection and whose exclusive callback supplies a separate transaction object:

```ts
test('uses the exclusive transaction connection for artifact replacement', async () => {
  const transaction = { runAsync: jest.fn(async () => undefined) };
  const db = {
    execSync: jest.fn(),
    runAsync: jest.fn(async () => { throw new Error('shared connection used inside transaction'); }),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    withTransactionAsync: jest.fn(async () => { throw new Error('non-exclusive transaction used'); }),
    withExclusiveTransactionAsync: jest.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
  };
  const store = createJobRepository(db as never);

  await store.replaceArtifacts('local-1', [
    { id: 'a', jobId: 'local-1', kind: 'video', uri: 'https://cdn/video' },
  ]);

  expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  expect(db.withTransactionAsync).not.toHaveBeenCalled();
  expect(transaction.runAsync).toHaveBeenNthCalledWith(1, 'DELETE FROM workflow_artifacts WHERE job_id = ?', 'local-1');
  expect(transaction.runAsync).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO workflow_artifacts'), 'a', 'local-1', 'video', 'https://cdn/video', null, null);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/jobs/repository.test.ts
```

Expected: FAIL because `replaceArtifacts` calls `withTransactionAsync` and writes through the root database.

- [ ] **Step 3: Implement the exclusive transaction path**

In `replaceArtifacts`, prefer the native exclusive API and use its callback argument for every statement:

```ts
const exclusiveTransaction = (database as unknown as {
  withExclusiveTransactionAsync?: (
    fn: (transaction: { runAsync(sql: string, ...params: any[]): Promise<unknown> }) => Promise<void>,
  ) => Promise<void>;
}).withExclusiveTransactionAsync;

if (exclusiveTransaction) {
  await exclusiveTransaction.call(database, async (transaction) => {
    await transaction.runAsync('DELETE FROM workflow_artifacts WHERE job_id = ?', jobId);
    for (const value of values) {
      await transaction.runAsync(
        'INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)',
        value.id,
        jobId,
        value.kind,
        value.uri ?? null,
        value.mime ?? null,
        value.metadata ? JSON.stringify(value.metadata) : null,
      );
    }
  });
  return;
}
```

Remove the `withTransactionAsync` artifact-replacement branch. Keep `withTransactionSync` and explicit synchronous `BEGIN` fallbacks for Jest/non-native databases.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
cd mobile
npm test -- --runInBand src/jobs/repository.test.ts src/workflows/runtime/runtime.test.ts
```

Expected: both suites PASS; the exclusive test confirms no shared-connection artifact write.

- [ ] **Step 5: Commit the isolated transaction fix**

```powershell
git add mobile/src/jobs/repository.ts mobile/src/jobs/repository.test.ts
git commit -m "fix: isolate concurrent artifact transactions"
```

### Task 2: Preserve media fields during full Workflow synchronization

**Files:**
- Modify: `mobile/src/tasks/repository.test.ts`
- Modify: `mobile/src/tasks/repository.ts`
- Modify: `mobile/src/tasks/coordinator.test.ts`
- Modify: `mobile/src/tasks/coordinator.ts`

- [ ] **Step 1: Write a RED repository test for Workflow projection ownership**

Use a `runAsync` spy and assert that the new API inserts a complete task but only updates Workflow-owned columns on conflict:

```ts
test('workflow projection upsert preserves media-owned columns on conflict', async () => {
  const runAsync = jest.fn(async () => undefined);
  const db = {
    execSync: jest.fn(),
    getFirstSync: jest.fn((sql: string) => sql.includes('PRAGMA') ? { user_version: 5 } : null),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
    runAsync,
  };
  const store = createTaskRepository(db as never);

  await store.upsertWorkflowProjection({
    ...task,
    status: 'SUCCESS',
    videoUrl: 'https://provider/result.mp4',
    localUri: undefined,
    downloadState: 'IDLE',
    workflowId: 'h3',
    adapterId: 'autodl-comfyui',
    lastSyncAt: 4_000,
  });

  const sql = runAsync.mock.calls[0][0] as string;
  expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET');
  expect(sql).toContain('video_url=excluded.video_url');
  expect(sql).toContain('status=excluded.status');
  expect(sql).toContain('last_sync_at=excluded.last_sync_at');
  expect(sql).not.toContain('local_uri=excluded.local_uri');
  expect(sql).not.toContain('download_state=excluded.download_state');
  expect(sql).not.toContain('gallery_uri=excluded.gallery_uri');
  expect(sql).not.toContain('export_state=excluded.export_state');
});
```

- [ ] **Step 2: Write a RED coordinator test proving full projection routing**

Extend the coordinator fixture with `upsertWorkflowProjection` and assert the synchronized task still includes status, artifact URL, timing, provenance, and sync metadata:

```ts
test('persists the complete workflow projection through the media-safe write', async () => {
  const value = setup([task('local-1')], [job('local-1', 'remote-1')]);
  value.runtime.sync.mockResolvedValueOnce({
    ...job('local-1', 'remote-1'),
    status: 'SUCCEEDED',
    startedAt: 1_500,
    executionDuration: 27,
    updatedAt: 2,
  } as never);

  await value.coordinator.run();

  expect(value.taskStore.upsertWorkflowProjection).toHaveBeenCalledWith(expect.objectContaining({
    id: 'local-1',
    status: 'SUCCESS',
    videoUrl: 'https://cdn.test/video',
    workflowId: 'demo',
    adapterId: 'demo',
    startedAt: 1_500,
    executionDuration: 27,
    lastSyncAt: 2,
  }));
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/tasks/repository.test.ts src/tasks/coordinator.test.ts
```

Expected: FAIL because `upsertWorkflowProjection` does not exist and the coordinator uses full-row `upsert`.

- [ ] **Step 4: Implement `upsertWorkflowProjection`**

Reuse the complete INSERT value list from `upsert`, then use this conflict-update list:

```sql
ON CONFLICT(id) DO UPDATE SET
prompt=excluded.prompt,
status=excluded.status,
resolution=excluded.resolution,
duration=excluded.duration,
seed=excluded.seed,
images_json=excluded.images_json,
audios_json=excluded.audios_json,
video_url=excluded.video_url,
created_at=excluded.created_at,
updated_at=MAX(tasks.updated_at, excluded.updated_at),
started_at=excluded.started_at,
execution_duration=excluded.execution_duration,
workflow_id=excluded.workflow_id,
workflow_version=excluded.workflow_version,
workflow_hash=excluded.workflow_hash,
adapter_id=excluded.adapter_id,
adapter_version=excluded.adapter_version,
input_json=excluded.input_json,
sync_error=excluded.sync_error,
last_sync_at=excluded.last_sync_at
```

Do not include `local_uri`, `thumbnail_url`, `download_state`, `download_error`, `download_progress`, `gallery_uri`, `export_state`, `export_error`, or `exported_at` in the conflict-update list.

- [ ] **Step 5: Route synchronization writes through the new method**

Add the optional method to the coordinator dependency type:

```ts
type TaskStore = {
  list(): Promise<TaskRecord[]>;
  listActive?(): Promise<TaskRecord[]>;
  listSyncCandidates?(): Promise<TaskRecord[]>;
  listMediaPending?(): Promise<TaskRecord[]>;
  upsert(task: TaskRecord): Promise<void>;
  upsertWorkflowProjection?(task: TaskRecord): Promise<void>;
};
```

Define a focused helper and use it for successful sync and sync-error diagnostics:

```ts
const persistWorkflowProjection = (task: TaskRecord) =>
  deps.taskStore.upsertWorkflowProjection?.(task) ?? deps.taskStore.upsert(task);
```

Keep full `jobToTaskProjection(updatedJob, artifacts, previous)` construction and full job/artifact synchronization unchanged.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
cd mobile
npm test -- --runInBand src/tasks/repository.test.ts src/tasks/coordinator.test.ts src/tasks/projection.test.ts
```

Expected: all suites PASS and full Workflow fields are asserted through the protected write.

- [ ] **Step 7: Commit Workflow projection ownership**

```powershell
git add mobile/src/tasks/repository.ts mobile/src/tasks/repository.test.ts mobile/src/tasks/coordinator.ts mobile/src/tasks/coordinator.test.ts
git commit -m "fix: preserve local media during workflow sync"
```

### Task 3: Make artifact materialization non-destructive

**Files:**
- Modify: `mobile/src/media/types.ts`
- Modify: `mobile/src/media/repository.test.ts`
- Modify: `mobile/src/media/repository.ts`
- Modify: `mobile/src/media/materializer.test.ts`
- Modify: `mobile/src/media/materializer.ts`
- Modify: `mobile/src/tasks/coordinator.ts`
- Modify: `mobile/src/tasks/mediaQueue.ts`

- [ ] **Step 1: Write a RED repository test for a media-safe artifact merge**

```ts
test('artifact projection merge cannot clear an existing private download', async () => {
  const runAsync = jest.fn(async () => undefined);
  const db = {
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    runAsync,
  };
  const store = createSqliteMediaStore(db as never);

  await store.upsertArtifactProjection?.({
    ...asset,
    localPath: undefined,
    posterPath: undefined,
    status: 'downloading',
    sourceUrl: 'https://provider/new-result.mp4',
  });

  const sql = runAsync.mock.calls[0][0] as string;
  expect(sql).toContain('local_path=COALESCE(media_assets.local_path, excluded.local_path)');
  expect(sql).toContain("WHEN media_assets.local_path IS NOT NULL OR media_assets.status = 'downloaded' THEN 'downloaded'");
  expect(sql).toContain('export_status=COALESCE(media_assets.export_status, excluded.export_status)');
});
```

- [ ] **Step 2: Write a RED materializer test for the dedicated projection API**

```ts
test('uses the non-destructive artifact projection writer when available', async () => {
  const store = {
    upsert: jest.fn(async () => undefined),
    upsertArtifactProjection: jest.fn(async () => undefined),
  };

  await materializeJobArtifacts(job, artifacts, store);

  expect(store.upsertArtifactProjection).toHaveBeenCalledWith(expect.objectContaining({
    id: 'job-1:video-1',
    sourceUrl: 'https://cdn/video',
  }));
  expect(store.upsert).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/media/repository.test.ts src/media/materializer.test.ts
```

Expected: FAIL because `upsertArtifactProjection` does not exist.

- [ ] **Step 4: Add the artifact-projection MediaStore contract and SQL merge**

Add this optional API to `MediaStore`:

```ts
upsertArtifactProjection?(asset: MediaAsset): Promise<void>;
```

Use the same INSERT columns and values as `upsert`, with this conflict merge:

```sql
ON CONFLICT(id) DO UPDATE SET
task_id=excluded.task_id,
title=excluded.title,
prompt=excluded.prompt,
source_url=excluded.source_url,
local_path=COALESCE(media_assets.local_path, excluded.local_path),
poster_path=COALESCE(media_assets.poster_path, excluded.poster_path),
mime_type=excluded.mime_type,
width=COALESCE(excluded.width, media_assets.width),
height=COALESCE(excluded.height, media_assets.height),
duration_ms=COALESCE(excluded.duration_ms, media_assets.duration_ms),
status=CASE
  WHEN media_assets.local_path IS NOT NULL OR media_assets.status = 'downloaded' THEN 'downloaded'
  ELSE excluded.status
END,
updated_at=MAX(media_assets.updated_at, excluded.updated_at),
artifact_id=excluded.artifact_id,
job_id=excluded.job_id,
workflow_id=excluded.workflow_id,
kind=excluded.kind,
export_status=COALESCE(media_assets.export_status, excluded.export_status)
```

- [ ] **Step 5: Route materialization through the projection writer**

Change the narrow store contract and write call:

```ts
type AssetStore = Pick<MediaStore, 'upsert'> & Partial<Pick<MediaStore, 'upsertArtifactProjection'>>;

const persist = store.upsertArtifactProjection?.bind(store) ?? store.upsert.bind(store);
await persist(asset);
```

Expand the coordinator and media queue `mediaStore` dependency picks to include `upsertArtifactProjection` so the real store method reaches the materializer.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
cd mobile
npm test -- --runInBand src/media/repository.test.ts src/media/materializer.test.ts src/media/catalog.test.ts src/tasks/coordinator.test.ts
```

Expected: all suites PASS; remote artifact refreshes remain complete and cannot erase private media state.

- [ ] **Step 7: Commit the media projection fix**

```powershell
git add mobile/src/media/types.ts mobile/src/media/repository.ts mobile/src/media/repository.test.ts mobile/src/media/materializer.ts mobile/src/media/materializer.test.ts mobile/src/tasks/coordinator.ts mobile/src/tasks/mediaQueue.ts
git commit -m "fix: keep downloaded assets during materialization"
```

### Task 4: Resolve and repair verified private video files

**Files:**
- Create: `mobile/src/tasks/localMedia.test.ts`
- Create: `mobile/src/tasks/localMedia.ts`

- [ ] **Step 1: Write RED tests for candidate priority and deterministic recovery**

```ts
import type { MediaAsset } from '../media/types';
import type { TaskRecord } from './types';
import { resolveLocalVideoSource } from './localMedia';

const task: TaskRecord = {
  id: 'task-1',
  prompt: 'x',
  status: 'SUCCESS',
  resolution: '768p竖',
  duration: 5,
  localUri: 'file:///tasks-copy.mp4',
  createdAt: 1,
  updatedAt: 2,
};
const asset = { id: 'asset-1', taskId: 'task-1', title: 'x', prompt: 'x', sourceUrl: 'https://remote/video.mp4', localPath: 'file:///asset-copy.mp4', mimeType: 'video/mp4', status: 'downloaded', createdAt: 1, updatedAt: 2 } satisfies MediaAsset;

test('prefers an existing asset private path', async () => {
  const getInfo = jest.fn(async (uri: string) => ({ exists: uri === 'file:///asset-copy.mp4' }));
  await expect(resolveLocalVideoSource({ task, asset }, { documentDirectory: 'file:///docs/', getInfo })).resolves.toBe('file:///asset-copy.mp4');
});

test('recovers the deterministic private download when projections are stale', async () => {
  const getInfo = jest.fn(async (uri: string) => ({ exists: uri === 'file:///docs/media/task-1.mp4' }));
  await expect(resolveLocalVideoSource({ task: { ...task, localUri: undefined }, asset: { ...asset, localPath: undefined } }, { documentDirectory: 'file:///docs/', getInfo })).resolves.toBe('file:///docs/media/task-1.mp4');
});

test('never accepts a remote URL as a local export source', async () => {
  const getInfo = jest.fn(async () => ({ exists: true }));
  await expect(resolveLocalVideoSource({ task: { ...task, localUri: 'https://remote/video.mp4' }, asset: null }, { documentDirectory: 'file:///docs/', getInfo })).resolves.toBeUndefined();
  expect(getInfo).toHaveBeenCalledWith('file:///docs/media/task-1.mp4');
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/tasks/localMedia.test.ts
```

Expected: FAIL because `localMedia.ts` does not exist.

- [ ] **Step 3: Implement the focused resolver**

```ts
import * as FileSystem from 'expo-file-system/legacy';
import type { MediaAsset } from '../media/types';
import type { TaskRecord } from './types';

type LocalMediaDeps = {
  documentDirectory?: string | null;
  getInfo(uri: string): Promise<{ exists: boolean }>;
};

const defaultDeps: LocalMediaDeps = {
  documentDirectory: FileSystem.documentDirectory,
  getInfo: (uri) => FileSystem.getInfoAsync(uri),
};

export function privateVideoPath(taskId: string, documentDirectory = FileSystem.documentDirectory): string | undefined {
  return documentDirectory ? `${documentDirectory.replace(/\/+$/, '')}/media/${taskId}.mp4` : undefined;
}

export async function resolveLocalVideoSource(
  { task, asset }: { task: Pick<TaskRecord, 'id' | 'localUri'>; asset?: Pick<MediaAsset, 'localPath'> | null },
  deps: LocalMediaDeps = defaultDeps,
): Promise<string | undefined> {
  const deterministic = privateVideoPath(task.id, deps.documentDirectory);
  const candidates = [asset?.localPath, task.localUri, deterministic]
    .filter((value): value is string => Boolean(value?.startsWith('file://')));
  for (const candidate of [...new Set(candidates)]) {
    if ((await deps.getInfo(candidate)).exists) return candidate;
  }
  return undefined;
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
cd mobile
npm test -- --runInBand src/tasks/localMedia.test.ts src/tasks/download.test.ts
```

Expected: both suites PASS and the deterministic path matches the downloader target exactly.

- [ ] **Step 5: Commit the resolver**

```powershell
git add mobile/src/tasks/localMedia.ts mobile/src/tasks/localMedia.test.ts
git commit -m "fix: recover verified private video sources"
```

### Task 5: Repair detail/export state and explicit media actions

**Files:**
- Modify: `mobile/src/workflows/providers/registry.test.ts`
- Modify: `mobile/src/workflows/providers/registry.ts`
- Modify: `mobile/src/route-tests/video-detail.test.tsx`
- Modify: `mobile/app/video/[id].tsx`
- Modify: `mobile/src/route-tests/tasks.test.tsx`
- Modify: `mobile/app/(tabs)/tasks.tsx`

- [ ] **Step 1: Write a RED test for side-effect-free builtin artifact policy lookup**

```ts
import { createBuiltinProviderAdapters, getBuiltinArtifactDownloadPolicy } from './registry';

test('returns the exact reviewed AutoDL artifact policy without creating an adapter', () => {
  expect(getBuiltinArtifactDownloadPolicy('autodl-comfyui')).toEqual(autodlComfyUiManifest.artifactDownloadPolicy);
  expect(getBuiltinArtifactDownloadPolicy('unknown')).toBeUndefined();
});
```

- [ ] **Step 2: Add route RED tests for stale task state and direct local export**

Mock `resolveLocalVideoSource` to return `file:///documents/media/task-1.mp4`, return a media asset with a stale/missing `localPath`, and return a task with `downloadState: 'DOWNLOAD_FAILED'`. Assert:

```ts
expect(tree!.root.findAllByType(Text).some((node) =>
  [node.props.children].flat(Infinity).join('').includes('已下载'),
)).toBe(true);

await act(async () => tree!.root.findByProps({ accessibilityLabel: '保存到系统相册' }).props.onPress());
expect(mockExport).toHaveBeenCalledWith(expect.objectContaining({
  localUri: 'file:///documents/media/task-1.mp4',
  downloadState: 'DOWNLOADED',
}));
expect(mockStoreUpsert).toHaveBeenCalledWith(expect.objectContaining({
  localUri: 'file:///documents/media/task-1.mp4',
  downloadState: 'DOWNLOADED',
  downloadError: undefined,
}));
expect(mockMediaUpsert).toHaveBeenCalledWith(expect.objectContaining({
  localPath: 'file:///documents/media/task-1.mp4',
  status: 'downloaded',
}));
```

Update the media/task repository mocks to expose `get` and `upsert`, and mock `resolveLocalVideoSource` explicitly so the route test exercises repair behavior without relying on a real filesystem.

- [ ] **Step 3: Add route RED tests for explicit adapter-policy propagation**

For the task screen, mock `getBuiltinArtifactDownloadPolicy` to return:

```ts
{
  allowedHosts: ['autodl.art'],
  acceptedMimes: ['video/mp4'],
  maxBytes: 2 * 1024 * 1024 * 1024,
  timeoutMs: 30_000,
}
```

Press retry download and retry export for an `adapterId: 'autodl-comfyui'` task, then assert `downloadTask`/`exportTaskVideo` receive the policy fields. This proves manual actions retain the same fail-closed policy as automatic delivery.

- [ ] **Step 4: Run the focused route/provider tests and verify RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/workflows/providers/registry.test.ts src/route-tests/video-detail.test.tsx src/route-tests/tasks.test.tsx
```

Expected: FAIL because policy lookup and local-source repair are not wired into the routes.

- [ ] **Step 5: Implement builtin policy lookup**

Add a manifest-only map in `registry.ts`:

```ts
const builtinManifests = [autodlComfyUiManifest];

export function getBuiltinArtifactDownloadPolicy(adapterId?: string) {
  return builtinManifests.find((manifest) => manifest.id === adapterId)?.artifactDownloadPolicy;
}
```

This function must not call `getNativeHttpTransport` or construct an adapter.

- [ ] **Step 6: Resolve and repair local media when loading the detail screen**

After loading the media asset and task, call `resolveLocalVideoSource`. When it returns a path, persist and store these repaired snapshots before rendering:

```ts
const repairedTask: TaskRecord = {
  ...value,
  localUri: localSource,
  downloadState: 'DOWNLOADED',
  downloadError: undefined,
};
const repairedAsset = media ? {
  ...media,
  localPath: localSource,
  status: 'downloaded' as const,
  updatedAt: Math.max(media.updatedAt, Date.now()),
} : null;

await store.upsert(repairedTask);
if (repairedAsset) await mediaStore.upsert(repairedAsset);
setTask(repairedTask);
setAsset(repairedAsset);
```

Use the verified `localSource`/repaired state for the player preference, `已下载` label, and `exportTaskVideo` input. Spread `getBuiltinArtifactDownloadPolicy(task.adapterId)` into the export options so only the no-local-file fallback can perform an allowlisted re-download.

Only show the success alert when `updated.exportState === 'EXPORTED'`; otherwise show `保存失败` with `updated.exportError` so a native export failure is not reported as success.

- [ ] **Step 7: Pass the same policy to task-screen manual actions**

For both retry handlers:

```ts
const artifactPolicy = getBuiltinArtifactDownloadPolicy(task.adapterId);
```

Pass `...artifactPolicy` into `downloadTask` or `exportTaskVideo` options. Do not add `autodl.art` literals to the UI layer.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```powershell
cd mobile
npm test -- --runInBand src/tasks/localMedia.test.ts src/tasks/media.test.ts src/workflows/providers/registry.test.ts src/route-tests/video-detail.test.tsx src/route-tests/tasks.test.tsx
```

Expected: all suites PASS; a verified local source bypasses remote validation, while a necessary re-download receives the exact adapter policy.

- [ ] **Step 9: Commit route/export convergence**

```powershell
git add mobile/src/workflows/providers/registry.ts mobile/src/workflows/providers/registry.test.ts mobile/app/video/[id].tsx mobile/app/(tabs)/tasks.tsx mobile/src/route-tests/video-detail.test.tsx mobile/src/route-tests/tasks.test.tsx
git commit -m "fix: export verified private videos to gallery"
```

### Task 6: Full verification and handoff update

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`

- [ ] **Step 1: Run TypeScript and the complete Jest suite**

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
```

Expected: TypeScript exits 0; every Jest suite passes with 0 failed tests.

- [ ] **Step 2: Check diff hygiene and ensure the user-owned file remains untouched**

```powershell
cd ..
git diff --check
git status --short
git diff -- local.properties
```

Expected: `git diff --check` exits 0; `local.properties` remains untracked and has no diff.

- [ ] **Step 3: Build and install the Android debug APK**

Use the repository's supported JDK 21 and connected emulator ABI:

```powershell
cd mobile/android
./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --console=plain
adb devices
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell cmd package resolve-activity --brief com.example.autodlh3
adb -s emulator-5554 shell am force-stop com.example.autodlh3
adb -s emulator-5554 shell am start -n com.example.autodlh3/.MainActivity
adb -s emulator-5554 logcat -b crash -d
```

Expected: Gradle `BUILD SUCCESSFUL`, install succeeds, `MainActivity` starts, and the crash buffer contains no app crash.

- [ ] **Step 4: Execute the Android regression flow**

On a configured device/emulator with valid AutoDL credentials:

1. submit two short jobs close together;
2. monitor until both enter terminal success in one polling interval;
3. confirm no `NativeDatabase` transaction/rollback error appears;
4. confirm both private downloads finish;
5. confirm detail shows `已下载` for each playable local video;
6. save one manually to `Movies/AutoDL-H3`;
7. enable automatic export and verify the other delivery;
8. confirm neither gallery action reports `域名不在允许列表` when the private file exists.

Capture `adb logcat` around the flow and retain screenshots of both detail/export results as release evidence.

- [ ] **Step 5: Update the handoff document with exact evidence**

Add a dated B hotfix section recording:

- the exclusive artifact transaction change;
- full Workflow synchronization plus media-owned projection protection;
- private-file recovery and consistent detail/export state;
- focused/full Jest counts, typecheck, Android build/install/start result;
- whether credentialed two-job and automatic/manual export acceptance passed;
- C/D remains blocked until any unexecuted device acceptance item is complete.

- [ ] **Step 6: Commit the verified handoff evidence**

```powershell
git add docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md
git commit -m "docs: record B media hotfix verification"
```

- [ ] **Step 7: Run the final completion gate from a clean code state**

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
cd ..
git diff --check
git status --short --branch
```

Expected: typecheck and all tests pass, diff check exits 0, only the intentional branch-ahead state and untracked user-owned `local.properties` remain.
