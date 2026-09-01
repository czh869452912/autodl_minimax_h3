# B.1 Security and Reliability Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six B-stage review findings before C/D by enforcing workflow provenance, provider artifact boundaries, Registry network limits, and versioned local migrations.

**Architecture:** Make provenance mandatory at the Runtime API, make provider policies default-deny, and replace the two-request artifact flow with one injected streaming downloader that owns redirects, timeout, byte limits, MIME validation, and `.part` cleanup. Reuse the same bounded manual-redirect approach for Registry fetches, and move Registry schema setup behind the app database’s transactional migration runner with a recovery state.

**Tech Stack:** TypeScript, React Native/Expo FileSystem, Expo SQLite, Jest, Android Gradle/emulator verification.

---

### Task 1: Make workflow provenance mandatory

**Files:**
- Modify: `mobile/src/workflows/runtime/runtime.ts:8-49`
- Modify: `mobile/src/create/CreateForm.tsx:121-126`
- Test: `mobile/src/workflows/runtime/runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a test that calls `runtime.validateDraft(workflow, draft)` and expects `{ ok: false }` with `PROVENANCE_REQUIRED`, and a test that calls `runtime.submit(workflow, draft, {})` and verifies credentials, adapter, and job storage are untouched.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run from `mobile/`:

```powershell
npm test -- --runInBand src/workflows/runtime/runtime.test.ts
```

Expected: the two new tests fail because the current implementation synthesizes provenance from the draft.

- [ ] **Step 3: Implement the minimal fail-closed API**

Change `validateDraft` to accept `expected: WorkflowProvenance` without a default and return a `PROVENANCE_REQUIRED` validation result when it is absent. Change `submit` to read a typed provenance option and reject when absent before credential lookup. Keep the existing CreateForm active-record comparison and provenance argument unchanged.

- [ ] **Step 4: Run focused and regression tests**

```powershell
npm test -- --runInBand src/workflows/runtime/runtime.test.ts src/create/createForm.test.ts
```

Expected: all tests pass, and the new rejection proves no side-effect dependency is called.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/workflows/runtime/runtime.ts mobile/src/workflows/runtime/runtime.test.ts mobile/src/create/CreateForm.tsx
git commit -m "fix: require active workflow provenance for submission"
```

### Task 2: Fail closed for provider artifact hosts

**Files:**
- Modify: `mobile/src/workflows/providers/autodl/manifest.ts:3-12`
- Modify: `mobile/src/security/urlPolicy.ts:30-38`
- Modify: `mobile/src/tasks/media.ts:64-75`
- Modify: `mobile/src/tasks/sync.ts:20-24`
- Test: `mobile/src/tasks/downloadPolicy.test.ts`
- Test: `mobile/src/tasks/media.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a test that `validateArtifactUrl('https://public.example/video.mp4', [])` rejects and a media test that an artifact policy without a non-empty `allowedHosts` never calls the downloader. Add an AutoDL manifest assertion requiring its declared CDN host list to be non-empty.

- [ ] **Step 2: Run focused tests to verify they fail**

```powershell
npm test -- --runInBand src/tasks/downloadPolicy.test.ts src/tasks/media.test.ts src/workflows/providers/registry.test.ts
```

Expected: the new tests fail because an omitted/empty allowlist currently permits public HTTPS hosts.

- [ ] **Step 3: Implement the policy boundary**

Add a provider-policy validation helper that requires at least one normalized host for remote downloads. Configure the AutoDL manifest with `allowedHosts: ['autodl.art']`, which also covers `cdn.autodl.art` through the existing suffix match. Keep local-file reuse before policy validation. Pass the complete policy, including `timeoutMs`, through sync, coordinator, queue, and media layers.

- [ ] **Step 4: Run focused tests**

```powershell
npm test -- --runInBand src/tasks/downloadPolicy.test.ts src/tasks/media.test.ts src/tasks/coordinator.test.ts src/tasks/sync.test.ts
```

Expected: all focused tests pass and unallowlisted public hosts are rejected.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/workflows/providers/autodl/manifest.ts mobile/src/security/urlPolicy.ts mobile/src/tasks/media.ts mobile/src/tasks/sync.ts mobile/src/tasks/downloadPolicy.test.ts mobile/src/tasks/media.test.ts
git commit -m "fix: fail closed on provider artifact host policy"
```

### Task 3: Replace artifact download with a single bounded stream

**Files:**
- Modify: `mobile/src/tasks/downloadPolicy.ts`
- Modify: `mobile/src/tasks/download.ts`
- Modify: `mobile/src/tasks/media.ts`
- Test: `mobile/src/tasks/downloadPolicy.test.ts`
- Test: `mobile/src/tasks/download.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for: a second redirect returned by the actual body request to an unallowlisted host; a streamed response that crosses `maxBytes`; a body read that exceeds `timeoutMs`; and cleanup of `.part` after each failure. Use an injected fetcher and a small file-writer abstraction so tests exercise real policy code rather than the native downloader mock.

- [ ] **Step 2: Run focused tests to verify the failures**

```powershell
npm test -- --runInBand src/tasks/downloadPolicy.test.ts src/tasks/download.test.ts
```

Expected: the new tests fail because the current preflight and native `downloadAsync` are separate request chains and timeout is ignored.

- [ ] **Step 3: Implement the bounded downloader**

Implement a `downloadArtifact` helper that owns an `AbortController` and deadline, performs manual redirects (maximum three), validates every target, checks status and MIME, reads chunks through the response reader, aborts over `maxBytes`, and writes bytes to the `.part` destination. Ensure the timer is cleared only after the body is fully read. `downloadTask` must call this helper once and move the same `.part` path only after successful validation; all failure paths delete the partial file.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
npm test -- --runInBand src/tasks/downloadPolicy.test.ts src/tasks/download.test.ts src/tasks/media.test.ts
npm run typecheck
```

Expected: focused tests and typecheck pass; no call to `FileSystem.downloadAsync` remains in the production artifact path.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/tasks/downloadPolicy.ts mobile/src/tasks/download.ts mobile/src/tasks/media.ts mobile/src/tasks/downloadPolicy.test.ts mobile/src/tasks/download.test.ts
git commit -m "fix: stream provider artifacts through one bounded request"
```

### Task 4: Harden Registry fetches for redirects and body timeouts

**Files:**
- Modify: `mobile/src/workflows/registry/service.ts:40-77`
- Test: `mobile/src/workflows/registry/service.test.ts`

- [ ] **Step 1: Write failing tests**

Add a test where an allowlisted Registry URL returns a redirect to an unallowlisted domain and expect `REGISTRY_DOMAIN_REJECTED`. Add a body-reader test with a deferred `ReadableStream` and fake timers that expects an abort/timeout while consuming the body.

- [ ] **Step 2: Run focused tests to verify they fail**

```powershell
npm test -- --runInBand src/workflows/registry/service.test.ts
```

Expected: current `fetchSafe` follows redirects automatically and clears its timer before `readLimited` completes.

- [ ] **Step 3: Implement shared safe fetch behavior**

Make `fetchSafe` validate the initial and every redirect target against `allowDomains`, use a three-hop cap, pass `redirect: 'manual'`, and expose a response reader that keeps the same AbortController alive through `readLimited`. Apply it to index, package, and signature requests.

- [ ] **Step 4: Run Registry tests and typecheck**

```powershell
npm test -- --runInBand src/workflows/registry/service.test.ts src/workflows/registry/packageBoundary.test.ts
npm run typecheck
```

Expected: all Registry tests pass and package/signature verification remains unchanged.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/workflows/registry/service.ts mobile/src/workflows/registry/service.test.ts
git commit -m "fix: bound Registry redirects and response reads"
```

### Task 5: Introduce transactional schema version 5 and recovery state

**Files:**
- Modify: `mobile/src/storage/database.ts`
- Modify: `mobile/src/storage/databaseClient.ts`
- Modify: `mobile/src/workflows/registry/repository.ts`
- Test: `mobile/src/storage/database.test.ts`
- Test: `mobile/src/workflows/registry/repository.test.ts`

- [ ] **Step 1: Write failing migration tests**

Add tests proving version 4 migrates to version 5 without dropping legacy tables, rerunning migration is a no-op, and an injected DDL failure rolls back and records a read-only recovery diagnostic. Add a repository test proving construction no longer executes standalone Registry `CREATE/ALTER` statements.

- [ ] **Step 2: Run focused tests to verify they fail**

```powershell
npm test -- --runInBand src/storage/database.test.ts src/workflows/registry/repository.test.ts
```

Expected: current code either leaves version unchanged or executes repository-local DDL and has no recovery state.

- [ ] **Step 3: Implement migration runner**

Raise `APP_SCHEMA_VERSION` to 5. Add `runAppMigrations(db, { backup })`, where `backup()` runs before any DDL, and add `getAppRecoveryState(db)` plus `markAppRecovery(db, diagnostic)` to persist a read-only recovery record in a dedicated app-owned metadata table. Wrap each migration in the existing transaction helper; on failure, rollback and mark the database read-only without dropping legacy tables. Put all Registry table/column changes in the migration and remove repository constructor DDL. Keep migrations repeatable by checking schema state/version before applying each step.

- [ ] **Step 4: Run migration and Registry tests**

```powershell
npm test -- --runInBand src/storage/database.test.ts src/workflows/registry/repository.test.ts src/tasks/repository.test.ts src/jobs/repository.test.ts
npm run typecheck
```

Expected: migration tests pass, legacy tables remain present, and failed migration exposes recovery state without deleting data.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/storage/database.ts mobile/src/storage/databaseClient.ts mobile/src/workflows/registry/repository.ts mobile/src/storage/database.test.ts mobile/src/workflows/registry/repository.test.ts
git commit -m "fix: migrate registry schema transactionally with recovery"
```

### Task 6: Full release verification

**Files:**
- No source changes unless a verification regression is found.
- Review: `docs/superpowers/plans/2026-09-01-b1-closure.md`
- Review: `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`

- [ ] **Step 1: Run the full TypeScript and Jest gates**

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
```

Expected: typecheck exits 0; all Jest suites pass with no new skips.

- [ ] **Step 2: Run the real Android build gate**

Use the established main-workspace Gradle command with Temurin 21 and Android SDK, then install to `emulator-5554`.

Expected: `BUILD SUCCESSFUL`, APK installs, `MainActivity` cold-starts, and logcat contains no fatal/native loader/SQLite crash signatures.

- [ ] **Step 3: Inspect the final diff and commit**

```powershell
git diff --check HEAD~6..HEAD
git status --short
git log --oneline -8
```

Expected: clean worktree, all six findings mapped to tests and implementation, and no unrelated C/D changes.

- [ ] **Step 4: Commit verification evidence**

```powershell
git add docs/superpowers/plans/2026-09-01-b1-security-reliability-closure.md
git commit -m "docs: record B.1 closure verification"
```
