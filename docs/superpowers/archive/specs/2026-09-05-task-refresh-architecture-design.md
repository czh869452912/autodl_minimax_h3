# Task Refresh Architecture Decoupling Design

## Goal

Make the task list a responsive view of persisted task projections instead of a caller of the durable executor. Task status, download, and export changes must become visible without dropped refreshes, while large media transfer, hashing, probing, export, and maintenance never block list reads or UI interaction.

## Confirmed problem

The current task screen awaits `syncTaskRun()` before reading its first page. That call may run multiple executor passes, claim media work, stream a complete video through synchronous `File.write()`, compute the video SHA-256 twice through CryptoJS on the JS thread, probe the video, publish it into CAS, run maintenance, and only then read the visible projection. The same `load()` owns the refresh spinner and rejects every overlapping focus, poll, or command reload through an in-memory `loadInFlight` guard without guaranteeing a trailing read.

The September 4 auto-refresh repair keeps an unchanged adaptive polling chain alive, but it does not close the overlapping-load hole or remove heavy work from the UI runtime. The September 5 review is therefore correct about the main JS blocking, polling, rendering, and coalescing problems. Its double-read item is not a root cause: the later `listPage()` read is normally newer than the earlier active-task read. The redundant read should still disappear as part of the new boundary.

The Android native media module already provides `sha256File()` on a dedicated executor. The CAS path does not use that capability and instead performs its durable reread in JavaScript. The new media path must reuse and extend the native boundary rather than add another JavaScript hashing implementation.

## Scope and constraints

- The production target is the existing Android React Native/Expo application.
- SQLite task projections remain the UI source of truth.
- Durable workflow operations, idempotency keys, leases, retry rules, terminal notifications, CAS ownership, and existing task/media data are preserved.
- UI code may request work and read projections, but it cannot call or await an executor slice.
- Events accelerate an update but cannot be the correctness mechanism across foreground, BackgroundTask, and Headless JS runtimes.
- No server protocol or provider contract changes are required.
- The migration must preserve v1.4.10 tasks, operations, artifacts, blob references, deliveries, and media files.

## Considered boundaries

### Query, command, and worker port

A `TaskRuntime` with `readProjection()`, `requestWork()`, and `runWorker()` makes the capability split explicit and integrates cleanly with the existing background callers. It leaves timers, stale-result rejection, trailing reads, pagination windows, and structural sharing in every screen, so the task screen could easily rebuild the same fragile state machine under different names.

### UI projection session plus an independent executor

This is the selected boundary. UI screens consume a stateful `TaskListSession`; domain commands persist intent through `TaskCommandService`; scheduler wakes and worker execution are separate capabilities. The screen cannot accidentally execute a download while reading the list, and the session owns the coalescing and consistency rules once for every list consumer.

### Persistent change stream

A replayable `TaskProjectionChangeFeed` would provide precise cross-runtime deltas, deletion tombstones, and consumer cursors. It requires a new retained event log, compaction, slow-consumer recovery, and another state model beside workflow events and task projections. That is unnecessary for the current local task-list consistency requirement.

## Selected interfaces

```ts
type TaskListSnapshot = Readonly<{
  revision: number;
  phase: 'cold' | 'ready' | 'stale';
  items: readonly TaskCard[];
  nextCursor?: TaskCursor;
  read: Readonly<{
    pending: boolean;
    lastCheckedAt?: number;
    lastChangedAt?: number;
    error?: string;
  }>;
  work: Readonly<{
    phase: 'idle' | 'scheduled' | 'running' | 'backoff';
    nextWakeAt?: number;
    error?: string;
  }>;
  activity: Readonly<{
    activeTaskCount: number;
    remainingDue: number;
    remainingScheduled: number;
  }>;
}>;

interface TaskListSession {
  getSnapshot(): TaskListSnapshot;
  subscribe(listener: () => void): () => void;
  setVisible(visible: boolean): void;
  refresh(cause: 'focus' | 'manual'): Promise<{ revision: number; checkedAt: number }>;
  loadMore(): Promise<void>;
  dispose(): void;
}

interface TaskProjectionClient {
  openList(query: { pageSize: number }): TaskListSession;
}

interface TaskCommandService {
  requestRefresh(options: { maintenance: 'force-next-slice' }): Promise<CommandReceipt>;
  requestDownload(taskId: string): Promise<CommandReceipt>;
  requestRedownload(taskId: string): Promise<CommandReceipt>;
  requestExport(taskId: string, options: { keepPrivateCopy: boolean }): Promise<CommandReceipt>;
}

interface ExecutorWakePort {
  signal(trigger: ExecutorTrigger): void;
}

interface ExecutorRunner {
  runSlice(request: WorkerRequest): Promise<WorkerResult>;
}
```

`CommandReceipt` confirms that an idempotent intent is durably accepted, coalesced, or already complete. It never represents media completion. `ExecutorRunner` is available to foreground worker infrastructure, BackgroundTask, and Headless JS, but is not imported by task-list or detail-screen components.

## Component responsibilities

### Projection repository

The projection repository exposes a lightweight `TaskCard` query that selects only fields rendered by task cards. It does not select or parse `input_json`, `images_json`, or `audios_json`. It also exposes a global activity summary and the persisted task projection revision.

A new projection metadata row is incremented by SQLite triggers after every `tasks` insert, update, or delete. Triggers are required because task projections are written by workflow projection repair, artifact commit, export commit, media commands, and reconciliation in multiple JS runtimes. Requiring each writer to remember an application-level notification would recreate the missing-update failure.

A session reads revision before and after a page and summary read. If they differ, it discards the inconsistent result and schedules a trailing read. This gives a bounded consistency fence without holding an exclusive database transaction across UI work.

### Task list session

The session is a React external store with stable snapshot references. It owns hydration, visibility, revision checks, a bounded pagination window, stale-result rejection, and structural sharing for unchanged cards.

Refresh requests use single-flight plus a dirty bit. A request arriving during a read sets `dirty`; after the current read settles, the session performs at least one more read before becoming idle. Concurrent requests are coalesced but never silently discarded. Automatic failures retain the last valid items and mark the snapshot stale. A successful check clears the stale state.

The session reuses unchanged card objects by comparing the displayed DTO fields. It does not rely only on `updatedAt`, because two writes can share a millisecond timestamp. The initial window is 40 rows. As the user paginates, the session refreshes the loaded window up to 120 rows so deletion and reordering remain correct without unbounded reprocessing.

### Task commands

Task commands atomically persist the workflow operation or maintenance wake and the immediate task projection such as `ENQUEUED` or `QUEUED`. Duplicate commands reuse stable idempotency keys. Their promises settle after the durable transaction, emit same-runtime invalidation, and signal the scheduler; they do not call `runSlice()`.

Manual refresh starts a projection read and independently requests one coalesced `force-next-slice` maintenance intent. Repeated taps cannot enqueue repeated repair, reconciliation, or CAS GC work.

### Executor scheduler and runner

The scheduler owns `nextWakeAt`, execution budgets, maintenance cooldown, and cross-runtime lease competition. A worker slice processes bounded due work. Work inserted while a slice is running leaves a durable trailing wake instead of being mistaken for work already handled by the current in-memory promise.

The task screen only observes worker state and persistent operation summaries. It never owns the 250 ms executor loop. When due work remains after a budget, the scheduler queues the next slice; the minimum follow-up delay is one second and repeated failures use bounded exponential backoff with jitter. Provider status operations continue to use their persisted due times.

### Native artifact transfer

Removing `await` from the screen is insufficient while CryptoJS and synchronous file writes still execute in its JS runtime. Android therefore gains a native artifact-transfer operation on the media module's dedicated executor.

The native transfer streams the response into a CAS part while computing SHA-256 with `MessageDigest`. It validates HTTPS, URL credentials, public-address policy, the host allowlist, every redirect, status, MIME, declared length, actual byte limit, connection timeout, idle timeout, and an optional provider hash. After the stream is flushed, the existing native file hasher performs the durable reread. The native result contains the part URI, final URL, MIME, byte size, and SHA-256.

Progress callbacks are throttled and used only to renew the operation lease and update a coarse task projection. Media-lane concurrency remains one. A cancellation or lease loss closes the response and removes the part. JS resumes only for the existing video probe, CAS publication, and atomic database commit, all of which remain fenced by the operation lease.

## Data flow

```text
TasksScreen
  |-- TaskListSession -- lightweight read --> SQLite projection + revision
  |                               ^
  |                               | task projection writes
  `-- TaskCommandService --> durable intent --> ExecutorScheduler
                                                   |
                                             bounded runSlice
                                                   |
                           +-----------------------+------------------+
                           |                                          |
                    submit/status I/O                     native media transfer
                           |                                          |
                           +--------------- projection commit --------+
```

Same-runtime invalidation normally causes an immediate session check. Across runtimes, a visible session performs a lightweight revision and activity check. If activity or due work exists it keeps a bounded timer; if no task or operation needs work it stops polling.

## Scheduling policy

- A running or due operation causes a visible session to check revision at most once per second.
- Active tasks with no immediately due operation use the persisted wake time, capped at a ten-second visibility interval.
- Inactive scheduled work checks at its exact wake time.
- No active task and no outstanding operation means no session timer.
- Executor slices continue within their own operation and time budgets; they are not restarted by a full page refresh.
- A full page query runs only when revision changes, focus/manual explicitly requests it, or pagination changes the window.
- Active-task decisions use a full-database aggregate, never the currently visible page.

## UI semantics

`read.pending` covers only SQLite projection reads. `work.running` is displayed separately as background activity and does not disable scrolling, pagination, navigation, or unrelated actions. `lastCheckedAt` advances after a successful revision check; `lastChangedAt` advances only when the projection revision changes.

Automatic read failure keeps the last valid list and shows a non-modal stale indicator. Manual read failure additionally shows one alert. A command persistence failure shows an action-specific alert and does not apply optimistic success. Executor failures remain visible through operation/task error projections and scheduler backoff.

Video detail reads its persisted task and media projection before requesting work. Create submission, RootLayout foreground activation, network recovery, BackgroundTask, and Headless Service use command/wake or runner ports appropriate to their role; none use a compound `syncTaskRun()` that returns task records.

## Error and recovery behavior

- Network and timeout failures retain retryable operations and persisted next-wake times.
- A worker crash or expired lease allows another runtime to take over without duplicate domain effects.
- A media redirect to an unsafe address, invalid MIME, size overflow, or hash mismatch is rejected before publication.
- Native cancellation, timeout, and lease loss clean the active part and cannot commit success.
- Video validation keeps the current first-two-attempt retry and third-attempt terminal failure policy.
- CAS destination races, invalid targets, and quarantine recovery retain existing content-addressed ownership rules.
- A lost memory event is repaired by the next revision check.
- A projection read failure never replaces valid items with an empty list.

## Database migration

Schema v8 adds the projection revision metadata and task triggers, an index suitable for expired claims by `state` and `lease_expires_at`, and only the minimal persisted wake state required to coalesce maintenance. It initializes revision without rewriting tasks or media records. The not-yet-started D-Core schema work previously reserved for v8 moves to v9.

Tests cover a fresh database, v1.4.10 upgrade, interrupted migration recovery, read-only recovery mode, and preservation of jobs, tasks, operations, artifacts, blob references, deliveries, and CAS files.

## Verification

### Automated coverage

- Trigger tests prove every task insert, update, and delete advances revision.
- Session tests cover concurrent refresh coalescing, a guaranteed trailing read, stale-result rejection, cross-runtime revision discovery, second-page active tasks, stale recovery, object reuse, pagination, and disposal.
- Command tests prove durable acknowledgement precedes executor completion and repeated commands remain idempotent.
- Scheduler tests cover competing runtimes, new work during an active slice, exact wake times, budgets, maintenance coalescing, backoff, and lease recovery.
- Native tests cover safe downloads, redirect revalidation, MIME and size enforcement, timeouts, cancellation, hash mismatch, durable reread, and CAS race recovery.
- Route tests cover responsive manual refresh, overlapping focus/retry/poll signals, background completion, stale UI, and video detail hydration without executor blocking.
- Existing typecheck, Jest, Android JVM, instrumentation, fresh-install, and upgrade suites remain green.

### Performance acceptance

Use a release-equivalent Android build with at least 1,000 historical tasks and a video of at least 100 MiB.

- The list remains scrollable and interactive throughout download, hashing, probe, and publication.
- There is no ANR, multi-second input loss, or refresh control held until media completion.
- The first 40-row lightweight projection read has a target p95 below 150 ms on the recorded test device.
- A single JS event-loop stall during native media transfer has a target maximum below 250 ms.
- An unchanged revision performs no TaskCard reconstruction.
- Increasing history from 100 to 1,000 tasks does not make first-page reads or idle revision checks grow linearly.
- No active task or operation leaves no poll timer.
- CryptoJS video hashing and synchronous `File.write()` are absent from the production artifact-transfer path.

If a device cannot meet an absolute threshold, record its model and the same-scenario before/after measurements. Subjective smoothness alone is not acceptance evidence.

## Delivery order

1. Add timing instrumentation and failing regressions for the current blocking and dropped-refresh behavior.
2. Move artifact transfer, file writes, and both full-file hashes to the Android native executor.
3. Add projection revision, lightweight TaskCard queries, and global activity summaries.
4. Introduce task commands, scheduler wake, and bounded runner ports.
5. Implement TaskListSession with subscriptions, trailing reads, revision checks, and the bounded pagination window.
6. Migrate task list, video detail, create flow, RootLayout, connectivity recovery, BackgroundTask, and Headless Service away from `syncTaskRun()`.
7. Convert operation hot paths and maintenance/reconciliation batches to asynchronous, bounded SQLite work.
8. Add memoized task cards, stale/worker presentation, and remove the 250 ms UI executor poll.
9. Run the full automated, migration, Android, and recorded performance acceptance matrix.
10. Remove the legacy compound sync entry point and CryptoJS media-hash compatibility path after every caller has migrated.

Each stage is independently testable. Native media offload is deliberately first so the user-visible freeze can improve before the rest of the architecture migration is complete.
