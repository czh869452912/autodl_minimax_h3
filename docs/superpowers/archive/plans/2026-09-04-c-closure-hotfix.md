# C-Closure 1.4.9 Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish v1.4.9 with one durable, restart-safe path for automatic and manual artifact download/export, close the remaining C-stage device gates, and leave schema v6 as the clean D-Core baseline.

**Architecture:** Add a SQLite-backed media command service that atomically appends manual `ARTIFACT_DOWNLOAD`/`EXPORT` operations and queued projections. Extend the existing handlers with frozen delivery intent, legacy-source export compatibility, and structured errors; UI routes only request commands and observe persisted state. Keep `APP_SCHEMA_VERSION=6`, preserve terminal operation audit rows, and start D-Core v7 only after this release is merged and tagged.

**Tech Stack:** TypeScript 6, Jest 29, `node:sqlite`, Expo SQLite/FileSystem, React Native 0.86.3, Android MediaStore/Kotlin, Gradle, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-c-closure-hotfix-design.md`

---

## Execution preconditions

- Execute in a dedicated `codex/c-closure-hotfix` worktree created from commit `2f7a9ae4` or its reviewed descendant on `dev`.
- Do not stage the existing untracked `docs/superpowers/reviews/2026-09-04-c-core-stage-review.md`, `local.properties`, or `mobile/.expo/` unless the user separately assigns them.
- Keep `mobile/src/storage/schema.ts` at schema version 6 throughout this plan.
- Use RED -> GREEN -> refactor for each task and make only the listed commit after its focused tests and typecheck pass.
- Run commands from the repository root unless a step explicitly starts with `cd mobile`.

## File responsibility map

**Create**

- `mobile/src/workflows/executor/artifactErrors.ts` — stable artifact/download error codes and retryability.
- `mobile/src/workflows/executor/mediaCommandService.ts` — transactional manual download/export decisions and operation creation.
- `mobile/src/workflows/executor/mediaCommandService.test.ts` — real-SQLite command idempotency, retry generation, projection, and legacy compatibility.
- `mobile/src/workflows/executor/manualMediaAcceptance.test.ts` — automatic/manual race, recovery, deletion, CAS, and delivery acceptance.
- `mobile/src/route-tests/media-route-ownership.test.ts` — static production-route ownership guard.
- `docs/superpowers/verification/2026-09-04-c-closure-hotfix.md` — automated, Android, upgrade, and carried stabilization evidence.

**Modify**

- `mobile/src/security/urlPolicy.ts` and `.test.ts` — expose structured URL policy failures without weakening current validation.
- `mobile/src/tasks/downloadPolicy.ts` and `.test.ts` — throw structured transfer failures; remove the test-only redirect helper.
- `mobile/src/workflows/executor/artifactOperation.ts` and `.test.ts` — consume structured errors and honor frozen delivery intent.
- `mobile/src/workflows/executor/exportOperation.ts` and `.test.ts` — accept CAS or explicitly marked legacy sources.
- `mobile/src/tasks/sync.ts` and `.test.ts` — instantiate/export media commands and kick the bounded cycle.
- `mobile/app/(tabs)/tasks.tsx`, `mobile/app/video/[id].tsx`, and route tests — request durable commands and stop direct projection/media writes.
- `mobile/src/workflows/executor/mediaDeliveryAcceptance.test.ts` — cover frozen policy and singleton delivery through the shared handlers.
- `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/android/app/build.gradle` — v1.4.9/versionCode 19.
- `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md` — record C closure and the exact D baseline.

**Delete after replacement coverage passes**

- `mobile/src/tasks/media.ts`, `mobile/src/tasks/media.test.ts`
- `mobile/src/tasks/coordinator.ts`, `mobile/src/tasks/coordinator.test.ts`
- `mobile/src/tasks/mediaQueue.ts`, `mobile/src/tasks/mediaQueue.test.ts`

---

### Task 1: Structured URL and artifact transfer errors

**Files:**
- Create: `mobile/src/workflows/executor/artifactErrors.ts`
- Modify: `mobile/src/security/urlPolicy.ts`
- Modify: `mobile/src/security/urlPolicy.test.ts`
- Modify: `mobile/src/tasks/downloadPolicy.ts`
- Modify: `mobile/src/tasks/downloadPolicy.test.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.test.ts`

- [ ] **Step 1: Write failing tests for stable codes and dispositions**

Add assertions that inspect codes rather than localized messages:

```ts
await expect(openArtifactDownload(url, { ...options, connectTimeoutMs: 10 }))
  .rejects.toMatchObject({ code: 'ARTIFACT_CONNECT_TIMEOUT', retryable: true });

await expect(readAll(opened.stream))
  .rejects.toMatchObject({ code: 'ARTIFACT_IDLE_TIMEOUT', retryable: true });

expect(() => validateArtifactUrl('http://node.example/video.mp4', ['node.example']))
  .toThrow(expect.objectContaining({ code: 'ARTIFACT_HTTPS_REQUIRED', retryable: false }));

expect(() => validateArtifactUrl('https://127.0.0.1/video.mp4', [], true))
  .toThrow(expect.objectContaining({ code: 'ARTIFACT_PRIVATE_NETWORK', retryable: false }));
```

In `artifactOperation.test.ts`, throw structured failures from `openDownload` and require retry only for transient codes:

```ts
await handleArtifactDownload(operation, 'owner', depsWithFailure(
  new ArtifactOperationError('ARTIFACT_CONNECT_TIMEOUT', 'connect timeout', true),
));
expect(operations.retry).toHaveBeenCalledWith(
  operation.id,
  'owner',
  expect.objectContaining({ error: expect.objectContaining({ code: 'ARTIFACT_CONNECT_TIMEOUT' }) }),
);

await handleArtifactDownload(operation, 'owner', depsWithFailure(
  new ArtifactOperationError('ARTIFACT_MIME_REJECTED', 'bad mime', false),
));
expect(operations.finish).toHaveBeenCalledWith(
  operation.id, 'owner', 'FAILED', expect.any(Number),
  expect.objectContaining({ code: 'ARTIFACT_MIME_REJECTED' }),
);
```

- [ ] **Step 2: Run focused tests and record RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/security/urlPolicy.test.ts src/tasks/downloadPolicy.test.ts src/workflows/executor/artifactOperation.test.ts
```

Expected: exit non-zero because `ArtifactOperationError` and the stable codes do not exist yet. Record the failing test names, then continue.

- [ ] **Step 3: Add the shared structured error type**

Create `artifactErrors.ts` with this public contract:

```ts
export type ArtifactErrorCode =
  | 'ARTIFACT_POLICY_MISSING'
  | 'ARTIFACT_URL_INVALID'
  | 'ARTIFACT_HTTPS_REQUIRED'
  | 'ARTIFACT_URL_CREDENTIALS'
  | 'ARTIFACT_PRIVATE_NETWORK'
  | 'ARTIFACT_HOST_DENIED'
  | 'ARTIFACT_REDIRECT_INVALID'
  | 'ARTIFACT_REDIRECT_LIMIT'
  | 'ARTIFACT_CONNECT_TIMEOUT'
  | 'ARTIFACT_IDLE_TIMEOUT'
  | 'ARTIFACT_NETWORK'
  | 'ARTIFACT_HTTP_RETRYABLE'
  | 'ARTIFACT_HTTP_REJECTED'
  | 'ARTIFACT_MIME_REJECTED'
  | 'ARTIFACT_SIZE_REJECTED'
  | 'ARTIFACT_INTEGRITY_FAILED'
  | 'ARTIFACT_CAS_BUSY'
  | 'ARTIFACT_INPUT_INVALID';

export class ArtifactOperationError extends Error {
  constructor(
    readonly code: ArtifactErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ArtifactOperationError';
  }
}

export function artifactError(cause: unknown): ArtifactOperationError {
  if (cause instanceof ArtifactOperationError) return cause;
  return new ArtifactOperationError(
    'ARTIFACT_NETWORK',
    'Artifact transfer failed.',
    true,
    { cause },
  );
}
```

Do not persist the original cause or a signed URL. `artifactError` is the last-resort normalization for an unknown fetch/stream exception.

- [ ] **Step 4: Make URL and download policy throw stable errors at the source**

Give `urlPolicy.ts` a `UrlPolicyError` with codes `URL_INVALID`, `HTTPS_REQUIRED`, `URL_CREDENTIALS`, `PRIVATE_NETWORK`, and `HOST_DENIED`. Throw it at each existing validation branch while preserving the current Chinese message.

In `downloadPolicy.ts`, translate URL errors once in `validateArtifactUrl`, and replace every generic transport/policy throw using this mapping:

| Condition | Code | Retryable |
|---|---|---|
| missing provider policy | `ARTIFACT_POLICY_MISSING` | false |
| malformed/unsafe URL | mapped URL code | false |
| redirect missing/limit | `ARTIFACT_REDIRECT_INVALID` / `ARTIFACT_REDIRECT_LIMIT` | false |
| connect/idle timeout | corresponding timeout code | true |
| fetch/network exception | `ARTIFACT_NETWORK` | true |
| HTTP 408, 429, or 5xx | `ARTIFACT_HTTP_RETRYABLE` | true |
| other non-2xx | `ARTIFACT_HTTP_REJECTED` | false |
| MIME/size/incomplete body | MIME, size, or integrity code | false |

Keep `fetch(current, { method: 'GET', redirect: 'manual', signal })` free of authorization headers and cookies. Delete `resolveArtifactRedirects`; its redirect assertions must call `openArtifactDownload`/`downloadArtifact` so tests exercise the production fetch path.

- [ ] **Step 5: Replace artifact-handler message matching**

Replace the regex branch in `artifactOperation.ts` with structured normalization:

```ts
const failure = artifactError(cause);
const normalizedError: NormalizedError = {
  code: failure.code,
  message: failure.retryable
    ? 'Artifact transfer will be retried.'
    : 'Artifact transfer failed policy or integrity validation.',
  retryable: failure.retryable,
};
if (failure.retryable) {
  const nextRetryAt = timestamp + Math.min(60_000, 1_000 * (2 ** Math.max(0, operation.attempt - 1)));
  await deps.updateDownloadState('ENQUEUED', failure.code);
  deps.operations.retry(operation.id, owner, { now: timestamp, nextRetryAt, error: normalizedError });
  return;
}
await deps.updateDownloadState('DOWNLOAD_FAILED', failure.code);
deps.operations.finish(operation.id, owner, 'FAILED', timestamp, normalizedError);
```

Change the CAS-GC fence to throw `ARTIFACT_CAS_BUSY` with `retryable=true`; map known CAS hash/size/empty errors to `ARTIFACT_INTEGRITY_FAILED` without message regexes.

- [ ] **Step 6: Verify focused GREEN and type safety**

Run:

```powershell
cd mobile
npm test -- --runInBand src/security/urlPolicy.test.ts src/tasks/downloadPolicy.test.ts src/workflows/executor/artifactOperation.test.ts
npm run typecheck
```

Expected: all selected suites pass and TypeScript exits 0. Existing dynamic public HTTPS-node tests must remain green.

- [ ] **Step 7: Commit structured errors**

```powershell
git add -- mobile/src/workflows/executor/artifactErrors.ts mobile/src/security/urlPolicy.ts mobile/src/security/urlPolicy.test.ts mobile/src/tasks/downloadPolicy.ts mobile/src/tasks/downloadPolicy.test.ts mobile/src/workflows/executor/artifactOperation.ts mobile/src/workflows/executor/artifactOperation.test.ts
git commit -m "fix: classify artifact failures by stable code"
```

### Task 2: Freeze delivery intent and support durable legacy export

**Files:**
- Modify: `mobile/src/workflows/executor/artifactOperation.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.test.ts`
- Modify: `mobile/src/workflows/executor/exportOperation.ts`
- Modify: `mobile/src/workflows/executor/exportOperation.test.ts`
- Modify: `mobile/src/workflows/executor/mediaDeliveryAcceptance.test.ts`

- [ ] **Step 1: Add failing payload and handler tests**

Cover these exact contracts:

```ts
export type SystemGalleryIntent = {
  target: 'system-gallery';
  keepPrivateCopy: boolean;
};

export type ArtifactDownloadPayload = {
  artifact: ArtifactRecord;
  deliveryIntent?: SystemGalleryIntent;
};

export type ExportPayload = {
  assetId: string;
  artifactId: string;
  sourceUri: string;
  sourceKind: 'cas' | 'legacy';
  blobSha256?: string;
  keepPrivateCopy: boolean;
  displayName: string;
};
```

Tests must prove:

- manual `deliveryIntent` enqueues export even when global `autoExportToGallery=false`;
- payload `keepPrivateCopy` wins if settings change before execution;
- automatic download still derives intent from current automatic delivery policy when no explicit intent exists;
- `sourceKind='cas'` requires a 64-character lowercase SHA-256;
- `sourceKind='legacy'` requires no blob hash and never deletes an `artifact_blob_refs` row;
- identical deterministic display names make native replay return the existing MediaStore item and commit one delivery row.

- [ ] **Step 2: Run focused tests and record RED**

```powershell
cd mobile
npm test -- --runInBand src/workflows/executor/artifactOperation.test.ts src/workflows/executor/exportOperation.test.ts src/workflows/executor/mediaDeliveryAcceptance.test.ts
```

Expected: tests fail because explicit delivery intent and legacy export payloads are not accepted.

- [ ] **Step 3: Extend artifact commit without changing schema**

Export `SystemGalleryIntent` and `ArtifactDownloadPayload`. Parse the entire download payload, not just `artifact`. Extend `ArtifactCommitInput` with `deliveryIntent?: SystemGalleryIntent`.

Choose the effective intent exactly once:

```ts
const automaticIntent = input.artifact.kind === 'video' && input.deliveryPolicy.autoExportToGallery
  ? { target: 'system-gallery' as const, keepPrivateCopy: input.deliveryPolicy.keepPrivateCopy }
  : undefined;
const deliveryIntent = input.deliveryIntent ?? automaticIntent;
const exportStatus = deliveryIntent ? 'QUEUED' : 'NOT_REQUESTED';
```

The enqueued export payload is CAS-backed:

```ts
const payload: ExportPayload = {
  assetId: `${input.jobId}:${input.artifact.id}`,
  artifactId: input.artifact.id,
  sourceUri: input.localUri,
  sourceKind: 'cas',
  blobSha256: input.blob.sha256,
  keepPrivateCopy: deliveryIntent.keepPrivateCopy,
  displayName: artifactExportDisplayName(input.jobId, input.artifact.id),
};
```

Keep the current deterministic delivery id and `INSERT OR IGNORE` behavior.

- [ ] **Step 4: Make export parsing discriminate CAS and legacy sources**

Update `payloadFrom` so it accepts exactly these shapes:

```ts
const validCas = value.sourceKind === 'cas'
  && typeof value.blobSha256 === 'string'
  && /^[a-f0-9]{64}$/.test(value.blobSha256);
const validLegacy = value.sourceKind === 'legacy' && value.blobSha256 == null;
if (!validCas && !validLegacy) return undefined;
```

Change `ExportSuccessInput.blobSha256` to optional and release a reference only for a CAS payload:

```ts
if (!input.keepPrivateCopy && input.sourceKind === 'cas' && input.blobSha256) {
  db.runSync(
    "DELETE FROM artifact_blob_refs WHERE blob_sha256=? AND owner_type='workflow_artifact' AND owner_id=?",
    input.blobSha256,
    input.referenceOwnerId,
  );
}
```

Legacy success may clear the task/media private projection when `keepPrivateCopy=false`. Add this optional handler dependency:

```ts
removeLegacyPrivate?: (sourceUri: string) => Promise<void>;
```

Call it only after `commitSuccess` returns, only for `sourceKind==='legacy'`, only when `keepPrivateCopy=false`, and only when the URI starts with `file://` and does not contain `/cas/sha256/`:

```ts
if (!payload.keepPrivateCopy && payload.sourceKind === 'legacy' && deps.removeLegacyPrivate) {
  await deps.removeLegacyPrivate(payload.sourceUri).catch(() => undefined);
}
```

Production wiring uses `FileSystem.deleteAsync(sourceUri, { idempotent: true })`. Publication and the database success remain authoritative even if best-effort legacy cleanup fails.

- [ ] **Step 5: Verify focused GREEN and regression safety**

```powershell
cd mobile
npm test -- --runInBand src/workflows/executor/artifactOperation.test.ts src/workflows/executor/exportOperation.test.ts src/workflows/executor/mediaDeliveryAcceptance.test.ts src/media/casRepository.test.ts
npm run typecheck
```

Expected: selected suites and typecheck pass; CAS reference release remains exact.

- [ ] **Step 6: Commit delivery payload changes**

```powershell
git add -- mobile/src/workflows/executor/artifactOperation.ts mobile/src/workflows/executor/artifactOperation.test.ts mobile/src/workflows/executor/exportOperation.ts mobile/src/workflows/executor/exportOperation.test.ts mobile/src/workflows/executor/mediaDeliveryAcceptance.test.ts
git commit -m "feat: persist durable media delivery intent"
```

### Task 3: Transactional manual media command service

**Files:**
- Create: `mobile/src/workflows/executor/mediaCommandService.ts`
- Create: `mobile/src/workflows/executor/mediaCommandService.test.ts`
- Modify: `mobile/src/workflows/executor/operationRepository.ts`
- Modify: `mobile/src/workflows/executor/operationRepository.test.ts`

- [ ] **Step 1: Write real-SQLite RED tests for command semantics**

Use `createInitializedRealSqliteTestDb()` and seed a task, workflow job, artifact, media asset, blob, and workflow-artifact reference. Add tests for:

```ts
const service = createMediaCommandService({
  db: db as never,
  fileExists: async (uri) => existingUris.has(uri),
  resolveCasUri: (relativePath) => `file:///documents/${relativePath}`,
  now: () => 100,
});

const first = await service.requestDownload('job-1');
const second = await service.requestDownload('job-1');
expect(first.operation?.id).toBe(second.operation?.id);
expect(db.getAllSync(
  "SELECT * FROM workflow_operations WHERE kind='ARTIFACT_DOWNLOAD' AND state='PENDING'",
)).toHaveLength(1);
```

Also prove:

- enqueue and task/asset `ENQUEUED` projections roll back together on injected SQL failure;
- `PENDING`/`CLAIMED` canonical or manual operations are reused;
- valid CAS file + blob + ref returns `{ status: 'already-complete' }`;
- a `SUCCEEDED` operation with a missing CAS file creates `manual:1`;
- after `manual:1` becomes terminal, the next explicit command creates `manual:2`;
- two database connections racing a retry create one pending generation;
- export from CAS includes the hash and frozen policy;
- export from a valid non-CAS `file://` path uses `sourceKind='legacy'`;
- export with no private source chains a download with delivery intent;
- an existing successful delivery returns already complete;
- missing job/artifact/source and recovery-readonly mode reject without partial writes.

- [ ] **Step 2: Run command tests and record RED**

```powershell
cd mobile
npm test -- --runInBand src/workflows/executor/mediaCommandService.test.ts src/workflows/executor/operationRepository.test.ts
```

Expected: the new suite fails to compile because the service and repository query helpers do not exist.

- [ ] **Step 3: Add bounded operation lookup helpers**

Extend `OperationRepository` with indexed/bounded reads used by the command service:

```ts
listForJobAndKind(jobId: string, kind: OperationKind): WorkflowOperation[] {
  return db.getAllSync<OperationRow>(
    'SELECT * FROM workflow_operations WHERE job_id=? AND kind=? ORDER BY created_at DESC,id DESC LIMIT 64',
    jobId,
    kind,
  ).map(mapRow);
}
```

Do not use the unbounded `list(kind)` method in the new service. Keep generation selection and insert inside the service's `BEGIN IMMEDIATE` transaction.

- [ ] **Step 4: Implement the service public interface**

Use these exact public types:

```ts
export type MediaCommandResult = {
  status: 'queued' | 'in-flight' | 'already-complete';
  operation?: WorkflowOperation;
};

export type MediaCommandService = {
  requestDownload(taskId: string): Promise<MediaCommandResult>;
  requestExport(taskId: string, policy: { keepPrivateCopy: boolean }): Promise<MediaCommandResult>;
  hasActiveMediaOperation(taskId: string): boolean;
};
```

Resolve the primary video deterministically with `kind='video' ORDER BY updated_at DESC,id ASC LIMIT 1`. Resolve its artifact from `workflow_artifacts` using `media_assets.artifact_id`; fall back to a normalized `recovered-primary-video` artifact only when the task has a source URL and no canonical artifact.

Active-operation matching must include canonical and `:manual:<generation>` keys. Under `BEGIN IMMEDIATE`, compute the next generation by parsing matching keys, use `max + 1`, insert the operation, then update projections. Use ids and keys:

```ts
const operationId = `${taskId}:artifact:${artifact.id}:manual:${generation}`;
const idempotencyKey = `artifact:${taskId}:${artifact.id}:manual:${generation}`;

const exportOperationId = `${taskId}:export:${artifact.id}:system-gallery:manual:${generation}`;
const exportIdempotencyKey = `export:${taskId}:${artifact.id}:system-gallery:manual:${generation}`;
```

Before declaring a CAS result valid, require all three:

```sql
SELECT b.sha256,b.relative_path
FROM artifact_blob_refs r
JOIN artifact_blobs b ON b.sha256=r.blob_sha256
WHERE r.owner_type='workflow_artifact' AND r.owner_id=?
LIMIT 1
```

Then resolve the relative path and check the file. A legacy source must be a verified existing `file://` URI that does not contain `/cas/sha256/`.

- [ ] **Step 5: Make queued projection writes atomic**

In the same transaction as operation insert:

```sql
UPDATE tasks
SET download_state='ENQUEUED',download_error=NULL,download_progress=0,updated_at=MAX(updated_at,?)
WHERE id=?
```

```sql
UPDATE media_assets
SET status='queued',updated_at=?
WHERE id=? AND task_id=?
```

For direct export enqueue, set task `export_state='QUEUED'`, media `export_status='QUEUED'`, and upsert the deterministic `media_deliveries` row as `QUEUED`. Require exactly one task and asset update; otherwise roll back.

- [ ] **Step 6: Verify command GREEN, concurrency, and readonly behavior**

```powershell
cd mobile
npm test -- --runInBand src/workflows/executor/mediaCommandService.test.ts src/workflows/executor/operationRepository.test.ts src/storage/readOnlyWrites.test.ts
npm run typecheck
```

Expected: every selected suite passes, including the two-connection race and rollback test.

- [ ] **Step 7: Commit the command service**

```powershell
git add -- mobile/src/workflows/executor/mediaCommandService.ts mobile/src/workflows/executor/mediaCommandService.test.ts mobile/src/workflows/executor/operationRepository.ts mobile/src/workflows/executor/operationRepository.test.ts
git commit -m "feat: enqueue manual media commands durably"
```

### Task 4: Wire commands into the executor cycle and cover cross-path races

**Files:**
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/tasks/sync.test.ts`
- Create: `mobile/src/workflows/executor/manualMediaAcceptance.test.ts`
- Modify: `mobile/src/workflows/executor/exportOperation.ts`
- Modify: `mobile/src/workflows/executor/exportOperation.test.ts`

- [ ] **Step 1: Add RED tests for singleton wiring and recovery**

In `sync.test.ts`, inject a command service and cycle and verify each facade persists before running the cycle:

```ts
await requestTaskDownload('task-1');
expect(commands.requestDownload).toHaveBeenCalledWith('task-1');
expect(commands.requestDownload.mock.invocationCallOrder[0])
  .toBeLessThan(runCycle.mock.invocationCallOrder[0]);

await requestTaskExport('task-1', { keepPrivateCopy: false });
expect(commands.requestExport).toHaveBeenCalledWith('task-1', { keepPrivateCopy: false });
```

The real-SQLite acceptance suite must cover:

- provider terminal status auto-enqueues download while a manual tap races it;
- only one in-flight download is claimed and one CAS blob/ref is committed;
- a manual save racing automatic export produces one deterministic delivery and one native publication;
- task removal while a command is claimed fails with `TASK_OPERATION_IN_PROGRESS`;
- expired download/export leases recover without direct UI intervention;
- native publication replay returns the existing deterministic display name and commits one delivery;
- `keepPrivateCopy=false` clears projections and releases only the matching workflow-artifact ref.

- [ ] **Step 2: Run focused tests and record RED**

```powershell
cd mobile
npm test -- --runInBand src/tasks/sync.test.ts src/workflows/executor/manualMediaAcceptance.test.ts src/workflows/executor/exportOperation.test.ts
```

Expected: new facade exports and acceptance behaviors are absent, so the command exits non-zero.

- [ ] **Step 3: Instantiate commands beside the existing cycle**

After `cycle` is created in `sync.ts`, instantiate the service with the shared database and CAS URI resolver:

```ts
const mediaCommands = createMediaCommandService({
  db: database,
  fileExists: async (uri) => {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory;
  },
  resolveCasUri: (relativePath) => `${FileSystem.documentDirectory ?? ''}${relativePath}`,
  now: Date.now,
});

export async function requestTaskDownload(taskId: string) {
  const result = await mediaCommands.requestDownload(taskId);
  if (result.status !== 'already-complete') await cycle.run({ reason: 'foreground' });
  return result;
}

export async function requestTaskExport(taskId: string, policy: { keepPrivateCopy: boolean }) {
  const result = await mediaCommands.requestExport(taskId, policy);
  if (result.status !== 'already-complete') await cycle.run({ reason: 'foreground' });
  return result;
}
```

The bounded cycle is a responsiveness kick, not the durability boundary. Return the persisted command result even when later handler execution fails; UI reads the resulting failed projection on refresh.

- [ ] **Step 4: Add deterministic post-publication fault injection**

Add an optional executor dependency used only by tests/debug acceptance:

```ts
afterPublish?: (input: { operationId: string; galleryUri: string }) => Promise<void> | void;
```

Call it after native `publish` returns and before `commitSuccess`. Production wiring leaves it undefined. The acceptance test throws from this seam, expires/releases the lease, reruns the cycle, and verifies native publication's deterministic display-name lookup prevents a duplicate MediaStore result.

- [ ] **Step 5: Verify executor integration GREEN**

```powershell
cd mobile
npm test -- --runInBand src/tasks/sync.test.ts src/workflows/executor/manualMediaAcceptance.test.ts src/workflows/executor/mediaDeliveryAcceptance.test.ts src/workflows/executor/exportOperation.test.ts src/tasks/repository.test.ts
npm run typecheck
```

Expected: all selected suites pass, publication remains singleton, and deletion fencing stays green.

- [ ] **Step 6: Commit cycle wiring and acceptance**

```powershell
git add -- mobile/src/tasks/sync.ts mobile/src/tasks/sync.test.ts mobile/src/workflows/executor/manualMediaAcceptance.test.ts mobile/src/workflows/executor/exportOperation.ts mobile/src/workflows/executor/exportOperation.test.ts
git commit -m "feat: drive manual media through executor cycle"
```

### Task 5: Replace route-owned media mutation with durable commands

**Files:**
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Modify: `mobile/app/video/[id].tsx`
- Modify: `mobile/src/route-tests/tasks.test.tsx`
- Modify: `mobile/src/route-tests/video-detail.test.tsx`
- Create: `mobile/src/route-tests/media-route-ownership.test.ts`

- [ ] **Step 1: Rewrite route tests first**

Replace mocks of `ensureTaskDownloaded`/`exportTaskVideo` with mocks of the sync facade:

```ts
jest.mock('../tasks/sync', () => ({
  taskStore: mockTaskStore,
  mediaStore: mockMediaStore,
  syncTaskRun: (...args: unknown[]) => mockSync(...args),
  requestTaskDownload: (taskId: string) => mockRequestDownload(taskId),
  requestTaskExport: (taskId: string, policy: { keepPrivateCopy: boolean }) =>
    mockRequestExport(taskId, policy),
}));
```

Assert:

- download button calls `requestTaskDownload(task.id)` once;
- save/retry-save calls `requestTaskExport(task.id, { keepPrivateCopy })` once;
- buttons show persisted `ENQUEUED/DOWNLOADING/QUEUED/EXPORTING` busy state;
- route handlers reload persisted state after command completion and do not synthesize terminal success locally;
- video-detail load does not call `updateMediaProjection`, `mediaStore.upsert`, or `upsertDelivery`;
- command errors show the existing alert without direct fallback download/export.

Add a source scan:

```ts
test('production routes do not own media execution or projection writes', () => {
  for (const route of ['app/(tabs)/tasks.tsx', 'app/video/[id].tsx']) {
    const source = readFileSync(resolve(process.cwd(), route), 'utf8');
    expect(source).not.toMatch(/tasks\/media|exportVideo|downloadTask|updateMediaProjection|upsertDelivery/);
  }
});
```

- [ ] **Step 2: Run route tests and record RED**

```powershell
cd mobile
npm test -- --runInBand src/route-tests/tasks.test.tsx src/route-tests/video-detail.test.tsx src/route-tests/media-route-ownership.test.ts
```

Expected: tests fail because both routes still import legacy media helpers and directly write projections.

- [ ] **Step 3: Simplify task-list actions**

Import `requestTaskDownload` and `requestTaskExport` from `tasks/sync`. Replace direct media work with:

```ts
const retry = async (task: TaskRecord) => {
  if (mediaBusyRef.current.has(task.id)) return;
  setMediaBusy(task.id, true);
  try {
    await requestTaskDownload(task.id);
    await load();
  } catch (error) {
    Alert.alert('下载失败', error instanceof Error ? error.message : '视频下载失败');
  } finally {
    setMediaBusy(task.id, false);
  }
};

const retryExport = async (task: TaskRecord) => {
  if (mediaBusyRef.current.has(task.id)) return;
  setMediaBusy(task.id, true);
  try {
    const settings = await readSettings();
    await requestTaskExport(task.id, { keepPrivateCopy: settings.keepPrivateCopy });
    await load();
  } catch (error) {
    Alert.alert('保存失败', error instanceof Error ? error.message : '保存到系统相册失败');
  } finally {
    setMediaBusy(task.id, false);
  }
};
```

Remove route-level `repairTaskMediaState`; `syncTaskRun` reconciliation owns repair before the page is read.

- [ ] **Step 4: Simplify video-detail loading and export**

On focus/load, call `syncTaskRun('foreground', [id])`, then read the task and asset. `resolveLocalVideoSource` may select a playback URI but must not write projections. Save uses the command facade with `keepPrivateCopy: true`, preserving the current detail-screen policy:

```ts
await requestTaskExport(task.id, { keepPrivateCopy: true });
await reloadTaskAndAsset();
```

Remove all route calls to task/media projection writes and delivery upsert.

- [ ] **Step 5: Verify route GREEN and adjacent UI behavior**

```powershell
cd mobile
npm test -- --runInBand src/route-tests/tasks.test.tsx src/route-tests/video-detail.test.tsx src/route-tests/media-route-ownership.test.ts src/route-tests/gallery.test.tsx
npm run typecheck
```

Expected: all selected suites pass and the ownership scan has zero matches.

- [ ] **Step 6: Commit route ownership**

```powershell
git add -- 'mobile/app/(tabs)/tasks.tsx' 'mobile/app/video/[id].tsx' mobile/src/route-tests/tasks.test.tsx mobile/src/route-tests/video-detail.test.tsx mobile/src/route-tests/media-route-ownership.test.ts
git commit -m "fix: route manual media through durable commands"
```

### Task 6: Remove superseded queues and prove C-Core regression safety

**Files:**
- Delete: `mobile/src/tasks/media.ts`
- Delete: `mobile/src/tasks/media.test.ts`
- Delete: `mobile/src/tasks/coordinator.ts`
- Delete: `mobile/src/tasks/coordinator.test.ts`
- Delete: `mobile/src/tasks/mediaQueue.ts`
- Delete: `mobile/src/tasks/mediaQueue.test.ts`
- Modify: `mobile/src/route-tests/media-route-ownership.test.ts`

- [ ] **Step 1: Expand the ownership test before deletion**

Scan all production TypeScript/TSX under `mobile/app` and `mobile/src`, excluding tests, and fail on imports/references to the three legacy modules or direct UI/native media execution:

```ts
const forbidden = [
  /tasks\/media['"]/, /tasks\/coordinator['"]/, /tasks\/mediaQueue['"]/,
];
for (const file of productionFiles) {
  const source = readFileSync(file, 'utf8');
  for (const pattern of forbidden) expect({ file, match: source.match(pattern)?.[0] }).toEqual({ file, match: undefined });
}

for (const removed of [
  'src/tasks/media.ts',
  'src/tasks/coordinator.ts',
  'src/tasks/mediaQueue.ts',
]) {
  expect(existsSync(resolve(process.cwd(), removed))).toBe(false);
}
```

Whitelist only executor wiring for `exportVideo`, download policy for `expo/fetch`, and repository/reconciliation modules for projection SQL. Do not allow route/component files in those whitelists.

- [ ] **Step 2: Run the ownership test while old files exist and record RED**

```powershell
cd mobile
npm test -- --runInBand src/route-tests/media-route-ownership.test.ts
```

Expected: it reports the legacy module files or references.

- [ ] **Step 3: Delete the superseded modules and their obsolete tests**

Use `apply_patch` to delete the six listed files. Before deletion, run `rg -n 'ensureTaskMedia|ensureTaskDownloaded|exportTaskVideo|createTaskCoordinator|createMediaDeliveryQueue' mobile` and confirm remaining matches are confined to the files being deleted. Do not delete `tasks/download.ts`, `tasks/downloadPolicy.ts`, executor handlers, or native MediaStore code.

- [ ] **Step 4: Run and verify the complete automated gate**

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
```

Expected: TypeScript exits 0; Jest has zero failed suites/tests. The expected injected `provider failed` console output is not a failure.

- [ ] **Step 5: Run static and schema ownership gates**

```powershell
git diff --check
rg -n 'ensureTaskMedia|ensureTaskDownloaded|exportTaskVideo|createTaskCoordinator|createMediaDeliveryQueue' mobile
rg -n 'CREATE TABLE|ALTER TABLE' mobile/src --glob '*.ts'
```

Expected: no legacy-media symbol matches; DDL matches remain limited to the existing schema/migration/recovery owners and tests. `APP_SCHEMA_VERSION` is still 6.

- [ ] **Step 6: Commit dead-code removal**

```powershell
git add -- mobile/src/tasks/media.ts mobile/src/tasks/media.test.ts mobile/src/tasks/coordinator.ts mobile/src/tasks/coordinator.test.ts mobile/src/tasks/mediaQueue.ts mobile/src/tasks/mediaQueue.test.ts mobile/src/route-tests/media-route-ownership.test.ts
git commit -m "refactor: remove superseded media queues"
```

### Task 7: Version 1.4.9 and record automated verification

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`
- Modify: `mobile/app.json`
- Modify: `mobile/android/app/build.gradle`
- Create: `docs/superpowers/verification/2026-09-04-c-closure-hotfix.md`
- Modify: `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`

- [ ] **Step 1: Bump JavaScript package versions mechanically**

```powershell
cd mobile
npm version 1.4.9 --no-git-tag-version
```

Expected: only the root package versions in `package.json` and `package-lock.json` change from 1.4.8 to 1.4.9.

- [ ] **Step 2: Update Expo and Android version ownership**

Set:

```json
"version": "1.4.9"
```

in `mobile/app.json`, and set:

```gradle
versionCode 19
versionName "1.4.9"
```

in `mobile/android/app/build.gradle`.

- [ ] **Step 3: Verify all version owners**

Run:

```powershell
node -e "const fs=require('fs');const app=require('./mobile/app.json');const pkg=require('./mobile/package.json');const lock=require('./mobile/package-lock.json');const gradle=fs.readFileSync('./mobile/android/app/build.gradle','utf8');if(app.expo.version!=='1.4.9'||pkg.version!=='1.4.9'||lock.version!=='1.4.9'||lock.packages[''].version!=='1.4.9'||!/versionCode 19/.test(gradle)||!/versionName \"1\.4\.9\"/.test(gradle))process.exit(1);console.log('1.4.9 / versionCode 19');"
```

Expected: prints `1.4.9 / versionCode 19` and exits 0.

- [ ] **Step 4: Run and record the final automated baseline**

```powershell
cd mobile
$env:CI='true'
npm run typecheck
npm test -- --runInBand
cd ..
git diff --check
```

Record exact suite/test counts, skips, expected console warnings, current commit, and schema version in the verification document. Record M6 as `Accepted Constraint`: trusted adapter origin, HTTPS, redirect validation, literal private-address rejection, no forwarded credentials, MIME/size/timeouts/integrity, and diagnostic redaction. Do not claim DNS-resolution pinning or a fixed host allowlist.

- [ ] **Step 5: Update the handoff without starting D work**

State that C implementation is code-complete only after Task 8 device acceptance and release completion. Record that D Task 1 will start from the final v1.4.9 merge/tag commit with schema v6, while UNKNOWN UI and low-priority query/cursor observations remain deferred.

- [ ] **Step 6: Commit version and preliminary verification**

```powershell
git add -- mobile/package.json mobile/package-lock.json mobile/app.json mobile/android/app/build.gradle docs/superpowers/verification/2026-09-04-c-closure-hotfix.md docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md
git commit -m "chore: prepare v1.4.9 C-closure release"
```

### Task 8: Android acceptance, independent review, PR, tag, and release

**Files:**
- Modify: `docs/superpowers/verification/2026-09-04-c-closure-hotfix.md`
- Modify: `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`
- Verify: `.github/workflows/release.yml`

- [ ] **Step 1: Build from a real short-path checkout**

Use JDK 21 and a real worktree such as `D:\wt\c149` rather than a junction or the long project path:

```powershell
cd mobile/android
./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon --console=plain
```

Expected: `BUILD SUCCESSFUL` and a non-empty `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Record JDK version, ABI, task count, APK byte size, and SHA-256.

- [ ] **Step 2: Run fresh-install and v1.4.8 upgrade acceptance**

On the configured x86_64 emulator:

1. uninstall/install v1.4.9 and verify startup, schema `user_version=6`, CreateForm, and zero fatal SQLite/native logcat matches;
2. install the published v1.4.8 APK, seed or preserve representative tasks/private video/gallery delivery, then install v1.4.9 over it without clearing data;
3. verify tasks, local playback, delivery URI, blob refs, and workflow operations remain readable and consistent.

Record exact package/version output, database sentinel queries, and logcat scan commands/results.

- [ ] **Step 3: Execute the seven media device scenarios**

Record PASS/FAIL evidence for:

1. auto-export on;
2. auto-export off;
3. keep-private-copy on/off;
4. manual download/save and controlled retry;
5. debug fault injection after native publication followed by force-stop/relaunch, with no duplicate MediaStore row;
6. seeded missing media/delivery projection repaired without clearing app data;
7. background/foreground cycle recovery with persisted button state.

For each scenario capture task/asset/operation/delivery rows and the relevant private/MediaStore file evidence. Remove or disable the debug fault trigger after the scenario and verify production behavior cannot activate it.

- [ ] **Step 4: Complete carried Prompt/Timeline stabilization checks**

Record device evidence for multi-image removal and mentions, duplicate-title navigation and visible Timeline count, model change/deletion during generation, detached streaming viewport, return-to-latest, provider-error retry, stopped-run retry, clipboard content, and suggestion focus without implicit send.

If any scenario fails, stop release work. Use `superpowers:systematic-debugging`, reproduce with a focused failing test, and request scope review before adding a fix to this hotfix.

- [ ] **Step 5: Finalize evidence and run the complete release gate**

Update both docs with actual results, then run:

```powershell
cd mobile
$env:CI='true'
npm run typecheck
npm test -- --runInBand
cd ..
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
rg -n 'ensureTaskMedia|ensureTaskDownloaded|exportTaskVideo|createTaskCoordinator|createMediaDeliveryQueue' mobile
```

Expected: zero failed tests/type errors/diff errors/legacy-symbol matches. Only explained local build artifacts may remain untracked, and they must not be staged.

- [ ] **Step 6: Commit final acceptance evidence**

```powershell
git add -- docs/superpowers/verification/2026-09-04-c-closure-hotfix.md docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md
git commit -m "docs: record v1.4.9 C-closure verification"
```

- [ ] **Step 7: Request independent code review**

Invoke `superpowers:requesting-code-review` with `origin/main` as the base. Require explicit review of command transaction atomicity, retry-generation races, CAS validity, legacy-source cleanup, deletion/GC fences, fault-injection isolation, URL redaction, and route ownership. Fix every Critical or Important finding and rerun affected focused tests plus the complete gate.

- [ ] **Step 8: Push and create the release PR**

Push `codex/c-closure-hotfix` and create a PR targeting `main`. Include scope, data flow, M6 accepted constraint, RED/GREEN evidence, complete test counts, Android matrix, v1.4.8 upgrade evidence, APK hash, and all deferred items. Do not merge while any required check or device gate is incomplete.

- [ ] **Step 9: Merge and verify the release commit**

After required checks and review pass, merge the PR. Fetch and verify the resulting merge commit is on `origin/main` and contains version 1.4.9 plus the final verification document.

- [ ] **Step 10: Create and push the annotated v1.4.9 tag**

```powershell
git fetch origin main --tags
$releaseMergeSha = git rev-parse origin/main
if (git tag -l v1.4.9) { throw 'v1.4.9 already exists' }
git tag -a v1.4.9 $releaseMergeSha -m "AutoDL H3 v1.4.9"
git push origin v1.4.9
```

Expected: the tag points to the reviewed PR merge commit, never an unmerged feature commit.

- [ ] **Step 11: Verify GitHub Actions and the published artifact**

Wait for the tag-triggered `Android Release` workflow. Require successful version checks, typecheck, Jest, signed universal APK build, ABI inspection, `apksigner` verification, and GitHub Release creation.

Use `gh release view v1.4.9`, download the APK into a temporary directory, verify non-zero size/signature/version, compute SHA-256, and compare it with workflow evidence. Remove the temporary directory afterward. Report the Release URL, workflow URL, asset name, byte size, and hash.

- [ ] **Step 12: Establish the D-Core baseline**

Update local `dev` from the verified release merge, confirm `v1.4.9^{}` equals that commit and `APP_SCHEMA_VERSION=6`, then create the D-Core worktree from this exact baseline. Do not begin D implementation inside the hotfix worktree.
