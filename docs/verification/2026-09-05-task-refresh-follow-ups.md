# Task refresh acceptance follow-ups

These local issue records track the remaining gates; no external issue or message was published.

## PERF-1: Full transfer and release performance acceptance

Status: open; blocks full Task 11 acceptance/integration.

The user confirmed there is no existing HTTPS fixture endpoint. The production downloader rejects localhost/private addresses. Do not relax that policy for benchmarking. Arrange a public HTTPS fixture endpoint (and appropriate allowed-host policy), then run the 128 MiB fixture through the production transfer → streaming hash → durable reread → probe → CAS publication → commit path in a release-equivalent build.

Record five independently cold first-page reads, twenty revision checks, event-loop stall samples for the entire transfer, logcat ANR/input-timeout searches and interactive scroll/navigation/refresh evidence. Compare 100 and 1,000 tasks to assess history scaling. Confirm p95 <150 ms, maximum JS stall <250 ms, refresh completion independent of media completion and no idle timer. Existing debug connection-cold and local-file evidence is retained in the verification report, but does not close this issue.

## DEV-1: Intermediate v8 development databases

Status: documented development constraint; shipped v7 migration is covered.

Schema v8 is unshipped. Branch users who ran intermediate v8 commits may lack later operation-revision triggers or the activity covering index because their schema version is already 8. Use a fresh benchmark fixture; preserve any valuable development data before arranging a development-only repair. Do not reset a user's normal database automatically. If v8 is distributed externally before integration, provide a forward migration rather than relying on this development assumption.

## TEST-1: Node SQLite contention harness fidelity

Status: deferred test-infrastructure improvement.

`src/test/realSqlite.ts` serializes exclusive transactions through a module-global promise queue. Existing lease/claim tests cover competing runner behavior, but this helper cannot fully reproduce independent-runtime SQLite lock contention. Extend device or multiprocess coverage before asserting exhaustive lock-contention behavior; do not treat the in-process queue as proof of that property.
