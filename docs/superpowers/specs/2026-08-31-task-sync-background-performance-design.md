# Task Sync, Background Monitoring, and Large-List Performance Design

## Goal

Make workflow-generated tasks recoverable and monitorable across app restarts, foreground refreshes, Android background execution, and Android foreground-service monitoring, while keeping task lists and the result gallery responsive with large local datasets.

This design also closes every unresolved item in `docs/superpowers/reviews/PROVIDER_INTEGRATION_REVIEW.md`.

## Scope

### Included

- Preserve workflow/job provenance in the task compatibility projection.
- Use the local job ID and remote provider job ID consistently.
- Project persisted artifacts into legacy task fields such as `videoUrl`.
- Route legacy polling through the provider-owned transport/client.
- Isolate per-task sync failures and expose typed sync state.
- Make provider workflow operation and workflow ID schema-driven for trusted definitions.
- Add provider-specific credential resolution and adapter credential validation.
- Normalize AutoDL authentication, network, timeout, malformed-response, and provider errors.
- Share one sync coordinator between the tasks screen, Expo background task, and Android foreground service.
- Provide best-effort system background sync and optional Android foreground monitoring with approximately two-minute polling.
- Add paged/incremental task and gallery queries, thumbnail lazy loading, and bounded concurrency.

### Excluded

- A second provider implementation such as NovelAI.
- Arbitrary user-supplied HTTP endpoints, headers, scripts, or executable plugins.
- Cloud task synchronization or server-side push infrastructure.
- Guaranteed exact two-minute execution under Android power restrictions.

## Existing failure chain

The current create path writes a complete workflow job and then writes a compatibility `TaskRecord`. `tasks/repository.ts` does not include the new workflow columns in its `INSERT OR REPLACE`, so reloading the task loses provenance. `tasks/sync.ts` then treats the task as legacy and calls the old global-fetch API with the local job ID instead of `remote.providerJobId`. A single rejected request aborts the complete sync pass. Separately, `runtime.sync()` persists artifacts but task sync projects with an empty artifact list, so successful jobs do not receive a `videoUrl` and media delivery never starts.

The implementation must fix the source of each failure rather than add UI-only retries.

## Architecture

```text
Tasks screen ─┐
Expo BackgroundTask ─┼─> TaskSyncCoordinator ─> JobRepository
Android ForegroundService ┘                         │
                                                    ├─> WorkflowRuntime
                                                    │     └─> ProviderAdapter
                                                    │           └─> ProviderClient + native transport
                                                    └─> ArtifactRepository
                                                          └─> Task compatibility projection
```

`TaskSyncCoordinator` is the only component that decides which jobs need polling, performs bounded concurrent polling, persists job/artifact updates, updates compatibility tasks, and returns a structured summary. The UI and background entry points do not duplicate provider or task-selection logic.

## Data model and persistence

### Task compatibility projection

`TaskRecord` remains readable by the existing task list, video detail, download, and gallery consumers. Its repository must persist every declared field, including workflow provenance and input snapshot. New writes use an explicit upsert that does not delete columns omitted by a caller. Existing rows are migrated without data loss.

### Job as source of truth

New workflow tasks are identified by their local job ID. Provider calls always use `job.remote.providerJobId`. During migration, a task with a matching `workflow_jobs` row is treated as a workflow task even if its compatibility columns are missing. Tasks without a matching job remain legacy and are polled through the AutoDL compatibility client using their stored remote ID.

### Artifact projection

After a status update, the coordinator reads the job's persisted artifacts and passes them to `jobRecordToTaskProjection`. A video artifact maps to `TaskRecord.videoUrl` while preserving existing download/export fields and provenance. The projection must not overwrite a previously known URL with `undefined` when no new artifact is returned.

### Status and timing

Normalized job statuses include `QUEUED`, `RUNNING`, `SUCCEEDED`, `PARTIAL_SUCCEEDED`, `FAILED`, `CANCELLED`, and `UNKNOWN`. Compatibility mapping must preserve terminal/unknown meaning rather than silently converting all unrecognized states to `QUEUED`. Provider timestamps (`created_at`, `started_at`, and duration) are retained in normalized updates and projected to task timing fields.

## Provider boundary and workflow templating

The provider adapter receives a trusted, validated operation context containing the workflow operation and workflow ID. The AutoDL client no longer hard-codes the H3 workflow ID for all submissions; it accepts a code-owned/validated workflow target and still owns the fixed AutoDL base URL, authentication headers, and protocol parsing. Workflow definitions cannot provide arbitrary URLs or headers.

The runtime validates that the workflow operation is supported by the selected adapter, resolves provider-specific credentials, and calls `adapter.validateCredentials()` before submission. Credential stores expose provider-specific shapes without making the runtime AutoDL-specific.

The adapter maps request bindings and output mappings from the workflow definition into normalized submit requests and artifact records. A workflow can therefore add another trusted AutoDL workflow definition without changing the create form or runtime.

Legacy `tasks/api.ts` becomes a compatibility facade over the AutoDL client and native provider transport, or is removed after all legacy callers migrate. No provider polling path uses the LLM/CopilotKit global fetch.

## Error handling and synchronization

`ProviderError` categories include network, timeout, authentication, HTTP, provider-declared failure, and malformed response. AutoDL responses support both the legacy `{code,msg,data}` envelope and authentication bodies containing `error.message`.

The coordinator:

1. Acquires a process-local sync mutex; concurrent triggers share or skip the in-flight pass.
2. Reads only active jobs/tasks that need polling or media delivery.
3. Polls with bounded concurrency and per-task error isolation.
4. Persists successful updates and artifacts immediately.
5. Records a typed per-task sync error without changing a healthy task to failed.
6. Continues processing other tasks and returns `{ updated, failed, skipped, remaining }`.

No-token and offline states return stale local data with an explicit summary; they do not claim a successful refresh. Retry/backoff is bounded and must not keep a background worker alive indefinitely.

## Android background monitoring

### Best-effort background task

`expo-background-task` remains registered as a low-frequency fallback. Android WorkManager has a system-enforced minimum interval of 15 minutes and inexact execution, so the UI and documentation describe this as best-effort rather than a two-minute guarantee.

### User-enabled continuous monitoring

When at least one active task is selected for continuous monitoring, an Android Foreground Service starts with a user-visible notification and invokes the shared coordinator approximately every two minutes. The service stops when monitoring is disabled, all selected jobs reach terminal state, or the user explicitly stops it. The service must survive process recreation where Android permits it by reloading persisted monitoring state.

The service owns only scheduling, notification, and lifecycle. Provider requests remain in the TypeScript adapter/client boundary. Required Android permissions, notification channel, boot/process behavior, and Expo development-build configuration are explicit and tested. Expo Go is not a supported validation target for this feature.

## Large-list performance

### Repository queries

- Add `listPage({ cursor, limit, status, query })` for tasks, ordered by stable `(created_at, id)` keys.
- Add `listMediaPage` for gallery projection, selecting only media fields needed by cards.
- Add an incremental `updated_at > watermark` query for refresh reconciliation.
- Add indexes for task status/updated time and gallery eligibility.

### React rendering

- Keep a bounded page/window in memory.
- Use `FlatList` virtualization with stable keys and tuned batch/window props.
- Update task timing text independently from task data so a one-second clock tick does not replace the full list.
- Apply sync results by keyed patches; do not replace unchanged rows.
- Lazy-load posters and limit extraction concurrency; never start one unbounded `Promise.all` for every gallery item.

## Testing and acceptance criteria

### Unit and integration tests

- Task repository round-trips every provenance and input field and preserves them across partial updates.
- Create → persist → reload → sync uses `remote.providerJobId`.
- Successful artifacts project to `videoUrl` and trigger media delivery.
- Legacy polling uses the provider transport, not global fetch.
- AutoDL 401/403 error bodies expose authentication errors and `error.message`.
- Workflow ID/operation are supplied by trusted definitions; multiple definitions submit to different expected paths.
- Adapter credential validation is called before submit.
- Unknown/partial statuses and provider timing fields project correctly.
- One failed task does not prevent other tasks from synchronizing.
- Concurrent sync triggers do not duplicate polling.
- Pagination, watermark queries, and gallery bounded poster concurrency are covered.
- Foreground-service scheduling and stop conditions are covered with deterministic fake timers/native boundaries.

### Device verification

- Android debug/development build installs and starts the foreground service.
- `adb`/logcat confirms notification creation, approximately two-minute scheduling, persisted state reload, and automatic stop at terminal state.
- `dumpsys gfxinfo` and, when available, Perfetto capture task-list refresh and gallery scroll before/after large seeded datasets.
- Network/DNS failure is tested separately from provider/auth failures; stale data remains visible with actionable status.

## Rollout order

1. Persistence and projection correctness.
2. Unified coordinator, provider compatibility facade, typed errors, and per-task isolation.
3. Schema-driven provider target and credential validation.
4. Paged repositories and virtualized/lazy UI updates.
5. Android foreground service and notification lifecycle.
6. Full Jest/typecheck/Android build and performance evidence.
