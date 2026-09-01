# Local-First Workflow Architecture Design

**Status:** Design approved in conversation; awaiting written-spec review  
**Date:** 2026-09-01  
**Scope:** Mobile application architecture for local execution, multi-workflow registration, AutoDL/native ComfyUI providers, future Git workflow subscriptions, and roadmap-compatible domain evolution.

## 1. Goals and non-goals

### Goals

The application remains local-first and does not introduce an application backend or cloud management service. SQLite, the execution queue, the workflow registry, project metadata, and the local asset store are authoritative on the device.

The only permitted network dependencies are:

1. User-configured LLM APIs.
2. User-configured generation APIs such as AutoDL or a native ComfyUI endpoint.
3. A fixed, user-approved Git repository used to distribute signed, declarative workflow packages.

The architecture must support the README roadmap incrementally:

- multiple workflows;
- agent-created jobs;
- projects, prompts, assets, and immutable revisions;
- batch/variant generation;
- local cost/quota policy;
- export, backup, and optional future sync/collaboration infrastructure.

### Non-goals

- No cloud database, account service, remote job orchestrator, webhook receiver, or cloud admin console.
- No arbitrary executable code downloaded from Git.
- No immediate adoption of Temporal, Argo, CRDT, or a mandatory synchronization service.
- No assumption that the AutoDL wrapper exposes native ComfyUI WebSocket, upload, queue, or cancellation routes.

## 2. Architectural principles

1. **Local state is authoritative.** Network calls update local state; they do not become the source of truth.
2. **Declarative workflows, compiled execution.** A workflow package describes schema, UI, bindings, capabilities, and outputs. It is compiled into an immutable provider-neutral plan before submission.
3. **Provider capabilities are explicit.** UI and runtime may only use operations declared by the selected adapter.
4. **Remote identifiers are opaque.** Provider task/result/cancel URLs are stored as returned; the client does not reconstruct undocumented paths.
5. **At-least-once local execution is safe.** Every operation has an idempotency fingerprint, lease, attempt counter, and persisted retry time. Unknown provider outcomes are reconciled, not blindly resubmitted.
6. **Large data is content addressed.** Local files are stored in a CAS keyed by SHA-256; database rows contain metadata and references, not large Base64 payloads.
7. **Installed workflow versions are immutable.** Updates install a new version and move an active pointer; existing jobs retain the exact workflow hash used for compilation.
8. **Security boundaries are explicit.** HTTPS, host allowlists, size/MIME limits, signed Git commits, package hashes, and secret redaction are enforced before network or file operations.

## 3. Component architecture

```text
UI / Agent
    ↓
Application services
    ↓
Workflow Registry + Schema/Binding Compiler
    ↓
WorkflowPlan (provider-neutral IR)
    ↓
Provider Adapter (AutoDL / native ComfyUI / LLM)
    ↓
Durable Local Executor
    ↓
SQLite snapshots + JobEvent log + local CAS
    ↓
UI projections and export
```

### 3.1 Workflow Registry

The registry owns source configuration, installed versions, active pointers, compatibility checks, staged activation, and rollback. CreateForm and Agent must resolve workflow definitions through the registry; they may not import `h3Definition` or other provider-specific constants directly.

### 3.2 Schema and binding compiler

The compiler supports a documented JSON Schema subset (objects, arrays, strings, numbers, booleans, enum, required, min/max, minLength/maxLength, items, and conditional visibility metadata) plus a separate UI schema. Bindings use RFC 6901 JSON Pointer rather than ambiguous dotted paths. Compiled validators and binding functions are cached by package content hash.

Compilation rejects malformed schemas, unknown adapters, unsupported capabilities, invalid media references, missing required outputs, and incompatible app/adapter versions before a job is created.

### 3.3 Provider adapters

```ts
interface ProviderAdapter {
  inspect(definition: WorkflowDefinition): ProviderCapabilities;
  prepareInputs(inputs: MediaRef[]): Promise<PreparedInput[]>;
  submit(plan: WorkflowPlan): Promise<JobHandle>;
  getStatus(handle: JobHandle): Promise<NormalizedStatus>;
  cancel?(handle: JobHandle): Promise<void>;
  fetchArtifacts(handle: JobHandle): Promise<ProviderArtifact[]>;
}
```

`JobHandle` preserves provider URLs and expiry information:

```ts
type JobHandle = {
  providerTaskId: string;
  statusUrl?: string;
  resultUrl?: string;
  cancelUrl?: string;
  expiresAt?: string;
};
```

The initial built-in adapters are:

- `autodl-comfyui`: AutoDL submit/result wrapper, URL or controlled data-URI inputs, polling, expiring result URLs, no assumed cancellation/WebSocket.
- `comfyui-native`: multipart upload, `/prompt`, `/ws`, `/history`, `/view`, `/queue`, and `/interrupt` when the endpoint advertises them.
- `openai-compatible`: LLM requests only; credentials remain user-owned SecureStore entries.

The adapter SPI and version negotiation are prepared for future plugins, but Git packages cannot install executable adapters. A new adapter is shipped with an app release until a separately reviewed, sandboxed plugin mechanism exists.

### 3.4 Durable local executor

The executor is database-driven rather than timer-only. Submit, poll, download, export, retry, and delete are operation records with leases and persisted scheduling. It survives process death and Android service restarts.

Job state machine:

```text
DRAFT → VALIDATED → SUBMITTING → QUEUED → RUNNING
                                      ↓
                  SUCCEEDED / PARTIAL / FAILED / CANCELLED
                  UNKNOWN / EXPIRED
```

`UNKNOWN` means the provider outcome is not known; the executor reconciles the original handle and never automatically duplicates a potentially billable request.

### 3.5 Artifact CAS

Provider artifacts are downloaded promptly into a temporary file, validated, hashed, and atomically renamed into the local CAS. The database stores a stable `AssetVersion` reference. Provider URLs are retained only as provenance and are not the local identity.

## 4. Workflow package and Git subscription

Each package is a declarative directory containing:

```text
manifest.json
input.schema.json
ui.schema.json
bindings.json
outputs.json
provider.json
signature.json
```

The manifest envelope is:

```json
{
  "apiVersion": "workflow.autodl/v1",
  "kind": "Workflow",
  "metadata": {
    "id": "minimax_h3_image_audio_to_video_v2_15s",
    "version": "1.0.0",
    "contentHash": "sha256:...",
    "channel": "stable",
    "deprecated": false
  },
  "spec": {
    "adapter": { "id": "autodl-comfyui", "version": "^1.0.0" },
    "inputSchema": "input.schema.json",
    "uiSchema": "ui.schema.json",
    "bindings": "bindings.json",
    "outputs": "outputs.json",
    "capabilities": {},
    "limits": {},
    "compatibility": { "minAppVersion": "1.0.0" }
  },
  "signature": {}
}
```

Source configuration contains a fixed repository URL, allowed ref/channel, and trusted signing-key fingerprints. Update processing is:

```text
fetch fixed ref → verify Git commit signature → verify package hash
→ validate package and adapter compatibility → stage locally
→ atomically install → move active pointer
```

The previous active version remains usable if any step fails. Git refresh is optional and never required for existing workflows or local data access.

## 5. AutoDL contract

AutoDL exposes a two-step wrapper: POST a workflow request and GET the result by task ID. Its result URLs can expire and must be downloaded promptly. The H3 metadata currently exposes `ref_image_0..8`, `ref_audio_0..2`, duration 1–15, prompt length 1–10000, seed bounds, and accepted MIME types. The existing 1-based mapping is therefore a correctness defect; bindings must be metadata/package-driven. Status normalization accepts `QUEUED`, `RUNNING`, `SUCCESS`, `SUCCEEDED`, `COMPLETED`, `COMPLETE`, `FAILED`, and `CANCELLED`.

The app will maintain contract fixtures and optional live-token tests for metadata shape, 0-based binding, boundary validation, status casing, result URL extraction, and expired results. Public API documentation does not establish a universal per-file upload limit; client limits therefore come from provider capabilities/metadata and measured request size. Data URI is a fallback, not the primary asset transport.

References: [AutoDL ComfyUI API](https://autodl.art/docs/comfyui_api/), [H3 workflow metadata](https://www.autodl.art/api/v1/comfyui/workflows/minimax_h3_image_audio_to_video_v2_15s), [native ComfyUI routes](https://docs.comfy.org/development/comfyui-server/comms_routes).

## 6. Security and transport rules

- Release builds use a dedicated release/upload key; debug keystore is never used for release and private keys are not tracked.
- Production network security is HTTPS-only. Localhost exceptions, if needed, exist only in debug configuration.
- User LLM/provider keys are SecureStore references and are redacted from logs, events, crash payloads, and exported project data.
- Provider input/output URLs require HTTPS and an adapter-specific host allowlist; private IP, localhost, file URI, arbitrary redirects, and unbounded responses are rejected.
- Downloads enforce timeout, redirect count, maximum bytes, MIME sniffing, temporary-file cleanup, and optional checksum verification.
- Media refs record source, MIME, byte size, and SHA-256. Base64 serialization normalizes MIME and alphabet and is rejected when it exceeds request limits.
- Android backup excludes secrets and transient job state unless explicitly exported by the user.
- Git packages are data-only and require trusted commit signature plus content hash before activation.

## 7. Local data model and migration

Target tables are:

```text
workflow_sources
workflow_packages
workflow_active
projects
prompt_revisions
assets
asset_versions
generation_batches
generation_variants
workflow_jobs
step_runs
job_events
operations
```

`PromptRevision` and `AssetVersion` are immutable. `WorkflowJob` stores the workflow package hash and compiled plan hash. `JobEvent` is append-only; snapshot tables serve fast UI reads. `Operation` stores lease owner/expiry, attempt, `nextRetryAt`, and idempotency key.

Migration policy from the current schema:

1. Introduce a transactional, versioned migration runner and pre-migration backup.
2. Add target tables while retaining legacy jobs/tasks/media tables.
3. Map legacy TaskRecord rows to WorkflowJob/AssetVersion projections.
4. Dual-read during one compatibility window and write the new model as the source of truth.
5. Switch UI and executor reads to the new model.
6. Keep legacy projections until an explicitly versioned removal migration; never drop tables as part of a normal upgrade.

Failed migrations enter read-only recovery with diagnostic export rather than clearing user data.

## 8. Performance and reliability budgets

- No `Promise.all` conversion of an unbounded media selection; media preparation is streamed and bounded.
- Active jobs and events are paginated and indexed by status/nextRetryAt.
- Polling uses exponential backoff with jitter, honors `Retry-After`, and caps provider concurrency.
- One operation lock covers download/export so UI actions cannot duplicate queue work.
- Job updates use compare-and-swap version checks to prevent monitor overlap.
- Background monitoring schedules the next pass after the previous pass completes.
- Long agent histories are summarized and paginated; attachments are Asset references.
- CAS deduplicates identical input/output files and permits cleanup by reference count.

## 9. Roadmap mapping

### M0 — security and contracts

Release signing, HTTPS-only, backup rules, URL/download policy, AutoDL fixtures/live contract tests, and the 0-based/completed fixes.

### M1 — registry and compiler

WorkflowPackage, active pointers, Git trust verification, schema/UI separation, binding compiler, and Registry-driven CreateForm.

### M2 — provider adapters

AutoDL and native ComfyUI adapters, capability negotiation, media preparation, status/cancel/stream semantics, and artifact normalization.

### M3 — durable executor

Job/Operation/Event persistence, leases, CAS, retries, UNKNOWN reconciliation, queue pagination, and Android restart recovery.

### M4 — product domain

Project, PromptRevision, AssetVersion, local CAS, history, backup/export, and compatibility projections.

### M5 — agent and batch

GenerationBatch/Variant, bounded local DAG execution, concurrency and budget gates, and local cost/quota policy.

### M6 — optional sync/collaboration infrastructure

Only if later required: local outbox/cursor, metadata/blob separation, conflict prompts, optional E2EE, members, reviews, and comments. This phase does not imply a mandatory cloud service.

## 10. Acceptance tests

The implementation is accepted only when these are automated:

- Release signing and HTTPS configuration checks.
- AutoDL metadata fixture and live contract tests, including `ref_image_0`, `ref_audio_0`, and `completed`.
- Full schema, nested value, MIME, size, enum, binding, output, and capability validation.
- Provider URL allowlist, redirect, MIME, size, timeout, hash, and expiry tests.
- Duplicate submit, timeout-to-UNKNOWN, lease contention, restart recovery, retry/backoff, and operation-lock tests.
- Migration upgrade, idempotent rerun, failure recovery, and legacy-row mapping tests.
- Registry staged activation, signature failure, hash failure, compatibility failure, rollback, and offline behavior tests.
- Existing TypeScript and Jest suites remain green; Android build is run in an environment with Java/Android SDK and its result is recorded.

## 11. Implementation decomposition

The work is intentionally split into four independently testable plans:

1. **Safety and provider contracts** — P0 fixes, media/download policy, AutoDL contract.
2. **Workflow kernel** — package envelope, Registry, Git trust, compiler, dynamic CreateForm.
3. **Durable executor** — operations, state machine, adapters, CAS artifacts, background recovery.
4. **Domain expansion** — projects, revisions, assets, batch/agent, local backup and future outbox.

Each plan follows test-first development and preserves the no-server constraint.

### B 阶段落地说明

当前 B 阶段采用 `WorkflowPackage -> compiler -> WorkflowDefinition/Runtime -> adapter` 的单向边界。设备端 Registry 只持久化不可变 `(workflowId, version, contentHash)`，并以 `active/previous` 指针切换和回滚；CreateForm 不再直接依赖 provider workflow 常量。

Git 订阅使用固定 HTTPS GitHub 仓库、固定 ref 和不可变 commit SHA。发布清单以 Ed25519 `commit-attestation` 签名，签名载荷绑定 repository、ref、commit、tree hash 与 package entries；客户端在安装前验证签名、package hash、schema 与兼容性，再进行 staged upsert/active 切换。B 阶段不执行远程脚本，也不依赖 GitHub API 或自建服务；原生 GPG/SSH Git commit 格式验证保留为未来可替换的 `CommitVerifier` 实现。
