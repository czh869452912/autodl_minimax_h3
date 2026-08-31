# Multi-workflow Support: M1/M2 Design

## Scope

This specification covers only the first two milestones of the multi-workflow roadmap:

- **M1 — Schema and Registry foundation:** define a versioned, declarative workflow contract; validate it; discover workflows from built-in, local, and signed remote sources; and cache/activate definitions safely.
- **M2 — Renderer and H3 runtime migration:** render the existing MiniMax H3 create flow from its definition and move AutoDL submission/status handling behind a platform adapter and generic job/artifact model.

M3 (full Prompt Assistant drafts and attachment binding), additional platform adapters such as NovelAI, composite/DAG execution, and agent-initiated submission are explicitly out of scope. M1/M2 must leave stable extension points for them without implementing them.

## Goals and success criteria

The app should evolve from a single H3-specific form into a workflow workbench without losing the current user-visible behavior.

Success means:

1. A workflow can be described by a declarative, versioned config rather than a hard-coded React form.
2. Built-in, local-imported, and remote workflows use the same validator and registry model.
3. Remote definitions cannot execute code, change trust roots, or call arbitrary endpoints.
4. The H3 create flow is rendered from a definition and submitted through an `autodl-comfyui` adapter.
5. Existing H3 task creation, polling, download, gallery, retry, and old-task viewing continue to work.
6. Every new job records the exact workflow version/content hash and normalized input snapshot used at submission time.

## Architectural principles

- **Schema-first:** input structure and validation are data; rendering is an app concern.
- **Declarative config only:** configs contain metadata, schemas, finite UI hints, capability references, request bindings, and output mappings. They do not contain JavaScript, arbitrary HTTP URLs, component paths, or plugin code.
- **Adapter-owned platform behavior:** authentication, upload, request signing, queue semantics, polling, cancellation, retry, and provider-specific error mapping stay in built-in platform adapters.
- **Immutable definitions:** changing a workflow creates a new version. Existing jobs never silently change meaning.
- **Artifact-centric results:** jobs may produce images, video, audio, text, files, or JSON; the storage model must not assume a video URL.
- **Local-first and recoverable:** registry cache and job records remain usable across restarts and transient network failures.

## Domain model

### `PlatformAdapterManifest`

An app-bundled manifest describing one platform adapter:

```ts
type PlatformAdapterManifest = {
  id: string;                         // e.g. "autodl-comfyui"
  adapterVersion: string;
  platforms: string[];                // e.g. ["autodl"]
  capabilities: string[];             // submit, poll, cancel, estimate, upload...
  credentialKinds: string[];          // e.g. ["autodl-token"]
  operations: string[];               // e.g. ["workflow.submit"]
  supportedArtifactKinds: ArtifactKind[];
};
```

The manifest is code-owned. A workflow config may reference an adapter and operation only if the installed manifest exposes them.

### `WorkflowDefinition`

Canonical transport/storage format is JSON. Local YAML import is allowed only as an input format and is normalized to the canonical JSON representation before validation, hashing, and storage.

```ts
type WorkflowDefinition = {
  schemaVersion: "1.0";
  id: string;
  version: string;                    // immutable semver-like value
  kind: "atomic" | "composite";
  platform: {
    adapter: string;
    operation: string;
  };
  metadata: {
    title: string;
    category: "image" | "video" | "audio" | "text" | "other";
    description?: string;
    icon?: string;
    tags?: string[];
  };
  inputs: JsonSchemaSubset;
  ui?: WorkflowUiSchema;
  request: RequestMapping;
  outputs: OutputMapping;
  compatibility?: Compatibility;
  // Reserved for later composite execution; rejected for M1/M2 activation.
  steps?: unknown[];
  bindings?: unknown[];
};
```

`inputs` is a restricted JSON Schema 2020-12 subset: object/array/string/number/integer/boolean, `required`, `properties`, `items`, `enum`, `const`, `default`, `description`, `minLength`, `maxLength`, `minimum`, `maximum`, `minItems`, `maxItems`, and simple `allOf`/conditional predicates needed by the renderer. `$ref` is allowed only for local `$defs`; remote references are forbidden.

`x-workflow-*` extensions are namespaced and allowlisted. Initial fields are:

```text
x-workflow.semantic: prompt | negativePrompt | image | image[] | audio | audio[] |
                     video | text | number | integer | boolean | enum | seed
x-workflow.multiline: boolean
x-workflow.widget: text | textarea | segmented | select | stepper | toggle |
                      number | seed | asset | asset-list
x-workflow.acceptMime: string[]
x-workflow.maxItems: number
x-workflow.visibleWhen: { field: string, equals|in|exists: unknown }
```

Unknown extensions, unknown widgets, arbitrary expressions, and component/module references invalidate a definition.

### `WorkflowDraft`

M1/M2 use drafts internally for the create form, but do not expose full Agent draft export yet:

```ts
type WorkflowDraft = {
  workflowId: string;
  workflowVersion: string;
  contentHash: string;
  inputs: Record<string, unknown>;
  source: "user" | "import";
  status: "incomplete" | "ready";
};
```

Attachment binding and Agent-created drafts are deferred to M3. M2 may represent existing H3 media inputs in the generic input snapshot, but the current picker remains user-driven.

### `JobRecord` and `ArtifactRecord`

```ts
type JobRecord = {
  id: string;                         // local stable id
  workflowId: string;
  workflowVersion: string;
  workflowContentHash: string;
  adapterId: string;
  adapterVersion: string;
  inputSnapshot: Record<string, unknown>;
  remote?: { providerJobId?: string; rawStatus?: string };
  status: JobStatus;
  error?: NormalizedError;
  createdAt: number;
  updatedAt: number;
};

type ArtifactRecord = {
  id: string;
  jobId: string;
  kind: "image" | "video" | "audio" | "text" | "file" | "json";
  uri?: string;
  mime?: string;
  metadata?: Record<string, unknown>;
};
```

The existing video-specific fields remain readable during migration. New writes use the generic fields and may populate compatibility projections (`videoUrl`, `localUri`, etc.) until consumers are migrated.

## M1: Schema and Registry foundation

### Registry layers

The local registry stores one normalized record per `(workflowId, version, contentHash)` and tracks its source:

```text
builtin       app-bundled safety baseline
local-import  explicitly imported by the user
remote        downloaded from a trusted signed registry
```

Source precedence applies only when selecting a conflicting definition. A local import cannot replace a built-in definition with the same ID; it can add a new ID/version. Remote versions are candidates until explicitly activated or an approved update policy selects them.

Registry metadata and definitions are separate:

```text
GET /registry/index.json
GET /registry/workflows/{id}/{version}.json
GET /registry/workflows/{id}/{version}.sig
```

The index contains available versions, required adapter/capability, compatibility range, content hash, signature metadata, deprecation state, and changelog. The definition is fetched by hash-addressed version and never trusted solely because it appeared in the index.

### Trust and validation

The app bundles a registry keyring containing `registryId`, Ed25519 public key, status (`active`/`revoked`), and validity window. Registry endpoints are HTTPS and domain-allowlisted in app code. Remote content cannot change the keyring, endpoint allowlist, adapter code, or credential scopes.

Activation pipeline:

1. Fetch index over HTTPS with bounded size and timeout.
2. Verify index signature and key validity.
3. Fetch definition and detached signature.
4. Verify definition signature and SHA-256 content hash.
5. Parse JSON (or normalize imported YAML to JSON).
6. Validate schema version, size/depth limits, JSON Schema subset, and `x-workflow` allowlist.
7. Verify adapter, operation, capabilities, and app compatibility.
8. Write definition and metadata transactionally; only then expose it to discovery/renderer.

Any failure leaves the previously active definition untouched and produces a typed registry error. Untrusted local imports follow the same structural validator but are marked `untrusted-local`; M1/M2 allow manual use while showing source/trust status. Automatic remote activation of unsigned or revoked content is prohibited.

### Versioning and rollback

- `version` and `contentHash` are immutable.
- A job stores both values; registry cleanup must retain definitions referenced by local jobs.
- The registry keeps the last known-good active version and can roll back atomically.
- Deprecation prevents new selection but does not invalidate existing jobs.
- Compatibility checks include `schemaVersion`, minimum app version, required adapter version/capability, and supported artifact kinds.

### M1 acceptance tests

- Built-in H3 definition is discovered and validates.
- Valid local JSON/YAML import becomes discoverable after normalization.
- Invalid schema, unknown widget/extension, excessive size/depth, unsupported adapter, bad signature, hash mismatch, revoked key, and incompatible app version are rejected.
- Remote update failure does not alter the active definition.
- Version rollback restores the previous active definition.
- Registry records survive app restart and preserve content hashes.

## M2: Renderer and H3 runtime migration

### Runtime boundaries

```text
WorkflowRenderer -> WorkflowDraft -> WorkflowRuntime -> PlatformAdapter
                                              -> JobRepository / ArtifactRepository
```

`WorkflowRenderer` knows schema and finite UI semantics, not AutoDL endpoints. `WorkflowRuntime` validates drafts, builds previews, maps inputs, generates an idempotency key, persists the immutable snapshot, and coordinates adapter calls. `PlatformAdapter` knows AutoDL protocol details.

```ts
interface PlatformAdapter {
  manifest(): PlatformAdapterManifest;
  validateCredentials(ctx: AdapterContext): Promise<CredentialStatus>;
  submit(request: NormalizedSubmitRequest): Promise<RemoteJobHandle>;
  getStatus(job: RemoteJobHandle): Promise<NormalizedJobUpdate>;
  cancel?(job: RemoteJobHandle): Promise<void>;
}

interface WorkflowRuntime {
  validateDraft(workflow: WorkflowDefinition, draft: WorkflowDraft): ValidationResult;
  preview(workflow: WorkflowDefinition, draft: WorkflowDraft): SubmissionPreview;
  submit(workflow: WorkflowDefinition, draft: WorkflowDraft, options: SubmitOptions): Promise<JobRecord>;
  sync(job: JobRecord): Promise<JobRecord>;
}
```

M2 implements only the `autodl-comfyui` adapter and the `workflow.submit` operation. No generic HTTP adapter is introduced.

### H3 definition mapping

The existing H3 fields map as follows:

```text
prompt      -> inputs.prompt
resolution  -> inputs.resolution
duration    -> inputs.duration
seed        -> inputs.seed
images      -> inputs.references.images[]
audios      -> inputs.references.audios[]
```

The request mapping translates these canonical paths into the current AutoDL payload (`prompt`, `resolution`, `duration`, `seed`, `ref_image_N`, `ref_audio_N`). The adapter retains current token handling, response normalization, timestamp parsing, polling, and video URL extraction; those details no longer live in the form component.

### Renderer contract

The renderer registry is app-owned and keyed by semantic type, not arbitrary config-supplied component names:

```ts
type FieldRenderer = {
  semantic: FieldSemantic;
  render(ctx: FieldRenderContext): React.ReactNode;
};
```

Initial native renderers cover prompt textarea, enum segmented control, numeric stepper/input, seed input, boolean toggle, single/multiple asset picker, and read-only help text. Section order and field order come from `ui.sections`; spacing, colors, typography, accessibility, and interaction conventions remain app-owned.

Conditional visibility uses a small declarative predicate evaluator. It must be deterministic, bounded, and side-effect free. Unsupported predicates fail validation rather than being ignored.

### Job lifecycle and idempotency

M2 normalizes provider states into:

```text
DRAFT -> VALIDATING -> READY_TO_SUBMIT -> SUBMITTING -> QUEUED -> RUNNING
                                                        \-> SUCCEEDED
                                                        \-> FAILED / CANCELLED / UNKNOWN
```

Before adapter submission, runtime writes a `SUBMITTING` record containing workflow version, content hash, input snapshot, adapter version, and a stable idempotency key derived from the local job ID. A local submission lock prevents concurrent duplicate sends. If the network result is ambiguous, the job becomes `UNKNOWN` and is reconciled through adapter lookup/retry rules; the UI must not silently create a second job.

### Data migration

1. Add generic workflow/job/artifact types and repository columns/tables without deleting existing task fields.
2. Ship the built-in H3 definition and adapter behind the existing create route.
3. Convert `CreateForm` state to a draft that the H3 schema renderer owns.
4. Route submit/status through `WorkflowRuntime` and `autodl-comfyui`.
5. Keep compatibility projections for existing task list, video detail, download, gallery, export, and retry consumers.
6. Backfill `workflowId`, version, and content hash for new jobs; legacy jobs retain a `legacy-h3` marker when exact historical config is unavailable.

### M2 acceptance tests

- The rendered H3 form exposes the same fields, limits, defaults, and media counts as today.
- Existing H3 submit payloads are byte-for-byte equivalent where inputs are equivalent.
- Validation errors appear before network calls.
- AutoDL status values map to normalized job states and existing task UI remains functional.
- Download/gallery/export continue to work through artifact compatibility projections.
- Repeated submit attempts do not create duplicate local jobs or duplicate provider requests within the lock/idempotency window.
- App restart during submission or polling recovers from persisted job state.
- Renderer fixtures cover each supported semantic field and conditional visibility.

## Explicit non-goals for M1/M2

- No NovelAI or second platform adapter.
- No remote executable plugin, arbitrary HTTP config, or user-provided script.
- No Agent `submit_workflow` tool, direct-generation switch, or automatic side effects.
- No full attachment binding from Prompt Assistant; current user picker remains the source of H3 media inputs.
- No composite/DAG execution, although `kind`, `steps`, and `bindings` remain reserved and are rejected for activation when non-atomic execution is requested.
- No cloud project sync, collaboration, billing service, or server-side registry proxy.

## References consulted

- Replicate exposes versioned OpenAPI input/output schemas and prediction lifecycle: https://replicate.com/docs/reference/http/
- fal queue APIs separate submit/status/result/cancel and expose request IDs and progress: https://fal.ai/docs/documentation/model-apis/inference/queue
- ComfyUI Cloud accepts a JSON graph workflow; ComfyDeploy exposes typed external inputs: https://docs.comfy.org/api-reference/cloud/workflow/submit-a-workflow-for-execution and https://docs.comfydeploy.com/docs/api/inputs
- Hugging Face Inference Providers centralize provider selection and provider-specific adaptation: https://huggingface.co/docs/inference-providers/en/index
- JSON Forms/RJSF separate schema validation from renderer/widget registries: https://www.mintlify.com/eclipsesource/jsonforms/concepts/renderers and https://rjsf-team.github.io/react-jsonschema-form/docs/advanced-customization/custom-widgets-fields/
