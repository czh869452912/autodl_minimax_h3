# Task refresh acceptance follow-ups

These local issue records track the remaining gates; no external issue or message was published.

## PERF-1: Full transfer and release performance acceptance

Status: open; full Task 11 performance acceptance remains incomplete. After the N4 quick fix and fourth review, the user authorized PR integration and a tagged patch release on 2026-09-05. This release decision does not close the performance acceptance item.

The user confirmed there is no existing HTTPS fixture endpoint. The production downloader rejects localhost/private addresses. Do not relax that policy for benchmarking. Arrange a public HTTPS fixture endpoint (and appropriate allowed-host policy), then run the 128 MiB fixture through the production transfer → streaming hash → durable reread → probe → CAS publication → commit path in a release-equivalent build.

Record five independently cold first-page reads, twenty revision checks, event-loop stall samples for the entire transfer, logcat ANR/input-timeout searches and interactive scroll/navigation/refresh evidence. Compare 100 and 1,000 tasks to assess history scaling. Confirm p95 <150 ms, maximum JS stall <250 ms, refresh completion independent of media completion and no idle timer. Existing debug connection-cold and local-file evidence is retained in the verification report, but does not close this issue.

## DEV-1: Intermediate v8 development databases

Status: documented development constraint; shipped v7 migration is covered.

Schema v8 was development-only before the planned v1.4.11 release. Branch users who ran intermediate v8 commits may lack later operation-revision triggers or the activity covering index because their schema version is already 8. Use a fresh benchmark fixture; preserve any valuable development data before arranging a development-only repair. Do not reset a user's normal database automatically. The v1.4.11 release contains the final v8 migration for published v1.4.10/v7 databases. Subsequent schema changes after publication require a forward migration.

## TEST-1: Node SQLite contention harness fidelity

Status: addressed for the reported refresh regression; exhaustive multiprocess coverage remains separate.

`src/test/realSqlite.ts` now offers an independent-connection transaction mode. A real file-backed writer-lock regression and a ten-round Expo SQLite device regression cover the reported command contention. The legacy in-process queue remains the default for older tests; it still is not proof of exhaustive independent-runtime contention behavior. See [regression verification](2026-09-05-task-refresh-regression-fix.md).
