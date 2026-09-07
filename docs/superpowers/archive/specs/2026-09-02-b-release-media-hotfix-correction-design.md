# B Release Media Hotfix Correction Design

**Date:** 2026-09-02
**Scope:** Correct the incomplete media-source and projection-ownership implementation after `012ba022`, and restore a visually usable Android build.

## Goal

Complete the B media hotfix without rolling back its valid transaction and projection work. Every media action must verify the effective app-private video before export, media writes must not overwrite Workflow-owned fields, and Android acceptance must prove that the app is visible and interactive rather than merely alive.

## Confirmed defects

1. `downloadIfNeeded` returns immediately for every non-empty `tasks.local_uri`, so stale, missing, or non-file values bypass verification and can permanently block secure re-download.
2. The shared media path calls `resolveLocalVideoSource` without a media asset. Automatic delivery and task-list actions therefore cannot recover a valid `media_assets.local_path` unless the detail route repairs the task first.
3. Workflow writes preserve media-owned task columns, but media progress still persists complete task snapshots. A stale media snapshot can overwrite newer Workflow status, timing, artifact URL, provenance, or synchronization diagnostics.
4. Repository tests inspect SQL text but do not execute conflict merges against persisted rows, and the exclusive-transaction regression test does not overlap two replacements.
5. The Android handoff equates process/activity/crash checks with a successful cold start. The current emulator can satisfy all of those checks while WindowManager keeps the application surface hidden at alpha zero.

## Design

### 1. Verified effective local source

The resolver remains the only authority for treating a path as an exportable private source. It checks candidates in this order:

1. primary video asset `localPath`;
2. task `localUri`;
3. deterministic `documentDirectory/media/<taskId>.mp4`.

Only an existing `file://` candidate is accepted. A failure while inspecting one candidate is treated as a rejected candidate, not as failure of the whole resolution pass.

Every automatic or manual media action resolves first, even when `task.localUri` is non-empty. A recovered path repairs the task media projection before export. If no candidate exists, stale `localUri` is removed from the media projection and a remote artifact may be downloaded only through the adapter's existing fail-closed artifact policy.

### 2. Asset lookup for non-detail flows

`MediaStore` exposes a focused primary-video lookup by task id. The task list and automatic delivery queue use it to supply the asset candidate to media orchestration. The detail route keeps using the asset already loaded by route id. This does not introduce a new schema or broaden media ownership.

### 3. Bidirectional task projection ownership

The task repository exposes a media-projection write. It inserts a complete row only when a task does not exist; on conflict it updates only:

- `local_uri` and `thumbnail_url`;
- download state, error, and progress;
- gallery URI, export state/error, and export timestamp;
- `updated_at`, without lowering the current timestamp.

Workflow-owned status, prompt/input, artifact URL, timing, provenance, synchronization error, and synchronization timestamp are never changed by this write.

Automatic delivery and task-list download/export callbacks use the media-projection write. Existing complete `upsert` remains available for creation, migration, and explicitly complete snapshots.

### 4. Transaction and merge verification

Tests execute the ownership merges against a stateful SQLite-compatible test database or repository fixture: seed newer fields, apply the competing projection, then read the row back. Artifact replacement tests overlap two calls and assert that each exclusive callback writes only through its own transaction object.

### 5. Android usability acceptance

The APK is rebuilt and installed without clearing user data. Cold-start acceptance requires all of the following:

- the application process and `MainActivity` are active;
- React Native reports no fatal JS error and the crash buffer is clear;
- the UI hierarchy contains the expected visible route;
- an emulator screenshot visibly contains application content;
- a UI-tree-derived tap changes route state;
- WindowManager reports the application surface shown with non-zero effective alpha.

If the emulator remains stuck in a launch animation while the React tree is healthy, the emulator/window state is restarted and the same APK is retested. No speculative application workaround is added for an emulator compositor failure.

## Error handling

- Missing or unreadable local candidates never count as downloaded.
- A candidate inspection error does not prevent later candidates from being checked.
- Clearing a stale local path does not clear gallery delivery metadata or Workflow fields.
- Export failure changes export state only; successful download state and verified local path are retained.
- Absent adapter policy continues to reject remote download.

## Testing and completion gate

Regression tests are written and observed failing before production changes. Coverage includes:

- stale non-empty `localUri` falls through to deterministic recovery or secure download;
- remote/non-file `localUri` is never sent to native export;
- asset-only local recovery works outside the detail route;
- media projection writes preserve newer Workflow fields;
- Workflow projection writes preserve newer media fields in an executed conflict merge;
- artifact projection writes preserve downloaded state in an executed conflict merge;
- two overlapping artifact replacements use isolated exclusive transaction objects;
- detail and task-list route actions pass the verified source and adapter policy.

Final verification is focused Jest, full Jest, TypeScript, `git diff --check`, Android debug build/install, visible cold start, route interaction, screenshot inspection, WindowManager surface inspection, and crash/log review.

## Scope boundaries

- No schema-version change or durable-operation work.
- No artifact allowlist expansion or arbitrary host trust.
- No C-Core/D-Core work or unrelated UI redesign.
- No rollback of valid B transaction fixes.
- User-owned `local.properties` and generated `.expo` state remain untracked and untouched.
