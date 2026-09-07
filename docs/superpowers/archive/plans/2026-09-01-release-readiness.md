# v1.4.5 Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make the current `dev` candidate safe to promote to `main` and publish as `v1.4.5`.

**Architecture:** Keep the existing release workflow and signing model. Remove the test-process lifecycle leak at its source, then update all three application version declarations and refresh the handoff's factual verification state.

**Tech Stack:** React Native/Expo 57, TypeScript, Jest 29, Android Gradle Plugin, GitHub Actions.

---

### Task 1: Classify the Jest process-lifecycle warning

**Files:**
- Inspect: `mobile/src/**/*.test.ts`, `mobile/src/**/*.test.tsx`, `mobile/src/**`
- Modify: none unless diagnostics identify a real application-owned handle

- [ ] **Step 1: Reproduce the exact CI command**

Run `npm test -- --runInBand` from `mobile` and record the final suite counts and whether the process exits without interruption.

- [ ] **Step 2: Identify the open handle**

Run `npm test -- --runInBand --detectOpenHandles --openHandlesTimeout=1000` and inspect changed tests for timers, subscriptions, fetch servers, or background tasks lacking cleanup. If diagnostics show only inherited stdio pipes and no application-owned resource, record this as a desktop-runner artifact and do not change production code.

- [ ] **Step 3: Add a focused regression test or cleanup assertion when needed**

If a real application-owned handle is found, the test must fail before the lifecycle fix and pass after it; do not use `--forceExit` as the production fix.

- [ ] **Step 4: Implement the minimal cleanup when needed**

Close or unsubscribe the owning resource in the corresponding `afterEach`/`afterAll` or production teardown path. Otherwise leave source unchanged.

- [ ] **Step 5: Verify the exact command in CI-equivalent execution**

Run `npm test -- --runInBand`; GitHub Actions remains authoritative for the hosted runner if the local desktop wrapper retains only stdio handles.

### Task 2: Prepare the release version

**Files:**
- Modify: `mobile/app.json`
- Modify: `mobile/package.json`
- Modify: `mobile/android/app/build.gradle`

- [ ] **Step 1: Update versions**

Set Expo and package versions to `1.4.5`, Gradle `versionName` to `1.4.5`, and increment `versionCode` from 14 to 15.

- [ ] **Step 2: Verify lockfile consistency**

Run `npm ci --dry-run --legacy-peer-deps` from `mobile` and confirm it succeeds without changing tracked files.

### Task 3: Refresh release handoff evidence

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`

- [ ] **Step 1: Correct stale baseline metadata**

Record the current release-readiness branch baseline and remove the obsolete statement that the main-workspace Android build is blocked, while preserving the remaining C/D known limitations.

- [ ] **Step 2: Record current verification**

Add the successful typecheck, 82-suite Jest run, Android debug build, and signing-environment checks with exact commands.

### Task 4: Full release gate

- [ ] **Step 1: Run `npm run typecheck` and `npm test -- --runInBand`**
- [ ] **Step 2: Run `:app:assembleDebug -PreactNativeArchitectures=x86_64`**
- [ ] **Step 3: Run `git diff --check` and verify a clean status**
- [ ] **Step 4: Commit the release-prep changes**

After this branch is reviewed, merge it to `dev`, promote `dev` to `main`, and create `v1.4.5` only after the GitHub release workflow passes.
