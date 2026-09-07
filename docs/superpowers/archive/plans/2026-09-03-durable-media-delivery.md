# Durable Media Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a restart-safe `STATUS_SYNC -> ARTIFACT_DOWNLOAD -> EXPORT` path so completed tasks promptly appear in the in-app gallery and, when enabled, the Android system gallery.

**Architecture:** Keep one executor tick as a single immutable due-operation snapshot, and add a bounded multi-pass cycle above it. Persist terminal artifacts in the same job-CAS transaction that creates download operations, materialize `media_assets` before byte transfer, commit CAS/task/media/export projections transactionally, and repair old incomplete projections with a bounded reconciliation pass.

**Tech Stack:** TypeScript 6.0, Jest 29, `node:sqlite` test database, Expo SQLite 57, Expo FileSystem 57, React Native 0.86, Android MediaStore native module.

**Spec:** `docs/superpowers/specs/2026-09-03-post-merge-stabilization-design.md`

---

## Execution Rules

- Implement in an isolated worktree created from commit `99891157` or a later reviewed `dev` head.
- Complete Tasks 1-8 in order. Every task follows RED -> GREEN -> focused regression -> commit.
- Do not bump `APP_SCHEMA_VERSION`; all required tables and columns already exist in v6.
- Preserve the single-snapshot behavior of `createExecutorTick`. Newly created operations run only in a later cycle pass.
- Never delete a CAS path directly from task or media removal. Release its reference first; only bounded CAS garbage collection may delete an unreferenced blob.
- Keep provider URLs, tokens, response bodies, and native exception details out of persisted user-facing errors.

## File Map

| Path | Responsibility |
|---|---|
| `mobile/src/workflows/executor/jobStateRepository.ts` | Revision-CAS job transition, artifact snapshot replacement, event, and next operations in one transaction |
| `mobile/src/workflows/executor/durableExecutor.ts` | Status mapping and terminal artifact/download-operation creation |
| `mobile/src/workflows/executor/tick.ts` | One immutable due-operation snapshot |
| `mobile/src/workflows/executor/cycle.ts` | New bounded multi-pass orchestration and aggregate summary |
| `mobile/src/media/materializer.ts` | Idempotent workflow-artifact to media-asset projection |
| `mobile/src/workflows/executor/artifactOperation.ts` | Download state projection, CAS commit, and durable export enqueue |
| `mobile/src/workflows/executor/exportOperation.ts` | New native system-gallery publication handler and transactional result commit |
| `mobile/src/media/reconciliation.ts` | New bounded repair of missing artifacts/assets/deliveries and stale local files |
| `mobile/src/media/repository.ts` | Stable export enum, atomic delivery projection, bounded repair queries |
| `mobile/src/media/types.ts` | Stable media delivery/export types |
| `mobile/src/media/cas.ts` | Bounded deletion entry point used only by CAS garbage collection |
| `mobile/src/tasks/repository.ts` | Task media projection queries and transaction-safe removal |
| `mobile/src/tasks/sync.ts` | Shared cycle wiring for foreground, background, and native service entries |
| `mobile/app/(tabs)/tasks.tsx` | Poll while durable work is due or scheduled, and display delivery failures |
| `mobile/src/workflows/executor/mediaDeliveryAcceptance.test.ts` | Real-SQLite full-chain regression |
| `docs/superpowers/verification/2026-09-03-post-merge-stabilization.md` | Automated and Android acceptance evidence |

## Task 1: Persist the terminal artifact snapshot atomically

**Files:**

- Modify: `mobile/src/workflows/executor/jobStateRepository.ts`
- Modify: `mobile/src/workflows/executor/jobStateRepository.test.ts`
- Modify: `mobile/src/workflows/executor/durableExecutor.ts`
- Modify: `mobile/src/workflows/executor/durableExecutor.test.ts`

- [ ] **Step 1: Add RED tests for artifact replacement and rollback**

Extend the real-SQLite repository tests with a successful terminal transition and an injected duplicate-artifact failure:

```typescript
test('replaces artifacts with the job transition, event, and next operation', () => {
  const result = jobs.transition({
    jobId: job.id,
    expectedRevision: job.revision,
    patch: { status: 'SUCCEEDED', updatedAt: 200 },
    artifacts: [{ id: 'video-1', jobId: job.id, kind: 'video', uri: 'https://cdn.test/video.mp4', mime: 'video/mp4' }],
    event: { id: 'status-done', type: 'STATUS_RECONCILED', payload: { status: 'SUCCEEDED' }, createdAt: 200 },
    nextOperations: [{ id: 'download-1', kind: 'ARTIFACT_DOWNLOAD', jobId: job.id, idempotencyKey: `artifact:${job.id}:video-1`, payload: {}, now: 200 }],
  });
  expect(result.ok).toBe(true);
  expect(db.getAllSync('SELECT id, kind, uri FROM workflow_artifacts WHERE job_id = ?', job.id)).toEqual([
    { id: 'video-1', kind: 'video', uri: 'https://cdn.test/video.mp4' },
  ]);
  expect(operations.get('download-1')).toMatchObject({ state: 'PENDING' });
});

test('rolls back job, event, artifacts, and operations together', () => {
  expect(() => jobs.transition({
    jobId: job.id,
    expectedRevision: job.revision,
    patch: { status: 'SUCCEEDED', updatedAt: 200 },
    artifacts: [
      { id: 'same', jobId: job.id, kind: 'video' },
      { id: 'same', jobId: job.id, kind: 'image' },
    ],
    event: { id: 'status-done', type: 'STATUS_RECONCILED', payload: {}, createdAt: 200 },
  })).toThrow();
  expect(jobs.get(job.id)).toMatchObject({ revision: 0, status: 'RUNNING' });
  expect(db.getAllSync('SELECT * FROM workflow_artifacts WHERE job_id = ?', job.id)).toEqual([]);
});
```

In `durableExecutor.test.ts`, strengthen `status reconciliation uses only the persisted handle...`:

```typescript
expect(value.db.getAllSync(
  'SELECT id, kind, uri FROM workflow_artifacts WHERE job_id = ?', queued.id,
)).toEqual([{ id: 'artifact-1', kind: 'video', uri: 'https://cdn.test/video' }]);
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/workflows/executor/jobStateRepository.test.ts src/workflows/executor/durableExecutor.test.ts
```

Expected: FAIL because `JobTransition` has no `artifacts` field and status reconciliation does not write `workflow_artifacts`.

- [ ] **Step 3: Add artifact snapshot replacement to the existing transaction**

Add the typed field and a transaction-local replacement helper:

```typescript
import type { ArtifactRecord, JobRecord, JobStatus, NormalizedError } from '../../jobs/types';

export type JobTransition = {
  jobId: string;
  expectedRevision: number;
  patch: Partial<Pick<JobRecord, 'status' | 'providerHandle' | 'lastError' | 'nextSyncAt' | 'remote' | 'error' | 'updatedAt' | 'startedAt' | 'executionDuration'>>;
  event: NewEvent;
  artifacts?: ArtifactRecord[];
  nextOperations?: EnqueueOperation[];
};

function replaceArtifacts(db: SQLiteDatabase, jobId: string, artifacts: ArtifactRecord[]): void {
  db.runSync('DELETE FROM workflow_artifacts WHERE job_id = ?', jobId);
  for (const artifact of artifacts) {
    db.runSync(
      'INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)',
      artifact.id, jobId, artifact.kind, artifact.uri ?? null, artifact.mime ?? null,
      artifact.metadata ? JSON.stringify(artifact.metadata) : null,
    );
  }
}
```

Inside `transition`, call `replaceArtifacts` only when `input.artifacts` is present, after the revision update succeeds and before inserting next operations. In `handleStatus`, pass `artifacts: mapped.artifacts` for `SUCCEEDED` and `PARTIAL_SUCCEEDED`; leave running snapshots unchanged.

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/workflows/executor/jobStateRepository.test.ts src/workflows/executor/durableExecutor.test.ts
git diff --check
git add src/workflows/executor/jobStateRepository.ts src/workflows/executor/jobStateRepository.test.ts src/workflows/executor/durableExecutor.ts src/workflows/executor/durableExecutor.test.ts
git commit -m "fix: persist terminal workflow artifacts"
```

Expected: both suites PASS and the commit contains only the four listed files.

## Task 2: Add the bounded executor cycle

**Files:**

- Create: `mobile/src/workflows/executor/cycle.ts`
- Create: `mobile/src/workflows/executor/cycle.test.ts`
- Modify: `mobile/src/workflows/executor/tick.ts`
- Modify: `mobile/src/workflows/executor/tick.test.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/tasks/sync.test.ts`

- [ ] **Step 1: Write RED cycle tests**

Use a fake single-pass tick whose first pass creates more due work:

```typescript
const summary = (patch: Partial<TickSummary> = {}): TickSummary => ({
  claimed: 0,
  succeeded: 0,
  retried: 0,
  failed: 0,
  blocked: 0,
  remainingDue: 0,
  remainingScheduled: 0,
  ...patch,
});

test('runs newly-created due work in later bounded passes', async () => {
  const runTick = jest.fn()
    .mockResolvedValueOnce(summary({ claimed: 1, succeeded: 1, remainingDue: 1, remainingScheduled: 0 }))
    .mockResolvedValueOnce(summary({ claimed: 1, succeeded: 1, remainingDue: 0, remainingScheduled: 0 }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });
  await expect(cycle.run({ reason: 'foreground', maxPasses: 4, maxOperationsTotal: 8 })).resolves.toMatchObject({
    passes: 2, claimed: 2, succeeded: 2, remainingDue: 0, budgetExhausted: false,
  });
});

test('stops at both budgets without draining indefinitely', async () => {
  const runTick = jest.fn(async () => summary({ claimed: 2, succeeded: 2, remainingDue: 3 }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });
  await expect(cycle.run({ reason: 'service', maxPasses: 2, maxOperationsTotal: 3 })).resolves.toMatchObject({
    passes: 2, claimed: 3, remainingDue: 3, budgetExhausted: true,
  });
  expect(runTick).toHaveBeenNthCalledWith(2, expect.objectContaining({ maxOperations: 1 }));
});

test('stops when a pass claims nothing even if another writer reports due work', async () => {
  const runTick = jest.fn(async () => summary({ claimed: 0, remainingDue: 1 }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });
  await cycle.run({ reason: 'background' });
  expect(runTick).toHaveBeenCalledTimes(1);
});
```

Also keep the existing tick assertion that `created-during-tick` is not handled in the same pass.

- [ ] **Step 2: Run cycle/tick tests and confirm RED**

Run:

```powershell
npm test -- --runInBand src/workflows/executor/tick.test.ts src/workflows/executor/cycle.test.ts src/tasks/sync.test.ts
```

Expected: FAIL because `cycle.ts`, `remainingScheduled`, and cycle summary fields do not exist.

- [ ] **Step 3: Extend summaries and implement cycle orchestration**

Use these contracts:

```typescript
export type TickSummary = {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  blocked: number;
  remainingDue: number;
  remainingScheduled: number;
};

export type CycleOptions = TickOptions & { maxPasses?: number; maxOperationsTotal?: number };
export type CycleSummary = TickSummary & { passes: number; budgetExhausted: boolean };
```

In `tick.ts`, count `PENDING` rows split by `nextRetryAt <= timestamp` and `nextRetryAt > timestamp`. In new `cycle.ts`, clamp defaults to four passes and eight total operations, call the tick with the remaining operation budget, add numeric fields, and stop when `claimed === 0`, `remainingDue === 0`, or either budget is exhausted. Coalesce overlapping cycle callers with one `inFlight` promise, matching the current tick behavior.

Wire `tasks/sync.ts` to call the cycle rather than the raw tick, and keep `SyncSummary.remaining` as `remainingDue + remainingScheduled` for compatibility.

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/workflows/executor/tick.test.ts src/workflows/executor/cycle.test.ts src/tasks/sync.test.ts
git diff --check
git add src/workflows/executor/tick.ts src/workflows/executor/tick.test.ts src/workflows/executor/cycle.ts src/workflows/executor/cycle.test.ts src/tasks/sync.ts src/tasks/sync.test.ts
git commit -m "fix: advance durable operations in bounded cycles"
```

Expected: three suites PASS; existing tick still defers newly created work within one pass.

## Task 3: Ensure media projection exists before transfer

**Files:**

- Modify: `mobile/src/media/materializer.ts`
- Modify: `mobile/src/media/materializer.test.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.test.ts`
- Modify: `mobile/src/tasks/sync.ts`

- [ ] **Step 1: Add RED tests for projection ordering and failure state**

Add this handler-order test:

```typescript
test('ensures the media row and marks downloading before opening the network stream', async () => {
  const order: string[] = [];
  await handleArtifactDownload(operation, 'worker', {
    ...setup(),
    ensureProjection: jest.fn(async () => { order.push('projection'); }),
    updateDownloadState: jest.fn(async (state) => { order.push(state); }),
    openDownload: jest.fn(async () => { order.push('network'); throw new Error('域名不在允许列表'); }),
    policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }),
  });
  expect(order.slice(0, 3)).toEqual(['projection', 'DOWNLOADING', 'network']);
});

test('writes a terminal failed projection when validation fails', async () => {
  const deps = setup();
  deps.openDownload.mockRejectedValueOnce(new Error('CAS hash mismatch'));
  const updateDownloadState = jest.fn();
  await handleArtifactDownload(operation, 'worker', {
    ...deps, updateDownloadState,
    ensureProjection: jest.fn(),
    policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }),
  });
  expect(updateDownloadState).toHaveBeenLastCalledWith('DOWNLOAD_FAILED', 'ARTIFACT_VALIDATION_FAILED');
});
```

Change the materializer test to expect the pre-download state `queued`, not `downloading`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm test -- --runInBand src/media/materializer.test.ts src/workflows/executor/artifactOperation.test.ts
```

Expected: FAIL because the handler has no `ensureProjection`/`updateDownloadState` dependencies and materialization currently writes `downloading` immediately.

- [ ] **Step 3: Add explicit projection hooks and wire them to SQLite stores**

Extend `ArtifactOperationDeps`:

```typescript
ensureProjection(jobId: string, artifact: ArtifactRecord): Promise<void>;
updateDownloadState(
  state: 'ENQUEUED' | 'DOWNLOADING' | 'DOWNLOAD_FAILED',
  errorCode?: string,
): Promise<void>;
```

Add `ensureProjection: jest.fn(async () => undefined)` and `updateDownloadState: jest.fn(async () => undefined)` to the existing `setup()` test dependencies so legacy success/retry/policy cases continue exercising the same handler boundary.

Call `ensureProjection`, then `updateDownloadState('DOWNLOADING')`, before `openArtifactDownload`. For retryable failures write `ENQUEUED`; for terminal failures write `DOWNLOAD_FAILED` with the normalized code before finishing the operation.

In `tasks/sync.ts`, implement `ensureProjection` by loading the job and task, then calling:

```typescript
await materializeJobArtifacts(job, [artifact], mediaStore, task);
```

Use `taskStore.updateMediaProjection` for task state and `mediaStore.get(`${jobId}:${artifact.id}`)` plus `upsertArtifactProjection` for asset state. Treat an update of zero task rows as `TASK_NOT_FOUND` instead of silently succeeding.

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/media/materializer.test.ts src/workflows/executor/artifactOperation.test.ts src/tasks/sync.test.ts
git diff --check
git add src/media/materializer.ts src/media/materializer.test.ts src/workflows/executor/artifactOperation.ts src/workflows/executor/artifactOperation.test.ts src/tasks/sync.ts
git commit -m "fix: materialize media before artifact transfer"
```

Expected: all three suites PASS and a missing `media_assets` row can no longer turn the artifact commit into an `UPDATE 0 rows` success.

## Task 4: Commit downloads and enqueue export atomically

**Files:**

- Modify: `mobile/src/workflows/executor/artifactOperation.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.test.ts`
- Modify: `mobile/src/media/types.ts`
- Modify: `mobile/src/media/repository.ts`
- Modify: `mobile/src/media/repository.test.ts`
- Modify: `mobile/src/gallery/presentation.ts`
- Modify: `mobile/src/gallery/presentation.test.ts`
- Modify: `mobile/src/media/GalleryCard.tsx`
- Create: `mobile/src/media/GalleryCard.test.tsx`
- Modify: `mobile/src/tasks/sync.ts`

- [ ] **Step 1: Add RED tests for durable export policy and stable enums**

Create a claimed artifact operation and existing task/asset rows, then assert:

```typescript
commit({
  operationId: 'download-1', owner: 'worker', jobId: 'job-1', artifact,
  blob, localUri: 'file:///cas/video', now: 50,
  deliveryPolicy: { autoExportToGallery: true, keepPrivateCopy: false },
});

expect(operations.list('EXPORT')).toMatchObject([{
  idempotencyKey: 'export:job-1:video-1:system-gallery',
  payload: {
    assetId: 'job-1:video-1', artifactId: 'video-1', sourceUri: 'file:///cas/video',
    blobSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    keepPrivateCopy: false, displayName: 'job-1.mp4',
  },
}]);
expect(taskStore.get('job-1')).resolves.toMatchObject({ downloadState: 'DOWNLOADED', exportState: 'QUEUED' });
expect(mediaStore.get('job-1:video-1')).resolves.toMatchObject({ status: 'downloaded', exportStatus: 'QUEUED' });
```

Repeat with `autoExportToGallery: false` and assert no export operation and task `exportState: 'NOT_REQUESTED'`. Update repository tests so `MediaAsset.exportStatus` accepts only `NOT_REQUESTED | QUEUED | EXPORTING | EXPORTED | EXPORT_FAILED`. Add a GalleryCard assertion that stored `EXPORTED` renders as `已保存到相册`, never as the raw enum.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm test -- --runInBand src/workflows/executor/artifactOperation.test.ts src/media/repository.test.ts
```

Expected: FAIL because artifact commit has no delivery policy, does not enqueue `EXPORT`, and the repository stores Chinese presentation text.

- [ ] **Step 3: Add stable export types and transactional enqueue**

Define:

```typescript
export type MediaExportStatus = 'NOT_REQUESTED' | 'QUEUED' | 'EXPORTING' | 'EXPORTED' | 'EXPORT_FAILED';

export interface MediaAsset {
  // existing fields
  exportStatus?: MediaExportStatus;
}
```

Extend `ArtifactCommitInput` with:

```typescript
deliveryPolicy: { autoExportToGallery: boolean; keepPrivateCopy: boolean };
```

Inside `createSqliteArtifactCommitter` verify the media update changes exactly one row, update task download fields, and for video artifacts with auto-export enabled insert this idempotent operation in the same transaction:

```typescript
const assetId = `${input.jobId}:${input.artifact.id}`;
const exportId = `${input.jobId}:export:${input.artifact.id}:system-gallery`;
db.runSync(
  "INSERT OR IGNORE INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,'EXPORT',?,?,?,'PENDING',0,?,?,?)",
  exportId, input.jobId, `export:${input.jobId}:${input.artifact.id}:system-gallery`,
  JSON.stringify({
    assetId, artifactId: input.artifact.id, sourceUri: input.localUri,
    blobSha256: input.blob.sha256, keepPrivateCopy: input.deliveryPolicy.keepPrivateCopy,
    displayName: `${input.jobId}.mp4`,
  }),
  input.now, input.now, input.now,
);
```

Write `QUEUED` to both task and asset export projections. Pass the settings read for the current handler invocation into the commit; do not re-read settings inside the SQLite transaction.

Change `upsertDelivery` so it writes the stable enum and wraps delivery plus asset projection in one SQLite transaction.

Add presentation-only translation and consume it from `GalleryCard`:

```typescript
export function mediaExportStatusLabel(status?: MediaExportStatus): string {
  if (status === 'EXPORTED') return '已保存到相册';
  if (status === 'EXPORTING' || status === 'QUEUED') return '正在保存到相册';
  if (status === 'EXPORT_FAILED') return '保存到相册失败';
  return '';
}

const publication = mediaExportStatusLabel(asset.exportStatus);
// GalleryCard metadata:
`${asset.durationMs ? `${Math.round(asset.durationMs / 1000)}s` : '—'} · ${publication || mediaStatusLabel(asset.status)}`
```

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/workflows/executor/artifactOperation.test.ts src/media/repository.test.ts src/gallery/presentation.test.ts src/media/GalleryCard.test.tsx src/tasks/sync.test.ts
git diff --check
git add src/workflows/executor/artifactOperation.ts src/workflows/executor/artifactOperation.test.ts src/media/types.ts src/media/repository.ts src/media/repository.test.ts src/gallery/presentation.ts src/gallery/presentation.test.ts src/media/GalleryCard.tsx src/media/GalleryCard.test.tsx src/tasks/sync.ts
git commit -m "fix: enqueue durable media exports"
```

Expected: all suites PASS; Chinese export labels remain generated only by `mobile/src/gallery/presentation.ts`.

## Task 5: Implement the durable EXPORT handler

**Files:**

- Create: `mobile/src/workflows/executor/exportOperation.ts`
- Create: `mobile/src/workflows/executor/exportOperation.test.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/media/casRepository.ts`
- Modify: `mobile/src/media/casRepository.test.ts`

- [ ] **Step 1: Write RED export handler tests**

Cover success, idempotent replay, private-copy release, missing source, transient native failure, and terminal native failure:

```typescript
const operation: WorkflowOperation = {
  id: 'export-1', kind: 'EXPORT', jobId: 'job-1',
  idempotencyKey: 'export:job-1:video-1:system-gallery',
  payload: {
    assetId: 'job-1:video-1', artifactId: 'video-1', sourceUri: 'file:///cas/video',
    blobSha256: 'a'.repeat(64), keepPrivateCopy: true, displayName: 'job-1.mp4',
  },
  state: 'CLAIMED', attempt: 1, nextRetryAt: 1,
  leaseOwner: 'worker', leaseExpiresAt: 100, createdAt: 1, updatedAt: 1,
};

function setupExport() {
  return {
    now: () => 50,
    assertSource: jest.fn(async () => undefined),
    markExporting: jest.fn(async () => undefined),
    publish: jest.fn(async () => ({ uri: 'content://media/external/video/7' })),
    commitSuccess: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    finishFailure: jest.fn(async () => undefined),
  };
}

test('publishes with a stable name and commits all delivery projections', async () => {
  const deps = setupExport();
  await handleExport(operation, 'worker', deps);
  expect(deps.publish).toHaveBeenCalledWith('file:///cas/video', {
    mediaId: 'job-1:video-1', displayName: 'job-1.mp4',
  });
  expect(deps.commitSuccess).toHaveBeenCalledWith(expect.objectContaining({
    galleryUri: 'content://media/external/video/7', keepPrivateCopy: true,
  }));
});

test('releases only the matching blob reference when private copy is disabled', async () => {
  const deps = setupExport();
  await handleExport({ ...operation, payload: { ...operation.payload, keepPrivateCopy: false } }, 'worker', deps);
  expect(deps.commitSuccess).toHaveBeenCalledWith(expect.objectContaining({
    blobSha256: 'a'.repeat(64), referenceOwnerId: 'job-1:video-1', keepPrivateCopy: false,
  }));
});
```

The real-SQLite committer test must assert one transaction writes `media_deliveries.EXPORTED`, `media_assets.export_status='EXPORTED'`, task `EXPORTED`, operation `SUCCEEDED`, and conditionally deletes only the matching `artifact_blob_refs` row.

- [ ] **Step 2: Run the new suite and confirm RED**

Run:

```powershell
npm test -- --runInBand src/workflows/executor/exportOperation.test.ts src/media/casRepository.test.ts
```

Expected: FAIL because `exportOperation.ts` and reference lookup helpers do not exist.

- [ ] **Step 3: Implement parsing, native publication, retry, and commit**

Use this payload contract:

```typescript
export type ExportPayload = {
  assetId: string;
  artifactId: string;
  sourceUri: string;
  blobSha256: string;
  keepPrivateCopy: boolean;
  displayName: string;
};
```

The handler sequence is exact:

```typescript
await deps.assertSource(payload.sourceUri);
await deps.markExporting(operation, owner, payload, timestamp);
const result = await deps.publish(payload.sourceUri, {
  mediaId: payload.assetId,
  displayName: payload.displayName,
});
await deps.commitSuccess({
  operationId: operation.id,
  owner,
  jobId: operation.jobId,
  ...payload,
  galleryUri: result.uri,
  referenceOwnerId: `${operation.jobId}:${payload.artifactId}`,
  now: deps.now(),
});
```

Persist only `EXPORT_SOURCE_MISSING`, `EXPORT_NATIVE_RETRY`, or `EXPORT_NATIVE_FAILED`. Retry transient I/O/native availability errors with the existing capped exponential backoff; mark missing source and permission/validation errors terminal. `commitSuccess` owns operation completion so an owner mismatch rolls back all projections.

For `keepPrivateCopy=false`, the success transaction clears `tasks.local_uri`, clears `media_assets.local_path`, changes asset status to `queued`, and deletes the matching blob reference. It must not call `FileSystem.deleteAsync`.

Wire `tasks/sync.ts` to route `EXPORT` to this handler and keep SUBMIT/STATUS routing in `durableExecutor`.

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/workflows/executor/exportOperation.test.ts src/media/casRepository.test.ts src/tasks/sync.test.ts
git diff --check
git add src/workflows/executor/exportOperation.ts src/workflows/executor/exportOperation.test.ts src/media/casRepository.ts src/media/casRepository.test.ts src/tasks/sync.ts
git commit -m "fix: execute durable system gallery exports"
```

Expected: all suites PASS and a replay after native success uses the same `mediaId`/`displayName`.

## Task 6: Add bounded media reconciliation and safe CAS cleanup

**Files:**

- Create: `mobile/src/media/reconciliation.ts`
- Create: `mobile/src/media/reconciliation.test.ts`
- Modify: `mobile/src/media/cas.ts`
- Modify: `mobile/src/media/cas.test.ts`
- Modify: `mobile/src/media/repository.ts`
- Modify: `mobile/src/media/repository.test.ts`
- Modify: `mobile/src/tasks/repository.ts`
- Modify: `mobile/src/tasks/repository.test.ts`
- Modify: `mobile/src/tasks/sync.ts`

- [ ] **Step 1: Add RED reconciliation and transaction tests**

Build five real-SQLite fixtures. Use this exact seed helper and first repair assertion, then repeat the same two-call idempotency assertion for the other four rows in the table below:

```typescript
async function seedCompletedTask(db: ReturnType<typeof createInitializedRealSqliteTestDb>, id: string): Promise<void> {
  await createTaskRepository(db as never).upsert({
    id, prompt: 'repair me', status: 'SUCCESS', resolution: '768p竖', duration: 5,
    videoUrl: `https://cdn.test/${id}.mp4`, createdAt: 1, updatedAt: 2,
  });
  db.runSync(
    "INSERT INTO workflow_jobs (id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES (?,0,'h3','1','hash','demo','1','{}','SUCCEEDED',1,2)",
    id,
  );
}

test('materializes an artifact that has no media asset idempotently', async () => {
  const db = createInitializedRealSqliteTestDb();
  await seedCompletedTask(db, 'job-1');
  db.runSync(
    "INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime) VALUES ('video-1','job-1','video','https://cdn.test/video.mp4','video/mp4')",
  );
  const deps = {
    db: db as never,
    fileExists: jest.fn(async () => true),
    removeCasPath: jest.fn(async () => undefined),
    now: () => 100,
  };
  const first = await reconcileMediaState({ ...deps, limit: 8 });
  const second = await reconcileMediaState({ ...deps, limit: 8 });
  expect(first.repaired).toBe(1);
  expect(second.repaired).toBe(0);
  expect(db.getFirstSync("SELECT id FROM media_assets WHERE id='job-1:video-1'"))
    .toEqual({ id: 'job-1:video-1' });
  db.close();
});

test('never scans more than the supplied limit', async () => {
  const db = createInitializedRealSqliteTestDb();
  for (let index = 0; index < 20; index += 1) {
    const id = `job-${index}`;
    await seedCompletedTask(db, id);
    db.runSync(
      'INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime) VALUES (?,?,?,?,?)',
      'video-1', id, 'video', `https://cdn.test/${id}.mp4`, 'video/mp4',
    );
  }
  await expect(reconcileMediaState({
    db: db as never, limit: 4, fileExists: async () => true,
    removeCasPath: async () => undefined, now: () => 100,
  })).resolves.toMatchObject({ scanned: 4 });
  db.close();
});
```

| Fixture | Seed | Required assertion after the first call |
|---|---|---|
| operation payload without artifact | One succeeded `ARTIFACT_DOWNLOAD` row whose `payload_json.artifact.jobId` matches `job_id` | `workflow_artifacts` and `media_assets` each contain the recovered artifact |
| task local URI without asset | Completed task with `local_uri='file:///cas/video'` and no asset | Primary video asset exists with the same local path and `downloaded` status |
| exported task without delivery | Task with `export_state='EXPORTED'` and `gallery_uri='content://media/7'` | One stable `system-gallery` delivery exists with `EXPORTED` status |
| stale downloaded projection | Task and asset claim `file:///missing.mp4`; injected `fileExists` returns false | Both local paths are null and states are `IDLE/queued` because a remote URL exists |

Add repository tests proving `remove(taskId)` rolls back all table deletes on an injected failure and never directly deletes a `cas/sha256/...` file. Add a CAS test proving garbage collection deletes only metadata that is still unreferenced after file removal.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm test -- --runInBand src/media/reconciliation.test.ts src/media/cas.test.ts src/media/repository.test.ts src/tasks/repository.test.ts
```

Expected: FAIL because the bounded reconciliation entry point and transaction-safe removal path do not exist.

- [ ] **Step 3: Implement a cursor-bounded reconciliation pass**

Export this contract:

```typescript
export type ReconciliationSummary = {
  scanned: number;
  repaired: number;
  staleFiles: number;
  garbageDeleted: number;
  garbageFailed: number;
};

export async function reconcileMediaState(options: {
  db: SQLiteDatabase;
  limit?: number;
  fileExists(uri: string): Promise<boolean>;
  removeCasPath(relativePath: string): Promise<void>;
  now?: () => number;
}): Promise<ReconciliationSummary>;
```

Clamp `limit` to `1..32`. Select candidates in stable `updated_at, id` order and use `INSERT ... ON CONFLICT` for repairs. Recover a missing artifact only from a valid `ARTIFACT_DOWNLOAD.payload_json.artifact` with matching `job_id`; ignore malformed payloads. A missing file clears task/asset local paths and changes states to `IDLE/queued` when a remote URL exists, otherwise `DOWNLOAD_FAILED/failed`.

After repairs, call `collectGarbage` with at most the same limit. Export a narrow `removeCasPath(relativePath)` wrapper from `cas.ts`; do not expose the full internal file adapter.

Wrap task removal and delivery upsert multi-table writes in the repository transaction helper. Task removal must delete blob references by the captured `(sha256, owner_type, owner_id)` mapping before deleting artifacts, and leave physical deletion to reconciliation GC.

- [ ] **Step 4: Wire one repair pass after each cycle and commit**

In `createSyncTaskRunner`, call task projection repair first, then `reconcileMediaState`, then list tasks. Add its counts to `SyncSummary` without changing callers that only read `updated/failed/skipped/remaining`.

Run:

```powershell
npm test -- --runInBand src/media/reconciliation.test.ts src/media/cas.test.ts src/media/repository.test.ts src/tasks/repository.test.ts src/tasks/sync.test.ts
git diff --check
git add src/media/reconciliation.ts src/media/reconciliation.test.ts src/media/cas.ts src/media/cas.test.ts src/media/repository.ts src/media/repository.test.ts src/tasks/repository.ts src/tasks/repository.test.ts src/tasks/sync.ts src/tasks/sync.test.ts
git commit -m "fix: reconcile incomplete media deliveries"
```

Expected: all five suites PASS; repeated reconciliation produces no additional rows or operations.

## Task 7: Keep task monitoring alive for durable work

**Files:**

- Modify: `mobile/app/(tabs)/tasks.tsx`
- Modify: `mobile/src/route-tests/tasks.test.tsx`
- Modify: `mobile/src/tasks/sync.ts`

- [ ] **Step 1: Add a RED route test for terminal tasks with pending operations**

Mock `syncTaskRun` rather than only `syncTasks`:

```typescript
test('continues polling after task success while durable delivery is scheduled', async () => {
  jest.useFakeTimers();
  jest.mocked(syncTaskRun).mockResolvedValue({
    tasks: [{ id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 2 }],
    summary: { remaining: 1, operations: { remainingDue: 0, remainingScheduled: 1, budgetExhausted: false } },
  } as never);
  await act(async () => { create(<TasksScreen />); });
  const calls = jest.mocked(syncTaskRun).mock.calls.length;
  await act(async () => { jest.advanceTimersByTimeAsync(10_000); });
  expect(jest.mocked(syncTaskRun).mock.calls.length).toBe(calls + 1);
});
```

Keep the existing terminal/no-pending test and change it to return zero operation work.

- [ ] **Step 2: Run the route test and confirm RED**

Run:

```powershell
npm test -- --runInBand src/route-tests/tasks.test.tsx
```

Expected: FAIL because the screen discards the sync summary and bases polling only on remote task status.

- [ ] **Step 3: Make polling depend on task or operation activity**

Change the screen load path to `syncTaskRun('foreground')`, store this boolean, and use it with active task state:

```typescript
const operationActive =
  result.summary.operations.remainingDue > 0 ||
  result.summary.operations.remainingScheduled > 0 ||
  result.summary.operations.budgetExhausted;
setHasPendingOperations(operationActive);

const shouldPoll = hasActiveTasks || hasPendingOperations;
useEffect(() => {
  if (!shouldPoll) return;
  const timer = setInterval(() => void load(), 10_000);
  return () => clearInterval(timer);
}, [load, shouldPoll]);
```

Preserve `syncTasks()` as a compatibility facade for callers that only need the active task list.

- [ ] **Step 4: Run route and entrypoint regressions and commit**

Run:

```powershell
npm test -- --runInBand src/route-tests/tasks.test.tsx src/tasks/sync.test.ts src/native/taskMonitor.test.ts src/route-tests/root-layout.test.tsx
git diff --check
git add 'app/(tabs)/tasks.tsx' src/route-tests/tasks.test.tsx src/tasks/sync.ts
git commit -m "fix: monitor pending media delivery operations"
```

Expected: all listed suites PASS; a terminal task with no pending operation still stops polling.

## Task 8: Prove the full chain and record Android evidence

**Files:**

- Create: `mobile/src/workflows/executor/mediaDeliveryAcceptance.test.ts`
- Create: `docs/superpowers/verification/2026-09-03-post-merge-stabilization.md`

- [ ] **Step 1: Write the full-chain real-SQLite test**

Construct real job/operation/task/media repositories with a fake adapter, fake byte stream, and fake native publisher. Drive the cycle until idle:

```typescript
const summary = await cycle.run({ reason: 'foreground', maxPasses: 4, maxOperationsTotal: 8, now: 100 });
expect(summary).toMatchObject({ passes: 4, remainingDue: 0, budgetExhausted: false });
expect(jobs.get(job.id)).toMatchObject({ status: 'SUCCEEDED' });
expect(db.getAllSync('SELECT id FROM workflow_artifacts WHERE job_id = ?', job.id)).toHaveLength(1);
expect(await mediaStore.get(`${job.id}:video-1`)).toMatchObject({ status: 'downloaded', exportStatus: 'EXPORTED' });
expect(await taskStore.get(job.id)).toMatchObject({
  videoUrl: 'https://cdn.test/video.mp4', downloadState: 'DOWNLOADED', exportState: 'EXPORTED',
  galleryUri: 'content://media/external/video/7',
});
expect(db.getAllSync('SELECT * FROM media_deliveries')).toHaveLength(1);
expect(publish).toHaveBeenCalledTimes(1);
```

Run a second cycle, close/reopen the database, run again, and assert row counts and native publication remain one. Add policy variants for auto-export off and `keepPrivateCopy=false`.

- [ ] **Step 2: Run all media automation gates**

Run:

```powershell
cd mobile
npm test -- --runInBand src/workflows/executor/mediaDeliveryAcceptance.test.ts src/workflows/executor/tick.test.ts src/workflows/executor/cycle.test.ts src/workflows/executor/durableExecutor.test.ts src/workflows/executor/artifactOperation.test.ts src/workflows/executor/exportOperation.test.ts src/media/materializer.test.ts src/media/reconciliation.test.ts src/media/catalog.test.ts src/media/repository.test.ts src/media/cas.test.ts src/media/casRepository.test.ts src/tasks/sync.test.ts src/tasks/repository.test.ts src/route-tests/tasks.test.tsx src/route-tests/gallery.test.tsx
npm run typecheck
npm test -- --runInBand
git diff --check
```

Expected: every command exits 0; no `--forceExit`, skipped suite, open-handle warning, or schema-version change.

- [ ] **Step 3: Run Android emulator acceptance**

Record timestamped results in the verification document for:

1. Auto-export on + keep private on: terminal status starts download without manual refresh; the same video appears in task details, result gallery, and `Movies/AutoDL-H3`.
2. Auto-export off: result gallery contains the playable app-private video; the system gallery receives no new item.
3. Auto-export on + keep private off: system gallery video remains playable; task and media rows no longer claim an app-private path; a later bounded GC removes the unreferenced CAS blob.
4. Force-stop after download commit and before export database commit: relaunch resumes export and does not duplicate the MediaStore item.
5. Seed one affected pre-fix row with a missing asset or delivery: opening the app repairs it without clearing app data.

- [ ] **Step 4: Commit verification evidence**

Run:

```powershell
git add src/workflows/executor/mediaDeliveryAcceptance.test.ts ../docs/superpowers/verification/2026-09-03-post-merge-stabilization.md
git commit -m "test: verify durable media delivery recovery"
git status --short
```

Expected: commit succeeds and `git status --short` is empty.
