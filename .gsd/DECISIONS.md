# Decisions

## 2026-08-30 — Video storage and gallery export

Use a two-stage model: download each generated MP4 into app-private persistent storage, then publish a copy to Android MediaStore according to user settings. Automatic gallery export and private-copy retention both default to enabled.

Keep download and export lifecycles separate. `localUri` remains the private playback and recovery source, while `galleryUri` stores the public `content://` reference. The native boundary exposes one idempotent `exportVideo` operation and hides MediaStore pending rows, duplicate detection, cleanup, and recovery.

This shape was chosen because it keeps the caller small, preserves reliable offline playback when public publication fails, and still makes completed work visible in `Movies/AutoDL-H3`. Direct-to-MediaStore downloading and a generalized multi-destination delivery pipeline were rejected as unnecessarily coupling or over-generalizing the current flow.

## 2026-09-02 — Reserve schema versions after B.1

B.1 already uses `APP_SCHEMA_VERSION=5` for the transactional Registry migration. Therefore C-Core must use v6 for durable executor tables and D-Core must use v7 for product-domain tables; plans and handoff were corrected to prevent migration-version reuse.
