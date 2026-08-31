# Multi-workflow Support M1/M2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a declarative, versioned workflow foundation and migrate the existing MiniMax H3 create/submit flow onto a schema-driven renderer, generic runtime, and built-in AutoDL adapter without regressing current task/media behavior.

**Architecture:** Add a `src/workflows` domain layer containing a restricted JSON Schema validator, registry, renderer, runtime, and adapter contracts. Keep platform protocol code in `autodl-comfyui`; keep existing task screens and media delivery working through compatibility projections while generic job/artifact fields are introduced.

**Tech Stack:** React Native 0.86, Expo 57, TypeScript strict mode, Expo SQLite, Jest/jest-expo, Expo SecureStore, `crypto`/Web Crypto-compatible hashing and Ed25519 verification available to the app runtime.

**Spec:** `docs/superpowers/specs/2026-08-30-multi-workflow-m1-m2-design.md`

## Global Constraints

- Configs are declarative only: no JavaScript, arbitrary HTTP URLs, component paths, scripts, or remote `$ref` values.
- Canonical config storage/transport is normalized JSON; local YAML is accepted only as an import format and is normalized before validation and hashing.
- `schemaVersion` is `"1.0"`; workflow `id`, `version`, and `contentHash` are immutable.
- M1/M2 activate only `kind: "atomic"`; composite `steps`/`bindings` are reserved and rejected for execution.
- Remote activation requires HTTPS/domain allowlist, Ed25519 signature, SHA-256 content hash, schema/size validation, adapter capability validation, and app compatibility.
- M2 ships only the built-in `autodl-comfyui` adapter; do not add a generic HTTP adapter or a second platform.
- Never log or persist real AutoDL/LLM tokens or API keys.
- Preserve current H3 payload semantics (`prompt`, `resolution`, `duration`, `seed`, `ref_image_N`, `ref_audio_N`) and existing task/media UI behavior.
- Run focused Jest tests after every task; before completion run `npm run typecheck`, `npm test -- --runInBand`, and Android export/build checks appropriate to the environment.

---

### Task 1: Workflow domain types and restricted schema validator

**Files:**
- Create: `mobile/src/workflows/schema/types.ts`
- Create: `mobile/src/workflows/schema/validator.ts`
- Create: `mobile/src/workflows/schema/conditions.ts`
- Test: `mobile/src/workflows/schema/validator.test.ts`
- Test: `mobile/src/workflows/schema/conditions.test.ts`

**Interfaces:**
- Produces `WorkflowDefinition`, `PlatformAdapterManifest`, `WorkflowDraft`, `JsonSchemaSubset`, `WorkflowUiSchema`, `RequestMapping`, `OutputMapping`, `Compatibility`, `FieldSemantic`, `ValidationResult`, and `validateWorkflowDefinition(value, context)`.
- `validateWorkflowDefinition` returns `{ ok: true, value }` or `{ ok: false, errors: Array<{ path: string; code: string; message: string }> }` and never throws for untrusted input.

- [ ] **Step 1: Write failing validator tests** for a valid atomic H3-shaped definition, missing root fields, unknown widgets/extensions, remote `$ref`, excessive nesting/size, unsupported `kind: composite`, and adapter/operation mismatch supplied through validator context.
- [ ] **Step 2: Run focused tests**

```powershell
cd mobile
npx jest src/workflows/schema/validator.test.ts --runInBand
```

Expected: FAIL because the domain types and validator do not exist.

- [ ] **Step 3: Implement the type model and validator** with explicit allowlists for JSON Schema keywords and `x-workflow` keys; enforce bounded depth, property count, array limits, and local-only `$defs` references. Validate `visibleWhen` using the condition module.
- [ ] **Step 4: Write condition evaluator tests** for `equals`, `in`, and `exists`, including missing paths and unsupported predicates.
- [ ] **Step 5: Implement deterministic side-effect-free `evaluateCondition(predicate, inputs)`**; unsupported predicates return a typed validation error rather than being ignored.
- [ ] **Step 6: Re-run focused tests and typecheck**

```powershell
npx jest src/workflows/schema/validator.test.ts src/workflows/schema/conditions.test.ts --runInBand
npm run typecheck
```

- [ ] **Step 7: Commit**

```powershell
git add mobile/src/workflows/schema
git commit -m "feat: add restricted workflow schema model"
```

### Task 2: Canonicalization, hashing, and registry persistence

**Files:**
- Create: `mobile/src/workflows/registry/types.ts`
- Create: `mobile/src/workflows/registry/canonicalize.ts`
- Create: `mobile/src/workflows/registry/crypto.ts`
- Create: `mobile/src/workflows/registry/repository.ts`
- Test: `mobile/src/workflows/registry/canonicalize.test.ts`
- Test: `mobile/src/workflows/registry/crypto.test.ts`
- Test: `mobile/src/workflows/registry/repository.test.ts`

**Interfaces:**
- Produces `RegistrySource`, `RegistryRecord`, `RegistryIndex`, `RegistryKey`, `canonicalizeDefinition(value): string`, `sha256Hex(value): Promise<string>`, `verifyEd25519(payload, signature, publicKey): Promise<boolean>`, and `createWorkflowRegistry(db)`.
- Repository methods: `upsert(record)`, `get(id, version)`, `list(options?)`, `setActive(id, version, hash)`, `getActive(id)`, `rollback(id)`, and `removeUnreferenced(keepHashes)`.

- [ ] **Step 1: Write failing canonicalization/crypto tests** proving object key ordering and whitespace do not change canonical JSON/hash, changed content does change hash, valid/invalid Ed25519 signatures are distinguished, and malformed signatures return `false` rather than throw.
- [ ] **Step 2: Implement canonical JSON serialization and SHA-256** using the app-supported crypto implementation; never include credentials in hashed content.
- [ ] **Step 3: Implement Ed25519 verification behind a small async interface** so tests can inject vectors and the registry service can use the platform implementation without coupling to UI.
- [ ] **Step 4: Write repository tests** for source metadata, immutable `(workflowId, version, contentHash)` records, active-version selection, atomic rollback, and retention of job-referenced hashes.
- [ ] **Step 5: Implement SQLite registry schema/migrations** with transactional writes and no destructive migration of existing tables.
- [ ] **Step 6: Run focused tests and typecheck**

```powershell
npx jest src/workflows/registry --runInBand
npm run typecheck
```

- [ ] **Step 7: Commit**

```powershell
git add mobile/src/workflows/registry
git commit -m "feat: persist versioned workflow registry records"
```

### Task 3: Built-in/local/remote registry service and trust pipeline

**Files:**
- Create: `mobile/src/workflows/registry/service.ts`
- Create: `mobile/src/workflows/registry/import.ts`
- Create: `mobile/src/workflows/registry/trust.ts`
- Create: `mobile/src/workflows/registry/builtin.ts`
- Test: `mobile/src/workflows/registry/service.test.ts`
- Test: `mobile/src/workflows/registry/import.test.ts`

**Interfaces:**
- Produces `createWorkflowRegistryService(deps)`, `discoverWorkflows()`, `importWorkflow(text, format)`, `syncRemoteIndex()`, `fetchAndActivate(id, version)`, `activateBuiltin(definition)`, and typed registry errors (`REGISTRY_SIGNATURE_INVALID`, `REGISTRY_HASH_MISMATCH`, `REGISTRY_SCHEMA_INVALID`, `REGISTRY_UNSUPPORTED_ADAPTER`, etc.).
- Dependencies include `fetch`, `registryRepository`, `validator`, `keyring`, `domainAllowlist`, `appVersion`, and `adapterCatalog`; all are injectable for tests.

- [ ] **Step 1: Add `yaml` as a direct dependency** and lock it with `npm install yaml --save` from `mobile`; do not evaluate YAML tags or custom types.
- [ ] **Step 2: Write failing import/service tests** for JSON import, YAML normalization, source precedence, malformed/oversized input, unsigned local import labeling, signed remote index/definition activation, domain rejection, key revocation, hash mismatch, incompatible app/adapter, transactional failure preservation, and rollback.
- [ ] **Step 3: Implement import normalization** (`JSON.parse` or safe YAML parse), size/depth limits, canonicalization, and validator invocation.
- [ ] **Step 4: Implement the trust pipeline** in the exact order: HTTPS/allowlist → index signature/key validity → definition signature/hash → schema validation → adapter/capability compatibility → transactional repository write.
- [ ] **Step 5: Implement builtin activation and discovery** so built-ins remain available, local imports are marked `untrusted-local` when unsigned, and remote updates remain candidates until activation policy selects them.
- [ ] **Step 6: Re-run focused tests and typecheck**

```powershell
npx jest src/workflows/registry --runInBand
npm run typecheck
```

- [ ] **Step 7: Commit**

```powershell
git add mobile/package.json mobile/package-lock.json mobile/src/workflows/registry
git commit -m "feat: add trusted workflow registry sync"
```

### Task 4: Generic job/artifact domain and SQLite compatibility migration

**Files:**
- Modify: `mobile/src/tasks/types.ts`
- Modify: `mobile/src/tasks/repository.ts`
- Create: `mobile/src/jobs/types.ts`
- Create: `mobile/src/jobs/repository.ts`
- Test: `mobile/src/tasks/repository.test.ts`
- Test: `mobile/src/jobs/repository.test.ts`

**Interfaces:**
- Produces `JobStatus`, `JobRecord`, `ArtifactRecord`, `NormalizedError`, `createJobRepository(db)`, and compatibility conversion helpers `taskRecordToJobRecord(task)` / `jobRecordToTaskProjection(job, artifacts)`.
- Existing `createTaskRepository` remains callable by current screens during migration; generic repository writes preserve current `TaskRecord` projections.

- [ ] **Step 1: Write failing migration tests** for new generic columns/tables, round-tripping workflow ID/version/hash, input snapshots, adapter metadata, remote IDs, artifacts, and old task rows without generic metadata.
- [ ] **Step 2: Extend task types with optional workflow provenance and generic artifact fields** while retaining all current video/download/export properties.
- [ ] **Step 3: Add SQLite migrations** for generic job/artifact data using additive `ALTER TABLE`/new tables; map legacy rows to `legacy-h3` without inventing historical hashes.
- [ ] **Step 4: Implement repository conversion and compatibility projections** so existing task list/detail/media consumers continue reading `prompt`, `videoUrl`, `localUri`, and related fields.
- [ ] **Step 5: Run focused repository tests and existing task tests**

```powershell
npx jest src/tasks/repository.test.ts src/jobs/repository.test.ts --runInBand
```

- [ ] **Step 6: Commit**

```powershell
git add mobile/src/tasks/types.ts mobile/src/tasks/repository.ts mobile/src/jobs
git commit -m "feat: add generic jobs and artifacts with task compatibility"
```

### Task 5: AutoDL adapter and H3 workflow definition

**Files:**
- Create: `mobile/src/workflows/adapters/autodlComfyUi/manifest.ts`
- Create: `mobile/src/workflows/adapters/autodlComfyUi/adapter.ts`
- Create: `mobile/src/workflows/adapters/autodlComfyUi/mapping.ts`
- Create: `mobile/src/workflows/definitions/autodl/minimax-h3-i2v-15s.json`
- Modify: `mobile/src/tasks/api.ts`
- Test: `mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts`
- Test: `mobile/src/workflows/adapters/autodlComfyUi/mapping.test.ts`

**Interfaces:**
- Produces `autodlComfyUiManifest`, `createAutodlComfyUiAdapter(deps)`, `buildAutodlSubmitRequest(input)`, `normalizeAutodlStatus(value)`, and `parseAutodlResult(data)`.
- Adapter methods implement `manifest()`, `validateCredentials()`, `submit()`, `getStatus()`, and optional `cancel()`.

- [ ] **Step 1: Write contract tests** for H3 mapping, nine-image/three-audio limits, seed coercion, exact current endpoint/workflow ID, authorization header behavior, provider timestamps, status normalization, URL extraction without `.mp4`, and normalized artifact output.
- [ ] **Step 2: Move pure parsing/payload logic from `tasks/api.ts` into adapter mapping modules** without changing externally observed payloads; keep temporary re-exports from `tasks/api.ts` for existing tests/consumers.
- [ ] **Step 3: Implement the code-owned manifest** exposing `autodl-comfyui`, `workflow.submit`, credential kind `autodl-token`, and supported video artifact capability.
- [ ] **Step 4: Add the built-in H3 definition** with schema/UI/request/output mappings; validate it through the same registry validator at module load/test time.
- [ ] **Step 5: Run adapter, API, and create-form contract tests**

```powershell
npx jest src/workflows/adapters/autodlComfyUi src/tasks/api.test.ts src/create/createForm.test.ts --runInBand
```

- [ ] **Step 6: Commit**

```powershell
git add mobile/src/workflows/adapters mobile/src/workflows/definitions mobile/src/tasks/api.ts
git commit -m "feat: add AutoDL adapter and H3 workflow definition"
```

### Task 6: Workflow runtime, validation preview, and idempotent submission

**Files:**
- Create: `mobile/src/workflows/runtime/types.ts`
- Create: `mobile/src/workflows/runtime/runtime.ts`
- Create: `mobile/src/workflows/runtime/mapping.ts`
- Test: `mobile/src/workflows/runtime/runtime.test.ts`
- Test: `mobile/src/workflows/runtime/mapping.test.ts`

**Interfaces:**
- Produces `createWorkflowRuntime(deps)`, `validateDraft(workflow, draft)`, `preview(workflow, draft)`, `submit(workflow, draft, options)`, and `sync(job)` with the exact return types from schema and jobs types.
- Dependencies: registry lookup, adapter catalog, job repository, artifact repository, credential provider, clock, UUID/idempotency generator.

- [ ] **Step 1: Write failing runtime tests** for local validation before network calls, missing credentials, unsupported operation, atomic-only enforcement, preview provenance/cost fields, canonical request mapping, persisted `SUBMITTING` snapshot, successful submission, ambiguous network result → `UNKNOWN`, sync state/artifact update, and duplicate submission lock.
- [ ] **Step 2: Implement pure input-path binding and output mapping** with bounded path syntax; reject missing required bindings and unknown target fields.
- [ ] **Step 3: Implement runtime lifecycle** `DRAFT → VALIDATING → READY_TO_SUBMIT → SUBMITTING → QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/UNKNOWN`; persist workflow version/hash and adapter version before calling the adapter.
- [ ] **Step 4: Implement stable idempotency key and per-job submission lock**; ambiguous responses must be recoverable by `sync`, never silently retried as a new job.
- [ ] **Step 5: Run focused runtime tests and typecheck**

```powershell
npx jest src/workflows/runtime --runInBand
npm run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add mobile/src/workflows/runtime
git commit -m "feat: add workflow runtime with idempotent jobs"
```

### Task 7: Semantic renderer registry and schema-driven H3 form

**Files:**
- Create: `mobile/src/workflows/renderer/types.ts`
- Create: `mobile/src/workflows/renderer/registry.ts`
- Create: `mobile/src/workflows/renderer/WorkflowForm.tsx`
- Create: `mobile/src/workflows/renderer/renderers.tsx`
- Modify: `mobile/src/create/CreateForm.tsx`
- Test: `mobile/src/workflows/renderer/registry.test.ts`
- Test: `mobile/src/workflows/renderer/WorkflowForm.test.tsx`
- Modify: `mobile/src/create/createForm.test.ts`

**Interfaces:**
- Produces `createDefaultRendererRegistry()`, `WorkflowForm({ definition, initialDraft, onChange, onSubmit })`, and native semantic renderers for prompt, enum, number/integer, seed, boolean, single/multiple asset, and help fields.
- Renderer context includes schema path, semantic type, current value, validation errors, finite UI hints, and controlled `onChange`; no renderer receives arbitrary module/component names.

- [ ] **Step 1: Write failing renderer fixture tests** for field order/sections, H3 defaults and limits, prompt textarea, resolution segmented control, duration stepper, seed input, image/audio pickers, validation display, conditional visibility, and unknown semantic/widget rejection.
- [ ] **Step 2: Implement the registry and renderers** using existing theme, `MediaPicker`, `AttachmentPreview`, and accessibility conventions; keep media values in the H3 draft shape expected by the adapter.
- [ ] **Step 3: Implement `WorkflowForm` controlled draft state** and schema-path error rendering; submit only emits a draft after runtime validation.
- [ ] **Step 4: Replace hard-coded parameter sections inside `CreateForm`** with the H3 definition + `WorkflowForm`, retaining route props, prompt draft consumption, alerts, task navigation, and current user-facing copy where still applicable.
- [ ] **Step 5: Run renderer/create tests**

```powershell
npx jest src/workflows/renderer src/create/createForm.test.ts --runInBand
```

- [ ] **Step 6: Commit**

```powershell
git add mobile/src/workflows/renderer mobile/src/create/CreateForm.tsx mobile/src/create/createForm.test.ts
git commit -m "feat: render H3 creation form from workflow schema"
```

### Task 8: Wire runtime into task sync and preserve existing media UI

**Files:**
- Modify: `mobile/src/create/CreateForm.tsx`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/tasks/presentation.ts`
- Modify: `mobile/src/tasks/media.ts`
- Modify: `mobile/src/gallery/presentation.ts`
- Modify: `mobile/src/tasks/download.ts` only if artifact projection requires a narrow compatibility change
- Test: `mobile/src/tasks/sync.test.ts`
- Test: `mobile/src/tasks/presentation.test.ts`
- Test: `mobile/src/tasks/media.test.ts`
- Test: `mobile/src/gallery/presentation.test.ts`
- Test: `mobile/src/route-tests/tasks.test.tsx`

**Interfaces:**
- Existing `taskStore`, `syncTasks`, download/export orchestration, task status labels/timing, gallery projection, and route screens remain source-compatible.
- New submissions flow through `WorkflowRuntime.submit`; background/manual sync uses `WorkflowRuntime.sync` for jobs with workflow provenance, with legacy H3 fallback only for rows marked `legacy-h3`.

- [ ] **Step 1: Write failing integration tests** for create → persisted generic job + compatibility task projection, background sync of queued/running AutoDL jobs, successful artifact projection to current video fields, retry/download/export behavior, old rows, and app restart recovery from `SUBMITTING`/`UNKNOWN`.
- [ ] **Step 2: Wire CreateForm submit** to build the H3 `WorkflowDraft`, call runtime preview/submit, persist the returned job and compatibility projection, and preserve the current success alert/navigation.
- [ ] **Step 3: Update sync orchestration** to select the adapter from job provenance, normalize status/artifacts, and continue passing successful video projections through `ensureTaskMedia`.
- [ ] **Step 4: Keep task/gallery/detail routes unchanged where possible**; update only type guards/labels needed for generic statuses/artifacts while preserving current video behavior.
- [ ] **Step 5: Run all focused integration tests and full verification**

```powershell
npx jest src/tasks/sync.test.ts src/tasks/presentation.test.ts src/tasks/media.test.ts src/gallery/presentation.test.ts src/route-tests/tasks.test.tsx --runInBand
npm run typecheck
npm test -- --runInBand
```

- [ ] **Step 6: Perform Expo/Android verification** using the repository's documented commands; verify create, task refresh, download, gallery, export, and restart recovery on an emulator/device when available.
- [ ] **Step 7: Commit**

```powershell
git add mobile/src/create/CreateForm.tsx mobile/src/tasks mobile/src/gallery
git commit -m "feat: route H3 jobs through workflow runtime"
```

### Task 9: Documentation and final compatibility review

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-30-multi-workflow-m1-m2-design.md` only if implementation constraints require a clarified sentence
- Test/inspection: `mobile/src/workflows/**/*.test.ts*`, existing task/media suites

- [ ] **Step 1: Update README roadmap/current implementation wording** to state that M1/M2 schema/registry and schema-driven H3 migration are implemented only when full verification passes; keep M3+ items explicitly planned.
- [ ] **Step 2: Review public boundaries** for accidental token logging, arbitrary URL/script execution, remote `$ref`, generic HTTP adapter leakage, or Agent direct-submit behavior.
- [ ] **Step 3: Run final checks**

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
cd ..
git diff --check
git status --short
```

- [ ] **Step 4: Commit documentation/final review**

```powershell
git add README.md docs/superpowers/specs/2026-08-30-multi-workflow-m1-m2-design.md
git commit -m "docs: record multi-workflow M1 and M2 delivery"
```

## Plan self-review

- **Spec coverage:** M1 schema/allowlist, canonicalization, builtin/local/remote registry, signatures/hash/compatibility/rollback, M2 renderer/runtime/AutoDL adapter, generic jobs/artifacts, idempotency, legacy projections, tests, and explicit non-goals each map to one or more tasks above.
- **Scope check:** No second platform, DAG execution, Agent submission, or full attachment binding is included; all are preserved only as rejected/reserved protocol surfaces.
- **Placeholder scan:** No TODO/TBD/“implement later” steps are used. Deferred capabilities are stated as explicit non-goals, not incomplete implementation instructions.
- **Type consistency:** Task 1 owns schema/domain types; Task 2 owns registry records; Task 4 owns job/artifact types; Tasks 5–8 consume those exact names and interfaces.
- **Migration safety:** Existing `TaskRecord`, task screens, media delivery, gallery projection, and API helper exports remain compatibility surfaces until all consumers are migrated.

