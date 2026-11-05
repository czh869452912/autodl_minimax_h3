# Agent roadmap implementation continuation

User authorized completion with one commit per completed part. Previous M1/M2: e6fc2dff. M3a/M3b1: 61b014e0.

## M3b2 — plan and batch request review

Implemented scrollable review shared with single requests, exact persisted batch scope, exclusion reasons, two opt-in permissions, account recovery in place, original draft editing, workflow configuration return. Configuration does not authorize. All workflow input fields included in review; media URI/data omitted. Existing revision, draft, credential, dependency and executor contracts retained.

Validation: TypeScript clean; 6 suites/50 tests. Offline Android review/cancel sampled; evidence and APK identities in evidence/2026-11-05-agent-roadmap/README.md. Live dispatch, font scaling and TalkBack remain separate acceptance coverage. Remaining implementation: M3c, M4, M5.

## M3c — generation tasks and candidates

Task status now precedes candidate results, distinguishes assistant versus server work, explains local archiving, adoption and export. UNKNOWN points to original status query/provider review; it does not offer a generation retry. Stopping an assistant explicitly leaves submitted jobs running. Candidate review refreshes while focused/foregrounded, clears old shot identity on navigation and preserves explicit candidate selection on incoming results.

Validation: 6 suites, 104 tests (100 initially passed; 4 route/candidate tests passed after correcting test database identity/foreground fixtures); typecheck clean. Offline unknown task sampled before/after, composite inspected. No actual provider lookup or export/adoption device media test claimed. Existing durable recovery tests retain unknown reservations and require fresh authorization for new requests. Remaining implementation: M4/M5.

## M4a — plan detail and preparation

Plan list rows show state, blockers and one next action. Full-screen detail carries inputs, candidate selection and explicit confirmation, pause/recovery/task controls. Optional checks and dependency editing share a collapsible section. Dependency search/pagination reads across the project, independent of current plan page/batch; existing cycle and revision validation retained. One create entry chooses single/multiple shots. Selecting a shot automatically reads candidates; leaving preparation retains unsaved values within the mounted workspace.

Validation: typecheck clean, 4 suites/41 tests. Includes project-wide equal-time dependency pagination, direct old plan lookup, preview without resolve/authorization and automatic candidate read. Offline device opened list/detail/checks/dependency picker, then chose a shot and observed candidates without manual refresh or saving. Composite visually reviewed; reference media intentionally unavailable. Batch range layout remains next slice.

## M4b — batch scope and request membership

Batch range selection now has preview/confirm/cancel; rows display current-page counts separately from complete batch summaries. Project changes clear selection, filter and preparation identity. Multi-shot preparation shows unavailable shots and their missing requirements. Request review includes dependency waiting notes. Single-plan request review is the primary detail action; cancellation explicitly explains retained task/cost records.

Validation: 4 suites/42 tests plus scope-change regression rerun (5 component tests); typecheck clean before scope-reset follow-up. Offline range apply/request membership sampled; batch-list-comparison.jpg inspected. Candidate bundle predates the small project-change/reset-label follow-up; that behavior is covered by the component regression and will be included in subsequent device bundles. No real dispatch, cancellation/refund, or upstream media adoption simulated as success. Remaining implementation: M5.

## M5a — skill extraction

Saved drafts are independent from evidence selection, outbound review, content review and fixed-version publication. Recipient identity and cost purpose precede explicit send; changed model credentials/revision require another review. Back preserves edits; saving evidence stays local. Publishing locates the exact version without enabling it.

Validation: typecheck clean; 4 suites/22 tests, including real SQLite draft/publication, changed recipient and saved-draft resume. Offline Android selected persisted text, reviewed loopback recipient, saved locally and reopened unchanged. Composite inspected. Installation storage resolved by replacing only the task QA package with data retained and backed up. One native Fabric crash occurred when deeplinking during startup; normal launch then warm navigation succeeded. No live model call or device publication claimed. Remaining implementation: M5b/M5c.

## M5b — conversation history and run evidence

Conversation menu owns read-only history with trusted scope; skill directory keeps a shortcut. Names/time/status replace raw row diagnostics. Run detail presents summary, expandable stages, then fixed snapshot, actual completed reads, usage and original tools. Exact historical lookup is independent of the latest page/current selection. Existing image rendering, refresh/event generation guards and scope pagination retained. Background refocus preserves the mounted history scroll surface.

Validation: 4 suites/28 tests, typecheck clean before the row-label/refocus follow-up. Includes exact old-version SQLite lookup, equal-time pagination, late reads, refresh recovery, message-image identity and guarded menu navigation. Offline Android sampled same-run summary/diagnostics, empty history and an explicitly synthetic tool stage/history row; no real tool call occurred. Composite inspected. Device bundle predates row-title/refocus follow-up (covered automatically; included next bundle). Remaining implementation: M5c and final consistency pass.

## M5c — input, versions and disconnected history

Long input has a nearby full editor action; completion restores composer focus and retains selection/text/attachments without sending. Ready-image references are discoverable in the attachment strip; structured brief explicitly appends. Prompt versions prioritize preview and draft handoff, with compare/copy/hide in secondary operations. Existing fixed image bindings and validation remain authoritative. Missing model offers connection recovery and project-scoped local history without mounting a model runtime. History search retains project scope. Extraction draft deletion is secondary; recipient/workflow configuration links return to the original pending task.

Validation: final TypeScript clean; 65 suites/555 tests passed across agent/conversation and affected creative flows. Broader integration caught an embedded skill-history regression: history must close back to the mounted directory with unsaved selection intact. Fixed and retested, including real SQLite/event lifecycle tests. Android final bundle sampled that exact return and missing-model local list/detail/return without sending. Long editor completion preserved text and returned focus; version controls expanded correctly. Same-viewport composites inspected. Synthetic version fixtures required canonical JSON serialization matching the immutable store; only task fixture data changed.

M5c implementation complete. Device identities and precise evidence boundaries: [evidence](evidence/2026-11-05-agent-roadmap/README.md). Final 01–50 reconciliation is recorded separately; live provider/model execution, actual device media adoption/export, TalkBack and the complete font/device matrix are not claimed by this offline QA.

## Final reconciliation follow-up — item 43 project permissions

The 01–50 audit found the old immediate bulk-revoke button still inside the project switcher. Removed it. Project overview now opens a full-screen Project permissions task, listing every unexpired, unrevoked project grant (including request-bound grants and grants on old credentials). All listed rows must be displayed before review. Review/cancel writes nothing; confirmation atomically checks the exact ID/revision set before revoking it. Newly added, expired or changed grants require rereading. Existing dispatched jobs, reservations and cost records remain unchanged; outbound permissions keep their separate record screen.

Validation: 3 real SQLite/component integration tests cover review cancellation, confirmed project isolation, concurrent membership/revision change rejection and rollback on the second write. Existing budget/workspace suites add 33 passing tests. Typecheck clean. Android UI coverage is recorded in the evidence README. This closes the implementation omission; no real provider permission or task was changed.

## Final implementation closure

All 01–50 items reconciled as implemented changes or reviewed existing behavior in [the final mapping](agent-final-reconciliation.md). Commits were made per slice, including final item 43 follow-up. Final combined regression: 70 suites / 600 tests passed; TypeScript clean. Catalog: 31 route files (29 pages + 2 shells), 67 entries, 74 reviewed click edges; strict source digests passed. Design contracts, current status, generated report and index synchronized. No claim of release/live provider/full accessibility acceptance; evidence limits remain explicit. Unrelated release-readiness document left untouched.
