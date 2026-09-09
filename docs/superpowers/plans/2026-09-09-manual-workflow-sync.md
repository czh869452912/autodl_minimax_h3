# Manual workflow distribution implementation plan

**Goal:** Manually sync signed AutoDL H3 workflow packages from Settings and choose a schema-aligned target when creating or exporting a Prompt.

**Approved design:** User approved implementation of the September 9 discussion: manual sync only, shared workflow selection and parameter alignment, durable target identity in handoffs, offline installed workflows, no paid submissions or remote publishing during implementation.

**Architecture:** Keep the current AutoDL transport and durable executor. Add a signed static registry sync coordinator, schema-driven input alignment and shared selection. Remote packages are immutable; preserve installed versions and task snapshots. Supported remote workflows use the existing H3 request vocabulary.

**Tech stack:** Expo/React Native, TypeScript, SQLite, Ed25519, Jest, Node publishing scripts.

## Tasks

- [x] Remote distribution: implement and test manual signed-index sync, immutable coordinates, compatibility, no downgrade, idempotence, partial failure retention; Settings component; static signing/publishing tools and documentation. No startup/background fetch.
- [x] Workflow package and alignment: test both H3 contracts, then add zm-u24 package and shared defaults/semantic alignment/normalization/media validation. Preserve historical builtin packages.
- [x] Create flow: test selection and draft target restoration, then integrate schema-based limits and errors, target-specific values and durable identity.
- [x] Assistant export: test target selection, square resolution and seed zero, then integrate schema-generated preview parameters and target handoff. Missing generation inputs may be completed on Create.
- [x] Verification: focused Jest suites, full typecheck/test/release validation, independent review, available Android smoke checks. Record external publishing prerequisites honestly.

## Decisions and progress

- Work is on `codex/manual-workflow-sync`; existing untracked API documents are user inputs and will not be overwritten.
- No remote synchronization is triggered by catalog loading. Settings is the sole network sync trigger.
- Schema-only support is explicitly limited to the current AutoDL H3 request protocol.
- Tests precede implementation for new logic and interaction contracts.

## Verification results

- `npm test -- --runInBand`: 157 suites / 1075 tests passed, 2 tests skipped (existing opt-in tests).
- `npm run typecheck` and `npm run verify:workflow-releases`: passed.
- `node --test scripts/publish-workflow-registry.test.mjs`: passed, real signature verification.
- Fresh official-key signing rehearsal produced two packages and sequence 1 under `.superpowers/workflow-publication`; no publication performed.
- Android x86_64 debug APK assembled, installed and launched on emulator-5554. Creation selector and Settings manual sync inspected; unpublished registry failure keeps builtin workflow. Full real-provider paid generation not performed.
- Independent review found and drove fixes for draft target hydration, cross-draft save ownership, A→B→A restoration, stale prompt cache, early submit locking, scalar enum normalization and initial preview alignment; final scoped review reported no remaining P1/P2 findings.
- User requested local integration into `dev`. Publication and GitHub environment secret setup remain separate steps documented in `docs/workflow-registry-publishing.md`.
