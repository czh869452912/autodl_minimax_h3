# C-Closure 1.4.9 Hotfix Design

> Date: 2026-09-04 (Asia/Shanghai)
>
> Target release: 1.4.9
>
> Base: `dev` / v1.4.8 schema v6

## 1. Goal

Close the remaining C-stage media durability gap before D-Core: every automatic and manual artifact download or system-gallery delivery must run through the durable operation ledger, lease fencing, transactional projections, and restart recovery.

The hotfix remains a schema-v6 release. It does not introduce the D product domain or pre-allocate v7 tables. After release, D-Core starts from the 1.4.9 merge commit and owns the v6-to-v7 migration.

## 2. Context and decisions

The v1.4.8 C-Core executor provides durable `ARTIFACT_DOWNLOAD` and `EXPORT` operations, CAS storage, blob references, delivery snapshots, bounded cycles, and recovery. However, the task list and video detail routes still call the legacy media helpers directly. Those helpers download, publish, and update the same task/media projections without participating in the operation ledger or CAS lifecycle.

This split permits last-writer-wins races, stale CAS references, delayed garbage collection, and duplicate delivery behavior. It also prevents D-Core Task 3 from safely treating the C-Core CAS as the authority for new `AssetVersion` records.

AutoDL artifact URLs cannot use a fixed AutoDL hostname allowlist. In production, AutoDL selects an available storage node from its CDN/storage cluster, and returned hostnames may be machine-room storage endpoints without an AutoDL prefix. Version 1.4.9 therefore records dynamic public CDN hosts as an accepted provider compatibility constraint and preserves capability-based validation rather than adding a fixed hostname filter.

## 3. Scope

### 3.1 Included

- Add one media command service as the only UI-facing entry point for manual download, retry, and system-gallery delivery.
- Route manual work through durable `ARTIFACT_DOWNLOAD` and `EXPORT` operations.
- Atomically persist an operation and its `tasks`/`media_assets` queued projections.
- Preserve completed and failed operations as audit history; an explicit retry creates a new operation attempt record rather than reopening a terminal row.
- Carry an optional delivery intent on a download operation so a manual save can download and then enqueue export as one durable chain.
- Freeze `keepPrivateCopy` and the delivery target in the operation payload at request time.
- Support durable export from a valid pre-v1.4.9 private legacy file without inventing a CAS reference.
- Replace message-regex retry detection with structured artifact error codes.
- Remove the unused legacy coordinator/media queue after production references are gone and replacement regressions pass.
- Record and test the accepted dynamic-CDN security boundary.
- Complete targeted Android build, upgrade, recovery, and delivery acceptance for the affected paths.

### 3.2 Excluded

- D-Core `projects`, `prompt_revisions`, `assets`, `asset_versions`, and `project_links` tables or UI.
- Schema v7 or another schema-v6 migration.
- UNKNOWN replacement confirmation UI. The existing domain action remains available for a later D UI slice.
- Batch/Variant, collaboration, archive import/export, or complex workflow UI.
- Scheduler query optimization or a new reconciliation cursor/KV table.
- A fixed allowlist for AutoDL storage-node hostnames.

## 4. Architecture

### 4.1 Media command service

The task list and video detail routes call a single media command service. They may request work and observe repository projections, but they must not call native publication, download transport, or projection write methods directly.

The service resolves the canonical job, artifact, media asset, existing operation, local source, and delivery before deciding whether to return an existing result or append new work. Decisions and projection changes that precede I/O occur inside one immediate SQLite transaction.

The executor remains the only component allowed to perform remote transfer, CAS publication, native MediaStore publication, terminal projection updates, reference release, or retry scheduling.

### 4.2 Operation identity and explicit retry

Normal provider completion retains the existing canonical operation key:

- `artifact:<jobId>:<artifactId>`
- `export:<jobId>:<artifactId>:system-gallery`

Manual commands apply these rules:

1. If matching work is `PENDING` or `CLAIMED`, return it and do not append another operation.
2. If the requested result already exists and its file/delivery is valid, return a completed no-op result.
3. If a previous canonical or manual operation is terminal but the result is missing or failed, append a new operation with a monotonically selected retry generation in its id and idempotency key.
4. Select the retry generation and insert the new operation in the same immediate transaction. A concurrent second command observes the newly pending operation and returns it.
5. Never mutate `FAILED`, `BLOCKED`, or `SUCCEEDED` rows back to `PENDING`; terminal rows remain audit evidence.

This is user-request idempotency, not permanent suppression of retries: repeated taps for the same in-flight intent collapse, while a later explicit retry after a terminal failure creates a traceable new attempt.

Manual retry keys use explicit suffixes such as `artifact:<jobId>:<artifactId>:manual:<generation>` and `export:<jobId>:<artifactId>:system-gallery:manual:<generation>`. Generation allocation searches all matching canonical/manual operations while holding the write transaction; it does not rely on wall-clock uniqueness.

## 5. Data flows

### 5.1 Manual download

1. Resolve the primary video artifact from `workflow_artifacts`; use a normalized legacy media artifact only when an older task has no canonical artifact.
2. Validate that a remote source exists and originates from the trusted installed adapter/projection boundary.
3. If a valid CAS-backed local source already exists, return completed without writing. Valid means the file exists at the recorded CAS path, its blob metadata exists, and the expected workflow-artifact reference is present.
4. If matching download work is pending or claimed, return the existing operation.
5. Otherwise append an `ARTIFACT_DOWNLOAD` operation and set task/asset state to `ENQUEUED` in one transaction.
6. Trigger one bounded foreground executor cycle. The UI continues to render state from persisted projections and remains correct if the cycle finishes after navigation or process restart.
7. The executor streams into CAS, verifies content, commits blob/ref/projections atomically, and optionally appends an export requested by the payload delivery intent.

### 5.2 Manual save to gallery

For a valid CAS-backed private source, append or reuse a durable `EXPORT` operation whose payload contains the source URI, blob hash, deterministic delivery identity, display name, and frozen `keepPrivateCopy` value.

When no valid private source exists, append or reuse an `ARTIFACT_DOWNLOAD` operation with a `system-gallery` delivery intent. Artifact commit then appends `EXPORT` regardless of the global auto-export setting, using the policy captured by the user action.

For a valid legacy private source outside CAS, append a durable export marked as a legacy source. It still uses the operation lease, deterministic delivery id, native publication fencing, and transactional task/media/delivery commit. It has no blob hash and therefore performs no CAS reference release. New downloads never use this compatibility path.

If a matching delivery is already pending, claimed, or successfully recorded, another tap does not publish again. A terminal failed export may be explicitly retried through a newly appended operation while retaining the same deterministic `media_deliveries` identity.

### 5.3 Automatic delivery

Automatic and manual delivery use the same handlers and stores. The only difference is the origin and frozen policy in the enqueue payload. Changing application settings after enqueue does not mutate an existing operation's behavior.

## 6. Error model

Download policy and transport failures expose stable structured codes. At minimum, the design distinguishes:

- connect timeout;
- idle timeout;
- transient network/fetch failure;
- CAS GC contention;
- HTTPS, redirect, private-network, MIME, size, and integrity rejection;
- missing job, artifact, media projection, or source.

The artifact handler classifies retryability by code, never by localized message text. Persisted operation, job, and UI messages remain redacted and must not contain signed URL query values, authorization data, or provider credentials.

Transient failures retain bounded exponential backoff. Policy, integrity, and missing-input failures are terminal until a new explicit user command is valid.

## 7. Dynamic AutoDL CDN boundary

Dynamic provider-supplied public hosts remain enabled because a fixed AutoDL-prefix allowlist is incompatible with the observed storage-cluster behavior. Acceptance depends on all of the following controls:

- only a trusted, installed adapter may opt into provider-supplied public artifact hosts;
- artifact transport permits HTTPS and rejects local/file/content/custom schemes;
- the initial URL and every redirect are validated;
- private, loopback, link-local, and otherwise non-public destinations are rejected;
- artifact requests do not forward provider authorization headers, application cookies, or other credentials to the storage host;
- MIME, maximum-byte, connect-timeout, idle-timeout, and integrity controls remain enforced;
- persisted diagnostics redact signed query parameters and other secrets.

M6 is therefore an accepted compatibility/security trade-off with explicit controls, not an unfinished fixed-domain allowlist task. If later D or post-D work permits untrusted third-party adapters or arbitrary user-provided artifact URLs, this decision must be reopened as a security gate.

## 8. UI behavior

Pressing download or save immediately persists the intent and shows the queued state. The screen may kick a foreground cycle for responsiveness, but it does not depend on that call completing. Navigation, app backgrounding, or process termination cannot lose the request.

Buttons derive disabled/busy state from persisted pending/claimed operations and projections, not only an in-memory set. A failed terminal state exposes the existing retry action; retry appends a new auditable operation. Success and error labels continue to come from presentation mapping rather than persisted localized strings.

## 9. Verification strategy

### 9.1 Unit tests

- repeated and concurrent taps collapse onto one in-flight download/export;
- an explicit retry after terminal failure appends a new operation and preserves the old row;
- retry-generation allocation is transactional;
- manual delivery intent survives download and enqueues exactly one export;
- `keepPrivateCopy` is frozen at enqueue time;
- a valid existing CAS result is a no-op;
- legacy private-source export is durable and performs no CAS release;
- structured error codes produce the expected retryable/terminal disposition;
- dynamic public CDN validation accepts public HTTPS nodes but rejects unsafe schemes, private destinations, and unsafe redirects.

### 9.2 Real SQLite integration tests

- automatic delivery racing a manual tap produces one artifact result and one delivery;
- manual download racing task deletion is fenced without orphan projections or files;
- export racing task deletion or CAS collection is fenced;
- missing CAS files are reconciled and an explicit retry creates a fresh operation;
- `keepPrivateCopy=false` releases exactly the owned blob reference only after successful publication;
- process recovery resumes pending download/export without duplicate native publication;
- legacy rows remain readable and exportable without being treated as new CAS authority;
- no production route imports or calls the legacy direct media execution helpers.

### 9.3 Android device acceptance

Use a real short-path checkout and the supported JDK/ABI combination. Record evidence for:

1. auto-export enabled and disabled;
2. private copy retained and released;
3. manual download, manual save, and retry after controlled failure;
4. force-stop after native publication but before SQLite success commit, followed by recovery without a duplicate MediaStore item; use a debug-only fault-injection seam immediately after native publication so the timing window is deterministic, and exclude that seam from production behavior;
5. v1.4.8-to-v1.4.9 in-place upgrade with existing tasks, private videos, and gallery deliveries preserved;
6. repair of a seeded missing media asset or delivery projection;
7. fresh install startup and media flow with no fatal SQLite/native exception.

The user's broad v1.4.8 manual testing supports release confidence but does not replace the targeted restart-window and upgrade cases above.

### 9.4 Carried stabilization device acceptance

Because this release is the C-stage closure, it also executes the device checks that remain pending in the post-merge stabilization verification: multi-image identity/removal/mention behavior, duplicate-title history navigation and visible Timeline counts, runtime replacement or deletion during generation, detached long-stream viewport behavior, return-to-latest, provider-error and stopped-run retry, clipboard inspection, and suggestion focus/send separation.

These are verification scope, not permission for unrelated redesign. If a check fails, the release stops; the failure receives a focused diagnosis and its fix is reviewed for scope before being added to 1.4.9.

## 10. Release gate

Release 1.4.9 only when:

- TypeScript and the complete Jest suite pass;
- focused media-command, executor, recovery, reconciliation, and route suites pass;
- Android short-path debug/release-equivalent build succeeds;
- fresh install and v1.4.8 upgrade device checks pass;
- the device matrix in section 9.3 is recorded;
- the carried stabilization device checks in section 9.4 are recorded;
- diff validation, secret scan, and production-reference scan pass;
- no production UI directly invokes legacy media download/publication helpers;
- the verification record names M6 as the accepted dynamic-CDN boundary and lists any unrelated deferred observations explicitly.

The hotfix is not a vehicle for D product-domain work. D-Core begins only after the hotfix is merged and tagged, using that exact schema-v6 baseline for Task 1's v7 migration.

## 11. Deferred work and D handoff

The UNKNOWN replacement confirmation UI is added to the D UI/traceability planning rather than this hotfix. Scheduler due-query optimization, a dedicated reconciliation cursor table, registry race hardening, and other minor observations remain evidence-driven follow-up work.

D-Core Task 3 must consume the authoritative CAS/reference interface established by 1.4.9 and must not reintroduce direct legacy media writes. Legacy task/media rows remain compatibility projections, not authorities for new Project or AssetVersion data.
