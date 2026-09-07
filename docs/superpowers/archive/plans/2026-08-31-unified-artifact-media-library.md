# Unified Artifact Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立可扩展的 Job → Artifact → MediaAsset → Delivery 数据闭环，并让画廊只依赖应用自己的产物库。

**Architecture:** 扩展工作流 artifact 持久化并新增通用 media asset/repository materializer；任务同步在状态和 artifacts 收敛后写入媒体库；画廊和详情页读取媒体库，TaskRecord 只保留执行与兼容字段。

**Tech Stack:** React Native/Expo, TypeScript, expo-sqlite, Jest, existing provider/runtime repositories.

---

### Task 1: Extend artifact and media models

**Files:**
- Modify: `mobile/src/jobs/types.ts`
- Modify: `mobile/src/media/types.ts`
- Modify: `mobile/src/jobs/repository.ts`
- Modify: `mobile/src/media/repository.ts`
- Test: `mobile/src/jobs/repository.test.ts`, `mobile/src/media/repository.test.ts`

- [ ] Write failing tests for artifact provenance fields, stable media asset IDs, and media delivery metadata.
- [ ] Run focused tests and confirm the new expectations fail.
- [ ] Add optional `artifactId`, `jobId`, `workflowId`, `kind`, `remoteUri`, `localUri`, and delivery fields without breaking existing records.
- [ ] Add SQLite columns/indexes and `listPage` filtering by kind/source.
- [ ] Run focused tests and typecheck.
- [ ] Commit `feat: extend artifact and media models`.

### Task 2: Materialize workflow artifacts into the app media library

**Files:**
- Create: `mobile/src/media/materializer.ts`
- Test: `mobile/src/media/materializer.test.ts`
- Modify: `mobile/src/tasks/coordinator.ts`, `mobile/src/tasks/sync.ts`

- [ ] Write failing tests proving one Job with video/image/audio artifacts creates three independent MediaAssets and that system-gallery-only data is ignored.
- [ ] Run the focused test and confirm failure.
- [ ] Implement deterministic asset IDs from `jobId + artifactId`, kind-aware metadata, and idempotent upsert.
- [ ] Invoke materialization after runtime sync and after download updates; preserve private local paths for gallery assets.
- [ ] Add a bounded legacy repair pass for completed tasks with local or remote media.
- [ ] Run materializer, coordinator, sync, and type tests.
- [ ] Commit `feat: materialize workflow artifacts into media assets`.

### Task 3: Separate delivery records from gallery sources

**Files:**
- Modify: `mobile/src/tasks/media.ts`, `mobile/src/tasks/types.ts`
- Modify: `mobile/src/gallery/presentation.ts`
- Test: `mobile/src/tasks/media.test.ts`, `mobile/src/gallery/presentation.test.ts`

- [ ] Write failing tests proving `galleryUri` alone cannot produce a gallery asset, while an app-private `localUri` can.
- [ ] Run focused tests and confirm failure.
- [ ] Keep export status/URI as delivery metadata; make gallery source selection prefer asset local path/remote artifact URI only.
- [ ] Ensure export retries do not delete the canonical media asset or treat system-gallery URI as its source.
- [ ] Run focused tests and typecheck.
- [ ] Commit `fix: separate gallery assets from system deliveries`.

### Task 4: Switch gallery and detail pages to the media repository

**Files:**
- Modify: `mobile/app/(tabs)/gallery.tsx`
- Modify: `mobile/app/video/[id].tsx`
- Modify: `mobile/src/media/GalleryCard.tsx`
- Test: `mobile/src/route-tests/gallery.test.tsx`, `mobile/src/route-tests/video-detail.test.tsx`

- [ ] Write failing route tests with a media repository mock and no task-list fallback.
- [ ] Run focused route tests and confirm failure.
- [ ] Read paged MediaAssets by kind/status/query; keep task lookup only for prompt/actions where needed.
- [ ] Resolve detail media by asset ID and merge task metadata without consulting system album.
- [ ] Keep FlatList virtualization and bounded poster extraction.
- [ ] Run route tests and typecheck.
- [ ] Commit `feat: drive gallery from media asset repository`.

### Task 5: Migrate existing records and verify end to end

**Files:**
- Modify: `mobile/src/tasks/sync.ts`, `mobile/src/tasks/coordinator.ts`
- Modify: `docs/superpowers/reviews/PROVIDER_INTEGRATION_REVIEW.md`
- Test: `mobile/src/tasks/sync.test.ts`, `mobile/src/tasks/coordinator.test.ts`

- [ ] Add a failing migration test for an existing downloaded TaskRecord and a task with only `galleryUri`.
- [ ] Implement idempotent migration: local/remote task media becomes a MediaAsset; gallery-only task becomes delivery metadata only.
- [ ] Run full Jest, typecheck, `git diff --check`, and Android `:app:assembleDebug`.
- [ ] Update review notes with the unified model and remaining real-device checks.
- [ ] Commit `chore: migrate legacy task media assets`.
