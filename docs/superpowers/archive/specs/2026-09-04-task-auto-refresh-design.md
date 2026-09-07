# Task Queue Auto-Refresh Design

## Problem

The task queue uses an adaptive one-shot `setTimeout`, but React only recreates that timer when `hasActiveTasks`, `remainingDue`, or `nextWakeAt` changes. When a poll completes with the same dependency values, no new timer is scheduled. Background monitoring can then update SQLite and send terminal/download notifications while the visible task cards retain their old in-memory projection. The per-card duration keeps changing because it has a separate one-second timer.

## Scope

Fix foreground task-list refresh scheduling only. Preserve the existing durable executor, background monitor, database schema, notification behavior, dynamic `nextPollDelay`, manual refresh, focus refresh, pagination, and media actions.

## Considered approaches

1. **Self-rescheduling adaptive timeout (selected).** After each completed foreground poll, update a monotonically increasing poll generation. The scheduling effect depends on that generation as well as the calculated work state, so an unchanged provider state still schedules the next poll. This keeps adaptive timing and prevents overlapping work through the existing in-flight guard.
2. **Restore a fixed `setInterval`.** Simple, but discards exact `nextWakeAt` scheduling and may repeatedly wake when only delayed work exists.
3. **Database/event subscriptions.** Useful for same-runtime updates, but background execution may use a separate runtime and therefore still needs polling. This is larger than the bug requires.

## Design

The task screen owns a poll generation counter. A successful, failed, or skipped timer-triggered poll advances the generation after the poll promise settles. The scheduling effect includes that generation in its dependencies, recalculates the delay through `nextPollDelay`, and installs exactly one new timeout when work remains. Focus and manual loads continue to use their existing paths and do not create parallel interval loops.

The effect cleanup cancels its pending timeout when dependencies change or the screen unmounts. The existing `loadInFlight` fence continues preventing concurrent screen-triggered synchronization. If a timer fires while another screen load is active, completion still advances the generation so the polling chain cannot silently die.

When a poll reads a terminal task projection, `setTasks` updates the card immediately. The active-task flag then becomes false; if no scheduled operation remains, `nextPollDelay` returns no delay and the loop stops.

## Error handling

Automatic poll failures remain non-modal. They must still advance the generation and schedule another eligible attempt, rather than permanently stopping refresh. Manual refresh keeps its existing alert behavior. No automatic resubmission of `UNKNOWN` provider jobs is introduced.

## Tests

- A route test advances fake time through at least three unchanged active-task intervals and asserts every interval invokes synchronization.
- A route test changes the mocked persisted task from active to terminal on a later poll and asserts the rendered status/download state updates without manual refresh.
- Existing tests continue to prove that terminal-only pages stop polling and scheduled retries wait until `nextWakeAt`.
- Run the focused route/poll tests, TypeScript checks, the full Jest suite, then compile and install the Android debug build on `test_phone` for UI verification.

## Success criteria

- Active task cards refresh automatically across an arbitrary number of unchanged polling cycles.
- Background-persisted terminal state becomes visible on the next foreground poll without user input.
- No overlapping foreground polls, fixed-frequency idle wakeups, duplicate submissions, or changes to notification semantics.
