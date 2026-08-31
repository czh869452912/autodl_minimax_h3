# New Workflow Model Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove old task compatibility and fix data-model integration, persistence, provider mapping, and cleanup behavior for new users.

**Architecture:** Workflow jobs and artifacts are authoritative; tasks and media are projections. A destructive local schema reset removes app-owned state while system-gallery files remain untouched.

**Tech Stack:** React Native, Expo SQLite, TypeScript, Jest, Android Gradle.

---

### Task 1: Remove legacy task projection paths

**Files:** `mobile/src/gallery/presentation.ts`, `mobile/src/jobs/repository.ts`, `mobile/src/tasks/*`, related tests.

- [ ] Write failing tests proving legacy task-to-job conversion and task-based gallery projection are no longer exported or used.
- [ ] Run focused tests and confirm they fail because the old exports still exist.
- [ ] Remove `taskRecordToJobRecord`, `jobRecordToTaskProjection`, `taskToMediaAsset`, `projectGallery`, and legacy-only status branches; update production imports and tests to use Job/Media repositories.
- [ ] Run focused tests and confirm the new-model paths pass.

### Task 2: Add destructive internal schema reset and safe parsing

**Files:** `mobile/src/jobs/repository.ts`, `mobile/src/tasks/repository.ts`, `mobile/src/media/repository.ts`, database bootstrap files and tests.

- [ ] Write failing tests for schema version reset, malformed JSON tolerance, and preservation of system-gallery URIs.
- [ ] Run tests and verify the expected failures.
- [ ] Implement an internal schema version marker; on version change drop/recreate only app-owned tables and private files, use safe JSON parsing, and keep delivery metadata without deleting external content.
- [ ] Run focused repository tests.

### Task 3: Make job/artifact persistence consistent

**Files:** `mobile/src/jobs/repository.ts`, `mobile/src/jobs/types.ts`, runtime and repository tests.

- [ ] Write failing tests for composite artifact IDs and transactional replace semantics.
- [ ] Implement `(job_id,id)` uniqueness, replace artifacts in one transaction, and preserve all rows for different jobs.
- [ ] Run focused Job tests.

### Task 4: Make provider output mapping lossless

**Files:** `mobile/src/workflows/providers/autodl/mapping.ts`, provider adapter, mapping tests.

- [ ] Write failing tests for multiple URLs, MIME/extension kind inference, stable IDs, and partial outputs.
- [ ] Implement lossless recursive extraction with deterministic IDs and explicit artifact kinds/statuses.
- [ ] Run provider tests.

### Task 5: Implement output mapping and atomic creation

**Files:** `mobile/src/workflows/runtime/runtime.ts`, workflow schema types, `mobile/src/create/CreateForm.tsx`, coordinator and integration tests.

- [ ] Write failing tests for `outputs.artifacts` mapping and a submit path that cannot leave an orphan Job without a Task projection.
- [ ] Implement output mapping and a repository-level atomic create/projection operation; make coordinator recover only from authoritative Jobs.
- [ ] Run runtime and create-flow tests.

### Task 6: Cascade internal deletion and prevent projection races

**Files:** task/job/media repositories, coordinator, deletion and race tests.

- [ ] Write failing tests for internal cascade deletion, no system-gallery deletion, and deletion during media materialization.
- [ ] Implement transactional cascade/soft-delete guard and idempotent materialization.
- [ ] Run focused deletion/coordinator tests.

### Task 7: Verify and commit

- [ ] Run `npm test -- --runInBand` from `mobile`.
- [ ] Run `npm run typecheck` from `mobile`.
- [ ] Run `:app:assembleDebug` with JBR 21.
- [ ] Install and smoke-test the APK on `emulator-5554`.
- [ ] Review `git diff --check`, inspect status, and commit all implementation changes.
