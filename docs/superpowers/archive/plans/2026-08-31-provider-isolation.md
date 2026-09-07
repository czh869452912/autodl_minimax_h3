# Provider Isolation and Extensible Adapter Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LLM and generation-provider networking independent, and give AutoDL a standalone client/adapter boundary that future providers can implement without touching the runtime or LLM service.

**Architecture:** Capture the native React Native transport at bootstrap before CopilotKit installs its streaming fetch. Inject that transport into provider-owned clients. Move AutoDL endpoint/request/response mechanics into `workflows/providers/autodl`, while keeping the existing adapter manifest and runtime interfaces stable.

**Tech Stack:** React Native/Expo, TypeScript, Jest, existing workflow runtime and adapter contracts.

**Spec:** `docs/superpowers/specs/2026-08-31-provider-isolation-design.md`

## Global Constraints

- Provider clients must not inspect CopilotKit, `__originalFetch`, or LLM settings.
- Workflow configs may not supply arbitrary URLs, headers, scripts, or component paths.
- Existing AutoDL payload mapping and task compatibility must remain unchanged.
- Use TDD: each production change starts with a failing test.

---

### Task 1: Native provider transport capture

**Files:**
- Create: `mobile/src/providers/httpTransport.ts`
- Create: `mobile/src/providers/httpTransport.test.ts`
- Create: `mobile/src/providers/bootstrap.js`
- Modify: `mobile/index.js`

**Interfaces:**
- Produces `HttpTransport`, `captureNativeHttpTransport()`, and `getNativeHttpTransport()`.
- Bootstrap captures the current native fetch, then loads CopilotKit polyfills.

- [x] Write a failing test proving a captured transport remains the native function after the global fetch is replaced.
- [x] Run `npm test -- --runInBand src/providers/httpTransport.test.ts` and verify the new assertion fails.
- [x] Implement the capture module and CommonJS bootstrap ordering.
- [x] Run the focused test and typecheck.
- [x] Commit `feat: isolate provider HTTP transport`.

### Task 2: Standalone AutoDL provider client

**Files:**
- Create: `mobile/src/workflows/providers/autodl/client.ts`
- Create: `mobile/src/workflows/providers/autodl/client.test.ts`
- Modify: `mobile/src/workflows/adapters/autodlComfyUi/adapter.ts`
- Modify: `mobile/src/workflows/adapters/autodlComfyUi/adapter.test.ts`

**Interfaces:**
- `createAutodlClient({ transport, token })` exposes `submit(input)` and `getStatus(providerJobId)`.
- The client owns `https://autodl.art/api/v1/comfyui/comfyui_workflow/`, headers, response parsing, and categorized `ProviderError` values.
- `createAutodlComfyUiAdapter({ token, transport? })` delegates to the client and does not reference global fetch or CopilotKit.

- [x] Write failing tests for exact submit/poll transport calls and provider error categories.
- [x] Run focused tests and verify failure before implementation.
- [x] Implement the client and refactor the adapter to delegate.
- [x] Run AutoDL tests and verify the adapter source has no global-fetch/shim dependency.
- [x] Commit `feat: add isolated AutoDL provider client`.

### Task 3: Provider registration seam and integration wiring

**Files:**
- Create: `mobile/src/workflows/providers/registry.ts`
- Create: `mobile/src/workflows/providers/registry.test.ts`
- Modify: `mobile/src/create/CreateForm.tsx`
- Modify: `mobile/src/tasks/sync.ts`

**Interfaces:**
- `createBuiltinProviderAdapters({ token, transport? })` returns the installed adapter map consumed by runtime/sync.
- Adding a future provider is an additive registry entry; runtime code remains unchanged.

- [x] Write failing tests proving the builtin registry exposes AutoDL and accepts an independent second adapter without coupling.
- [x] Run focused test and verify failure.
- [x] Implement registry and wire CreateForm/task sync through it with the captured provider transport.
- [x] Run integration tests and typecheck.
- [x] Commit `feat: add builtin provider adapter registry`.

### Task 4: Full verification and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-provider-isolation-design.md` only if self-review finds a gap.

- [x] Run full Jest suite, typecheck, and Android Expo export.
- [x] Confirm no generated `dist` or log artifacts remain.
- [x] Review `git diff --check` and `git status`.
- [x] Commit any documentation-only correction.
