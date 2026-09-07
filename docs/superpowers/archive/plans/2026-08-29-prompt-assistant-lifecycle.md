# Prompt Assistant Lifecycle and History Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Prompt Assistant conversations, image attachments, and active runs stable when the user changes tabs or returns to the screen, while making the first user message appear immediately.

**Architecture:** Keep a module-level runtime registry keyed by validated agent configuration and thread id so navigation remounts reuse the same `H3AgUiAgent` and its live run. Persist every agent message/state update through one serialized writer, hydrate the existing runtime synchronously before rendering the chat, and expose presentation helpers that normalize persisted image data into displayable data URIs. Android process suspension remains best-effort; an OS-kill requires a future native foreground service or server-side job.

**Tech Stack:** React Native, Expo Router, CopilotKit React Native headless chat, AG-UI `AbstractAgent`, Expo SQLite, Jest, Android emulator/adb.

---

### Task 1: Reproduce lifecycle and attachment failures

**Files:**
- Inspect: `mobile/app/(tabs)/_layout.tsx`, `mobile/app/_layout.tsx`, `mobile/src/agent/AgentScreen.tsx`, `mobile/src/agent/LocalCopilotKitProvider.tsx`
- Test evidence: Android emulator logcat, UI hierarchy, screenshots

- [ ] **Step 1: Confirm tab mount behavior and active-run cancellation**

Use the configured emulator and capture `uiautomator dump`, then start a Prompt Assistant run and immediately navigate to another tab. Capture logcat entries tagged `H3AgUiAgent`, `LocalCopilotKitProvider`, and `CopilotKit`, then return to the agent tab and capture the restored screen.

- [ ] **Step 2: Record the concrete failure modes**

Record whether the route unmounts, whether `H3AgUiAgent.run()` receives an unsubscribe/abort, whether the database snapshot contains the image content, and whether the UI receives the initial hydrated message list before the first render.

### Task 2: Add failing regression tests for restored images and immediate timeline state

**Files:**
- Modify: `mobile/src/agent/agentPresentation.test.ts`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`
- Create if needed: `mobile/src/agent/runtimeStore.test.ts`

- [ ] **Step 1: Test persisted `content[].type=image` display URI normalization**

Assert that a user message containing `{ type: 'image', source: { type: 'data', mimeType: 'image/jpeg', value: 'abc' } }` produces an attachment URI of `data:image/jpeg;base64,abc`, retaining its filename.

- [ ] **Step 2: Test runtime reuse by thread and configuration**

Create two snapshots for the same thread/config and assert the registry returns the same agent instance, while a different thread returns a different instance. Assert that an existing message is available immediately after `ensureRuntime`.

- [ ] **Step 3: Test the first submitted user message is visible before the run resolves**

Render the timeline/composer with a pending user row and `isRunning=true`; assert the user bubble is rendered and the progress indicator is attached after it rather than centered as the only row.

- [ ] **Step 4: Run the focused tests and verify they fail for the intended missing behavior**

Run `npm test -- --runInBand src/agent/agentPresentation.test.ts src/agent/PromptAssistantUi.test.tsx src/agent/runtimeStore.test.ts` from `mobile`. Expected: the new image URI, runtime reuse, and pending-row assertions fail before implementation.

### Task 3: Implement persistent runtime and deterministic hydration

**Files:**
- Create: `mobile/src/agent/runtimeStore.ts`
- Modify: `mobile/src/agent/AgentScreen.tsx`
- Modify: `mobile/src/agent/LocalCopilotKitProvider.tsx` only if provider subscription cleanup needs decoupling

- [ ] **Step 1: Implement the registry and serialized persistence**

Expose `ensurePromptRuntime(config, snapshot, threadStore)`, `subscribe`, `getSnapshot`, and `dispose`. Cache the `H3AgUiAgent`, hydrate messages/state before returning it, subscribe once to agent changes, and serialize `threadStore.save` calls so transient writes cannot overwrite newer state.

- [ ] **Step 2: Reuse the cached agent from `AgentSession`**

Replace per-mount `new H3AgUiAgent(...)` construction with the registry result. Do not reset the cached agent from a stale React ref on every remount; only hydrate a runtime when it has no in-memory state or when its persisted snapshot is newer.

- [ ] **Step 3: Preserve active runs across route remounts**

Ensure the run subscription is owned by the runtime registry, not by a screen effect. Route cleanup may remove UI listeners but must not call `abortRun`; explicit composer cancellation still calls `agent.stop()`/`abortRun()`.

- [ ] **Step 4: Run focused runtime and screen tests**

Run the focused Jest command again. Expected: all new tests pass and existing AgentScreen-related tests remain green.

### Task 4: Fix attachment rendering and first-send timeline ordering

**Files:**
- Modify: `mobile/src/agent/agentPresentation.ts`
- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`

- [ ] **Step 1: Normalize all persisted image variants for display**

Handle `image`, `image_url`, and attachment records; add a `data:` prefix for bare base64 values using the persisted MIME type, while leaving URL and already-prefixed data URIs unchanged.

- [ ] **Step 2: Add an optimistic user row in the composer flow**

When submit begins, synchronously add a local pending row containing the text and ready attachments. Render it before the running indicator, then reconcile/remove it once the agent message with the same submitted text/attachment set appears or the run fails.

- [ ] **Step 3: Keep the running indicator in timeline order**

Render the compact indicator as a footer whenever there are rows, and only use the centered empty-state indicator when there truly is no pending or persisted row.

- [ ] **Step 4: Run UI and presentation tests**

Run `npm test -- --runInBand src/agent/agentPresentation.test.ts src/agent/PromptAssistantUi.test.tsx`. Expected: PASS.

### Task 5: Verify on Android and document lifecycle boundary

**Files:**
- Inspect/modify only if required: `mobile/src/tasks/background.ts`, `mobile/app/_layout.tsx`
- Documentation: `docs/superpowers/plans/2026-08-29-prompt-assistant-lifecycle.md`

- [ ] **Step 1: Run the complete mobile test and typecheck suites**

Run `npm test -- --runInBand` and `npm run typecheck` from `mobile`; resolve regressions before building.

- [ ] **Step 2: Build and install the debug APK**

Run `gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64`, install the APK on `emulator-5554`, and verify the package launches.

- [ ] **Step 3: Exercise the three reported flows**

With a configured API key: send text plus image, switch tabs and return; start a long run, switch tabs and return; send a fresh message and confirm the user bubble appears immediately above progress. Capture logcat and UI hierarchy for failures.

- [ ] **Step 4: State the Android background limitation explicitly**

Confirm in the handoff that in-app tab changes preserve the runtime, while OS process termination/background suspension cannot be guaranteed by JavaScript alone and needs a future foreground service or server-side resumable task.
