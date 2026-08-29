# LLM Network Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure LLM request timeout and retry count from the Settings screen, with the values applied consistently to OpenAI-compatible and Android streaming requests.

**Architecture:** Extend the existing secure `AppSettings` model with validated network controls and map them into `H3AgentConfig`. The model adapter passes timeout/retry values to `ChatOpenAI`, while the Android XHR streaming shim reads a module-level timeout configured before an agent is created. Error normalization keeps timeout failures distinct from generic network failures.

**Tech Stack:** React Native, Expo SecureStore, Expo Router, LangChain `ChatOpenAI`, Android XHR/ReadableStream shim, Jest, TypeScript, Gradle.

---

### Task 1: Lock down settings defaults, persistence, and validation

**Files:**
- Modify: `mobile/src/settings/storage.ts`
- Modify: `mobile/src/settings/storage.test.ts`
- Modify: `mobile/src/settings/validation.ts`
- Modify: `mobile/src/settings/validation.test.ts`
- Modify: `mobile/src/agent/agentTypes.ts`
- Modify: `mobile/src/agent/agentConfig.test.ts`

- [ ] **Step 1: Add failing tests for defaults and secure persistence**

Assert that `readSettings()` returns `llmTimeoutSeconds: 600` and `llmMaxRetries: 2` when no values exist, and that `saveSettings()` writes `llm.timeoutSeconds` and `llm.maxRetries` as strings.

- [ ] **Step 2: Add failing tests for numeric validation and config mapping**

Assert that timeout accepts only an integer in `30..3600`, retries only an integer in `0..5`, and `toH3AgentConfig()` maps seconds to milliseconds while preserving the retry count.

- [ ] **Step 3: Run the focused tests and confirm they fail for missing fields**

Run `npm test -- --runInBand src/settings/storage.test.ts src/settings/validation.test.ts src/agent/agentConfig.test.ts` from `mobile`. Expected: new assertions fail before implementation.

- [ ] **Step 4: Implement defaults, secure keys, types, validation, and mapping**

Use the defaults above when reading empty storage, normalize string inputs on save, reject out-of-range values with user-facing Chinese validation messages, and add `timeoutMs`/`maxRetries` to `H3AgentConfig`.

- [ ] **Step 5: Re-run focused tests**

Expected: all settings/config tests pass.

### Task 2: Apply network controls to LLM and Android streaming

**Files:**
- Modify: `mobile/src/agent/modelAdapter.ts`
- Modify: `mobile/src/agent/modelAdapter.test.ts`
- Modify: `mobile/src/shims/copilotKitStreamingFetch.ts`
- Modify: `mobile/src/agent/localBoundary.test.ts`
- Modify: `mobile/src/runtimeCompatibility.ts` if configuration installation needs a public bridge

- [ ] **Step 1: Add failing model-construction assertions**

Mock `ChatOpenAI` and assert `createOpenAICompatibleModel()` passes `timeout` and `maxRetries` from the config.

- [ ] **Step 2: Add failing streaming-shim assertions**

Expose a small `configureStreamingFetch({ timeoutMs })` API and assert a fake XHR receives the configured timeout instead of the hard-coded 60 seconds.

- [ ] **Step 3: Implement the adapter and shim configuration**

Set the shim default to 600 seconds, keep it bounded to a positive finite value, and configure it from `createOpenAICompatibleModel()` before the model is used. Preserve caller abort behavior and idempotent stream cleanup.

- [ ] **Step 4: Normalize timeout vs network errors**

Convert `Network request timed out` into a message containing the configured timeout in seconds; retain a separate generic network-failure message. Do not hide HTTP status or API response errors.

- [ ] **Step 5: Run focused adapter/shim tests**

Run `npm test -- --runInBand src/agent/modelAdapter.test.ts src/agent/localBoundary.test.ts`. Expected: PASS.

### Task 3: Add the Advanced settings UI

**Files:**
- Modify: `mobile/app/(tabs)/settings.tsx`
- Create or modify: `mobile/app/(tabs)/settings.test.tsx` if the route has no UI test

- [ ] **Step 1: Add a failing UI test for the collapsed Advanced section**

Render the settings screen with mocked storage, assert the advanced fields are hidden initially, tap “高级设置”, and assert timeout/retry fields and their defaults become visible.

- [ ] **Step 2: Implement the collapsible section**

Add a compact disclosure row inside the existing “Prompt 助手 LLM” card. Use responsive width/padding from existing styles, numeric keyboard inputs, explanatory helper text, and labels `请求超时（秒）` and `最大重试次数`.

- [ ] **Step 3: Wire editing and saving**

Keep temporary text state so users can edit freely, call `prepareSettingsForSave()` on save, show validation errors in the existing alert path, and persist values through `saveSettings()`.

- [ ] **Step 4: Run the UI test**

Expected: PASS with the section collapsed by default and values editable after expansion.

### Task 4: End-to-end verification

**Files:**
- Inspect: all files above and `mobile/android/gradle.properties`

- [ ] **Step 1: Run full Jest and typecheck**

Run `npm test -- --runInBand` and `npm run typecheck` from `mobile`.

- [ ] **Step 2: Build and install Android debug APK**

Run `gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64`, install on `emulator-5554`, and launch.

- [ ] **Step 3: Verify the user flow**

Open Settings, expand Advanced, confirm defaults `600` and `2`, change timeout to a larger value, save, return to Prompt Assistant, and confirm no invalid-config error appears. Capture logcat for timeout/network strings if a request is available.

- [ ] **Step 4: Preserve unrelated workspace changes**

Do not modify or commit the pre-existing `mobile/android/gradle.properties` change.
