# Decisions

## 2026-08-30 — Video storage and gallery export

Use a two-stage model: download each generated MP4 into app-private persistent storage, then publish a copy to Android MediaStore according to user settings. Automatic gallery export and private-copy retention both default to enabled.

Keep download and export lifecycles separate. `localUri` remains the private playback and recovery source, while `galleryUri` stores the public `content://` reference. The native boundary exposes one idempotent `exportVideo` operation and hides MediaStore pending rows, duplicate detection, cleanup, and recovery.

This shape was chosen because it keeps the caller small, preserves reliable offline playback when public publication fails, and still makes completed work visible in `Movies/AutoDL-H3`. Direct-to-MediaStore downloading and a generalized multi-destination delivery pipeline were rejected as unnecessarily coupling or over-generalizing the current flow.

## 2026-09-02 — Reserve schema versions after B.1

B.1 already uses `APP_SCHEMA_VERSION=5` for the transactional Registry migration. Therefore C-Core must use v6 for durable executor tables and D-Core must use v7 for product-domain tables; plans and handoff were corrected to prevent migration-version reuse.

## 2026-09-04 — Use immutable manifests for builtin workflow releases

Builtin workflows use an immutable Release Manifest with pinned `WorkflowPackage` documents, named identity schemes, and exact historical representation declarations. Existing Registry rows and provenance hashes are never rewritten to normalize them. Future content releases such as `1.0.2+` append a new package and Manifest entry; they do not consume database schema versions. A same-version mismatch that is not explicitly declared remains an integrity error.

Registry Release identity metadata uses schema v7 to add the persisted hash scheme and applied-Manifest ledger. This supersedes the 2026-09-02 reservation of v7 for D-Core; the not-yet-started D-Core schema moves to v8. This decision is necessary so upgrades from pre-package-hashing installations can be verified and reconciled without clearing tasks, settings, media, or historical workflow hashes.

## 2026-09-05 — Separate task projections from executor work

Use a stateful `TaskListSession` for UI projection reads, a durable `TaskCommandService` for user intent, and separate scheduler wake and executor runner ports. Task-list and detail UI must not import or await the executor. SQLite task projections remain authoritative; same-runtime events accelerate invalidation, while a trigger-maintained persistent projection revision provides cross-runtime eventual consistency and guarantees trailing reads.

Move artifact network transfer, file writes, streaming SHA-256, and durable reread to the existing Android media module's native executor. This is required because fire-and-forget JavaScript would still block the React Native JS thread. The combined design was chosen over caller-managed query/command/worker ports and a persistent change log because it hides refresh-state complexity from screens without introducing a second event-sourced task model.

This refresh architecture uses schema v8 for projection revisions, triggers, claim-expiry indexing, and coalesced maintenance wake state. It supersedes the September 4 reservation of v8 for the not-yet-started D-Core schema; D-Core moves to v9.
