# B Release Media Concurrency Hotfix Design

**Date:** 2026-09-02  
**Scope:** Close the three regressions found in the v1.4.5 release before C-Core or D-Core starts.

## Goal

Keep full Workflow synchronization while preventing concurrent job completion and media delivery from corrupting SQLite transaction state or downgrading an already downloaded local video. Automatic and manual gallery export must reuse the app-private file, and every screen must present the same effective download state.

## Confirmed failures and root causes

1. Two jobs can finish in the same synchronization pass. `replaceArtifacts` currently uses Expo SQLite's non-exclusive `withTransactionAsync` on the shared connection. Concurrent `BEGIN`/`COMMIT`/`ROLLBACK` calls can interrupt one another and produce `cannot rollback - no transaction is active`.
2. Workflow synchronization, artifact materialization, and media delivery persist full snapshots asynchronously. A newer local download may therefore be overwritten by a synchronization snapshot that was read before the download completed. The affected fields include `tasks.local_uri`, download/export state, and `media_assets.local_path/status`.
3. Gallery export itself performs no URL policy check. `域名不在允许列表` means export received no usable local path and fell into the remote re-download branch. The player may still stream `media_assets.source_url`, making the video appear usable while the task row says download failed.

The AutoDL submission endpoint remains `https://autodl.art/api/v1/comfyui/comfyui_workflow/...`. This hotfix does not expand the artifact host allowlist because a successful local download must not require a second network request in order to export.

## Design

### 1. Preserve full Workflow synchronization

Workflow synchronization remains complete. Each pass continues to fetch and persist job status, provider handle/raw status, timing, normalized errors, output artifacts, Workflow provenance, adapter provenance, and the remote artifact URL projected into the task.

The ownership boundary applies only while merging that full synchronization result into local product projections:

- Workflow/job synchronization owns job status, provider data, timing, provenance, input/output projection, and remote artifact URLs.
- Media delivery owns the app-private path, poster path, download state/error/progress, gallery URI, export state/error, and export timestamp.

A Workflow synchronization result may update all fields it owns, but an older snapshot must not clear or downgrade fields owned by media delivery. Existing local fields are retained unless the media-delivery path explicitly changes them.

### 2. Make artifact replacement transaction-safe

On Android/iOS, artifact replacement uses `withExclusiveTransactionAsync` and executes every statement through the transaction object supplied by Expo SQLite. This isolates each delete-and-insert replacement from concurrent synchronization workers.

Test and non-native fallbacks retain the existing synchronous transaction path. The non-exclusive `withTransactionAsync` path is not used for artifact replacement.

### 3. Non-destructive task and media projection merges

Task persistence exposes a Workflow-projection write that updates all Workflow-owned columns while leaving media-owned columns untouched. New or recovered tasks are still inserted with a complete initial row. This avoids weakening Workflow synchronization while eliminating stale full-row overwrites.

Artifact materialization similarly updates remote metadata without clearing an existing `local_path`, poster, downloaded status, or export status. A remote artifact refresh may advance a preparing asset, but it cannot downgrade a downloaded asset to downloading.

### 4. Resolve and repair the effective local video source

A focused local-source resolver is shared by the detail/export flow. It checks, in order:

1. `media_assets.localPath`;
2. `tasks.localUri`;
3. the deterministic private download path for the task under the app document media directory.

Each candidate must be a local `file://` source whose file exists. When the deterministic file exists but one projection lost its path, the detail flow repairs both task and media projections before exporting. Remote `http(s)` sources are never treated as local export sources.

If no private file exists, manual export may use the existing secure re-download path and its adapter policy. The hotfix does not allow an arbitrary host or treat the Workflow submission endpoint as an artifact host.

### 5. One effective state in the detail screen

The detail player still prefers an existing local file and may fall back to the remote artifact URL for viewing. Its download label is derived from the verified effective local source rather than only `tasks.downloadState`:

- verified local file: `已下载`;
- no local file and recorded download failure: `下载失败`;
- otherwise: `准备中`.

The Save to Gallery action passes only the verified/repaired local path to native MediaStore when one exists. A successful download can therefore be exported without URL validation, and the task and asset projections converge after export.

## Error handling

- Exclusive transaction errors remain attached to synchronization diagnostics but cannot be caused by another worker sharing the main connection.
- Missing local files do not silently count as downloaded; stale paths are ignored and the secure download path is used only when necessary.
- Export failure changes only export state. It never changes a successful download to `DOWNLOAD_FAILED`.
- Projection repair is idempotent, so reopening the detail screen or retrying export is safe.

## Testing

Regression tests are written before production changes and cover:

- two concurrent artifact replacements use separate exclusive transaction objects and do not interfere;
- full Workflow projection updates continue while media-owned task fields survive;
- repeated artifact materialization cannot clear an existing local media path or downloaded status;
- detail/export recovers a deterministic private file when persisted projections are stale;
- a verified local file is sent directly to native gallery export without invoking remote download or host validation;
- the detail label reports downloaded when the effective local asset exists, even if the stale task row says `DOWNLOAD_FAILED`;
- export failure leaves download state and the local path intact.

The final gate is focused Jest RED/GREEN evidence, full Jest, TypeScript typecheck, `git diff --check`, Android build/install, the two-completion concurrency flow, manual gallery export, automatic gallery export, and detail-state verification on an emulator or connected Android device.

## Scope boundaries

- C-Core and D-Core remain paused until this hotfix is accepted.
- No schema-version change or C-Core durable operation tables are introduced.
- No artifact allowlist expansion, arbitrary public-host trust, or weakening of HTTPS/private-network checks.
- No provider resubmission, new workflow selector, project model, or unrelated UI redesign.
