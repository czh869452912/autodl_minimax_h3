# New Workflow Model Cleanup Design

**Goal:** Make workflow jobs/artifacts/media the only internal source of truth for new users, remove legacy task compatibility, and preserve system-gallery files during local data reset or deletion.

## Architecture

`workflow_jobs` owns lifecycle state. `workflow_artifacts` stores all provider outputs under a composite `(job_id, id)` key. `media_assets` is the internal catalog projection and `media_deliveries` records delivery metadata; gallery UI reads this catalog only. Task UI consumes a narrow projection of new workflow jobs and does not reconstruct jobs from legacy task rows.

The local schema is versioned for a destructive upgrade: internal tables and private files may be removed, but system-gallery URIs are never passed to file deletion APIs. Job creation and its task projection are persisted atomically where the storage API permits it, and projection replacement is idempotent.

## Provider output contract

Adapters return every artifact, preserving a stable provider id when available or a deterministic per-result index otherwise. Mapping infers artifact kind from MIME, extension, or provider metadata. No mapper may silently discard additional URLs or force every output to video.

## Cleanup and error handling

Deleting an internal task/job cascades through artifacts, media assets, and deliveries, then removes only private files. Corrupt JSON rows are ignored with an explicit sync error rather than crashing the gallery. Legacy projection functions and status conversion are deleted instead of maintained.

## Verification

Add focused regression tests for destructive schema reset, composite artifact identity, all-output provider mapping, atomic job/task projection, cascade deletion, system-gallery preservation, and malformed JSON. Run the full Jest suite, TypeScript typecheck, Android debug build, and emulator smoke check.
