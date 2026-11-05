# Agent roadmap implementation continuation

User authorized completion with one commit per completed part. Previous M1/M2: e6fc2dff. M3a/M3b1: 61b014e0.

## M3b2 — plan and batch request review

Implemented scrollable review shared with single requests, exact persisted batch scope, exclusion reasons, two opt-in permissions, account recovery in place, original draft editing, workflow configuration return. Configuration does not authorize. All workflow input fields included in review; media URI/data omitted. Existing revision, draft, credential, dependency and executor contracts retained.

Validation: TypeScript clean; 6 suites/50 tests. Offline Android review/cancel sampled; evidence and APK identities in evidence/2026-11-05-agent-roadmap/README.md. Live dispatch, font scaling and TalkBack remain separate acceptance coverage. Remaining implementation: M3c, M4, M5.

## M3c — generation tasks and candidates

Task status now precedes candidate results, distinguishes assistant versus server work, explains local archiving, adoption and export. UNKNOWN points to original status query/provider review; it does not offer a generation retry. Stopping an assistant explicitly leaves submitted jobs running. Candidate review refreshes while focused/foregrounded, clears old shot identity on navigation and preserves explicit candidate selection on incoming results.

Validation: 6 suites, 104 tests (100 initially passed; 4 route/candidate tests passed after correcting test database identity/foreground fixtures); typecheck clean. Offline unknown task sampled before/after, composite inspected. No actual provider lookup or export/adoption device media test claimed. Existing durable recovery tests retain unknown reservations and require fresh authorization for new requests. Remaining implementation: M4/M5.
