# React Native Complete Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the old release's complete product behavior and visual hierarchy in one React Native Android application while keeping the current task/media/download data architecture.

**Architecture:** React Native owns every screen and interaction. Pure TypeScript business logic from the old frontend is moved into `mobile/src`; DOM components are re-expressed as RN presentation components. `@assistant-ui/react-native` owns assistant state and primitives, the current Agent runtime owns H3 behavior, and Android owns only platform media/download/picker capabilities through typed modules.

**Tech Stack:** React Native 0.86, Expo SDK 57, Expo Router, TypeScript, `@assistant-ui/react-native`, Expo SQLite/SecureStore/DocumentPicker, Android Media3, Android DownloadManager/WorkManager, Jest.

---

## File Map

- Create: `mobile/src/ui/theme.ts`, `mobile/src/ui/icons.ts`, `mobile/src/ui/AppHeader.tsx`, `mobile/src/ui/AppTabs.tsx` — shared visual tokens, stable icons, and app chrome.
- Create: `mobile/src/create/` — form state, attachment preview components, resolution constants, and media picker adapter.
- Create: `mobile/src/tasks/sync.ts`, `mobile/src/tasks/download.ts`, `mobile/src/tasks/hooks.ts` — foreground/background synchronization and idempotent download coordination.
- Create: `mobile/src/gallery/` — task-to-media projection, filters, selection state, poster loading and details sheet.
- Create: `mobile/src/agent/assistantRuntime.ts`, `mobile/src/agent/AssistantScreen.tsx`, `mobile/src/agent/assistantStorage.ts` — assistant-ui RN runtime composition, thread persistence, and attachment adapter.
- Create: `mobile/src/settings/SettingsScreen.tsx`, `mobile/src/settings/types.ts` — complete settings surface over the new storage model.
- Modify: `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`, and each tab route — shared shell and screen composition.
- Modify: `mobile/src/tasks/types.ts`, `mobile/src/tasks/api.ts`, `mobile/src/tasks/repository.ts` — canonical task schema and API resolution/media normalization.
- Modify: `mobile/src/native/media.ts`, `mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt`, `Media3PlayerActivity.java` — typed media operations, retry/download events, poster URI contract and fullscreen behavior.
- Delete after validation: simplified screen bodies and placeholder `mobile/src/media/VideoPlayer.tsx` implementation.
- Verify against: `D:\Claude-project\autodl_minimax_h3_reference_v1.0.0\frontend\src\components` and old frontend utility/agent files; do not copy old runtime storage or JSON task mirrors.

### Task 1: Lock the migration contracts and shared visual foundation

**Files:**
- Create: `mobile/src/ui/theme.ts`
- Create: `mobile/src/ui/icons.ts`
- Create: `mobile/src/ui/AppHeader.tsx`
- Create: `mobile/src/ui/AppTabs.tsx`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Test: `mobile/src/ui/ui-contract.test.ts`

- [ ] **Step 1: Write failing contract tests**

Assert that theme exports the old release's dark palette and spacing, icon registry contains `movie_filter`, `smart_toy`, `list_alt`, `grid_view`, and `settings`, and the shell exports exactly five tab names.

- [ ] **Step 2: Run the focused test and verify RED**

Run from `mobile`: `npm test -- ui-contract.test.ts`.
Expected: failure because the shared UI modules do not exist.

- [ ] **Step 3: Implement the shared foundation**

Use typed constants for colors, typography, spacing and tab metadata. Use a stable RN icon implementation (SVG/icon package or local vector paths) with a fallback glyph; never load a web font. Render `AppHeader` with the AutoDL H3 brand and `AppTabs` with safe-area padding and active state.

- [ ] **Step 4: Compose the router shell**

Wrap the root stack in `SafeAreaProvider`, render the header once above the tab navigator, and use `AppTabs` as the tab bar. Keep `video/[id]` outside the tab group so returning from Media3 never resets the selected tab.

- [ ] **Step 5: Run focused checks and commit**

Run `npm test -- ui-contract.test.ts` and `npm run typecheck`; expect PASS. Commit `feat: restore native app shell and icons`.

### Task 2: Rebuild the complete Create form with attachment previews

**Files:**
- Create: `mobile/src/create/resolutions.ts`
- Create: `mobile/src/create/AttachmentPreview.tsx`
- Create: `mobile/src/create/MediaPicker.ts`
- Create: `mobile/src/create/CreateForm.tsx`
- Modify: `mobile/app/(tabs)/create.tsx`
- Modify: `mobile/src/tasks/types.ts`, `mobile/src/tasks/api.ts`
- Test: `mobile/src/create/createForm.test.ts`

- [ ] **Step 1: Define the API-aligned resolution contract and failing tests**

Create a single `RESOLUTION_OPTIONS` list from the supported API values and test that every option is serialized unchanged by `buildTaskPayload`; test reference-image limits, audio limits, and removal behavior.

- [ ] **Step 2: Run the focused test and verify RED**

Run `npm test -- createForm.test.ts`.
Expected: failure for the missing resolution and attachment helpers.

- [ ] **Step 3: Implement form and picker adapters**

Keep `TaskMediaInput` as the canonical payload type. `MediaPicker` uses Expo DocumentPicker and returns cached URIs plus metadata; `AttachmentPreview` renders image thumbnails with remove controls and audio rows with play/pause. Keep 50 MB per-file validation and 9/3 limits.

- [ ] **Step 4: Implement Create screen behavior**

Render title/subtitle, prompt, resolution chips, duration, seed, reference sections and submit button using shared theme components. On submit, read settings, call `submitTask`, upsert the new task, and navigate to `/tasks`.

- [ ] **Step 5: Run checks and commit**

Run `npm test -- createForm.test.ts api.test.ts`, `npm run typecheck`; expect PASS. Commit `feat: restore complete native create form`.

### Task 3: Complete task synchronization and automatic downloads

**Files:**
- Create: `mobile/src/tasks/download.ts`
- Create: `mobile/src/tasks/sync.ts`
- Create: `mobile/src/tasks/hooks.ts`
- Modify: `mobile/src/tasks/repository.ts`, `mobile/src/tasks/types.ts`, `mobile/src/tasks/api.ts`
- Modify: `mobile/src/tasks/background.ts`
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Test: `mobile/src/tasks/download.test.ts`, `mobile/src/tasks/sync.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Cover `SUCCESS + videoUrl -> ENQUEUED -> DOWNLOADING -> DOWNLOADED`, retryable failure, duplicate enqueue prevention, local-file reconciliation after process restart, and poster generation scheduling.

- [ ] **Step 2: Run focused tests and verify RED**

Run `npm test -- download.test.ts sync.test.ts`.
Expected: failures because the coordinator and state transitions do not exist.

- [ ] **Step 3: Implement the idempotent download coordinator**

Use a repository-backed coordinator with a `.part` temporary path and atomic move. Foreground refresh and background task call the same `syncTasks` function. Every transition records `updatedAt`, download error and retryability; successful files always trigger poster extraction.

- [ ] **Step 4: Implement the full Tasks screen**

Show active/history sections, status badges, progress/download state, prompt summary, retry/download button, cancel, delete and clear-history actions. Subscribe to the sync hook and refresh on screen focus.

- [ ] **Step 5: Run checks and commit**

Run `npm test -- download.test.ts sync.test.ts api.test.ts`, `npm run typecheck`; expect PASS. Commit `feat: restore task polling and automatic downloads`.

### Task 4: Restore Gallery, posters, details and media actions

**Files:**
- Create: `mobile/src/gallery/presentation.ts`
- Create: `mobile/src/gallery/GalleryCard.tsx`
- Create: `mobile/src/gallery/GalleryFilters.tsx`
- Create: `mobile/src/gallery/MediaDetailsSheet.tsx`
- Modify: `mobile/app/(tabs)/gallery.tsx`
- Modify: `mobile/src/media/types.ts`, `mobile/src/media/repository.ts`, `mobile/src/native/media.ts`
- Test: `mobile/src/gallery/presentation.test.ts`

- [ ] **Step 1: Write failing gallery tests**

Test local URI precedence, poster URI precedence, successful-task filtering, prompt/ID search, status filters, multi-select deletion and empty/loading/error states.

- [ ] **Step 2: Run focused tests and verify RED**

Run `npm test -- presentation.test.ts`; expect failure for the missing projection/filter functions.

- [ ] **Step 3: Implement poster-first projection**

Map `TaskRecord` to `MediaAsset`, enqueue poster extraction when missing, persist the result, and keep local media ahead of remote URL. Use `FlatList` cards with actual thumbnails, title, duration and download badge.

- [ ] **Step 4: Implement Gallery interactions**

Add search, status/date filters, multi-select mode, delete confirmation, details sheet with full prompt and reuse action, and a clear empty state. Tapping a card routes to `/video/[id]` with the asset ID.

- [ ] **Step 5: Run checks and commit**

Run `npm test -- presentation.test.ts repository.test.ts`, `npm run typecheck`; expect PASS. Commit `feat: restore native gallery and poster presentation`.

### Task 5: Finish Media3 playback, fullscreen and safe return behavior

**Files:**
- Modify: `mobile/app/video/[id].tsx`
- Modify: `mobile/src/media/VideoPlayer.tsx`, `mobile/src/native/media.ts`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/Media3PlayerActivity.java`
- Test: `mobile/src/media/videoNavigation.test.ts`

- [ ] **Step 1: Write failing navigation contract tests**

Assert that the route resolves an asset from the repository, prefers local URI, rejects missing media with a recoverable message, and does not mutate tab navigation when opening/closing.

- [ ] **Step 2: Implement route and native playback contract**

The RN route loads the asset and invokes `openVideo`. The Media3 activity uses a controller with play/pause, seek, mute, fullscreen and close/back. Fullscreen only hides system bars in the player activity; it must not force the RN activity into landscape or finish it.

- [ ] **Step 3: Implement poster URI and lifecycle cleanup**

Return stable `file://` or content URIs accepted by RN `Image`, release retriever/player resources, and restore system bars on activity stop/destroy.

- [ ] **Step 4: Run checks and commit**

Run `npm test -- videoNavigation.test.ts`, `npm run typecheck`, and `mobile/android/gradlew.bat :app:assembleDebug --no-daemon --console=plain`; expect PASS. Commit `feat: complete native media playback flow`.

### Task 6: Migrate the full assistant-ui Agent surface to RN

**Files:**
- Create: `mobile/src/agent/assistantRuntime.ts`
- Create: `mobile/src/agent/assistantStorage.ts`
- Create: `mobile/src/agent/AssistantScreen.tsx`
- Create: `mobile/src/agent/AgentMessage.tsx`
- Create: `mobile/src/agent/AgentComposer.tsx`
- Modify: `mobile/src/agent/runtime.ts`, `mobile/src/agentSkills.generated.ts`
- Modify: `mobile/app/(tabs)/agent.tsx`
- Test: `mobile/src/agent/assistantRuntime.test.ts`, `mobile/src/agent/skillBundle.test.ts`

- [ ] **Step 1: Port pure agent contracts and write failing RN tests**

Move the old frontend agent event normalization, thread metadata, official skill lookup and attachment normalization into RN-compatible modules. Test cumulative stream snapshots become suffix deltas, tool calls remain stable, six official skill entries are present, and thread storage round-trips.

- [ ] **Step 2: Run focused tests and verify RED**

Run `npm test -- assistantRuntime.test.ts skillBundle.test.ts`; expect failures for the missing RN runtime/storage composition.

- [ ] **Step 3: Compose assistant-ui RN primitives**

Use `AssistantRuntimeProvider`, `ThreadPrimitive`, `ComposerPrimitive`, `MessagePrimitive`, `AttachmentPrimitive`, `ChainOfThoughtPrimitive`, `ActionBarPrimitive`, and `ThreadListPrimitive`. Keep exactly one message scroll viewport and one composer. Render user/assistant roles separately, show reasoning/tool parts, Markdown text and attachment thumbnails.

- [ ] **Step 4: Implement thread persistence and model settings**

Persist thread metadata/messages through an RN storage adapter keyed by the current schema. Use the settings repository for API key/endpoint/model and retain cancellation/error states. Do not import DOM components or browser-only APIs.

- [ ] **Step 5: Run checks and commit**

Run `npm test -- assistantRuntime.test.ts skillBundle.test.ts`, `npm run typecheck`; expect PASS. Commit `feat: restore assistant-ui agent on react native`.

### Task 7: Restore complete Settings and shared storage

**Files:**
- Create: `mobile/src/settings/types.ts`
- Create: `mobile/src/settings/SettingsScreen.tsx`
- Create: `mobile/src/settings/repository.ts`
- Modify: `mobile/src/settings/storage.ts`
- Modify: `mobile/app/(tabs)/settings.tsx`
- Test: `mobile/src/settings/settings.test.ts`

- [ ] **Step 1: Write failing settings tests**

Test validation for token/API key, default endpoint/model, save/reload, secure storage for secrets, and non-sensitive sync/download preferences.

- [ ] **Step 2: Implement storage and screen**

Render grouped cards matching the old release: AutoDL credentials, Prompt Assistant model configuration, media/download policy, background sync toggle, and diagnostics. Use SecureStore for secrets and SQLite/AsyncStorage adapter for preferences.

- [ ] **Step 3: Run checks and commit**

Run `npm test -- settings.test.ts`, `npm run typecheck`; expect PASS. Commit `feat: restore complete native settings`.

### Task 8: Integrate all screens and remove placeholders

**Files:**
- Modify: `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`
- Modify: `mobile/app/(tabs)/create.tsx`, `agent.tsx`, `tasks.tsx`, `gallery.tsx`, `settings.tsx`
- Delete: placeholder-only `mobile/src/media/VideoPlayer.tsx` implementation after replacement
- Test: `mobile/src/navigation/fullFlow.test.ts`

- [ ] **Step 1: Write route integration tests**

Assert root redirect, all five tab routes, video route, and tab labels/icon metadata. Assert no route imports a placeholder screen.

- [ ] **Step 2: Wire shared repositories and refresh hooks**

Create repositories once at the app boundary, pass typed dependencies to screens, refresh tasks/gallery on focus, and connect Agent “apply prompt” to Create without duplicating prompt state stores.

- [ ] **Step 3: Run JS verification**

Run `npm test`, `npm run typecheck`, and `npx expo install --check`; expect all tests pass and dependencies are aligned.

### Task 9: Delete obsolete WebView implementation and dependencies

**Files:**
- Delete: root `frontend/`
- Delete: root `app/`
- Delete: old root Gradle/build scripts no longer referenced
- Modify: `README.md`, `.gitignore`, CI/build documentation
- Modify: `mobile/package.json`, `mobile/package-lock.json`

- [ ] **Step 1: Verify RN parity checklist before deletion**

Run the full JS test suite and manually check every acceptance criterion from the design against the cloned release reference. Do not delete until Create, Agent, Tasks, Gallery, Settings and Media3 flows are each exercised.

- [ ] **Step 2: Remove obsolete code and package references**

Delete only files exclusively used by the old WebView/DOM shell. Keep official skill source and pure TypeScript logic that is imported by RN. Remove unused frontend dependencies and scripts.

- [ ] **Step 3: Run repository-wide reference checks**

Run `rg -n "frontend/|WebView|nativeBridge|window\.on|material-symbols|yet-another-react-lightbox" . -g '!node_modules'`; expected: no runtime references remain, except migration documentation explicitly describing their removal.

- [ ] **Step 4: Commit cleanup**

Commit `chore: remove obsolete webview implementation`.

### Task 10: Build and emulator acceptance

**Files:**
- Verify: all source files and `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Create temporarily: emulator screenshots/logs outside Git

- [ ] **Step 1: Run final static verification**

Run `npm test`, `npm run typecheck`, `npx expo install --check`, `git diff --check`; expected: zero failures and no dependency drift.

- [ ] **Step 2: Build all Android ABIs**

Run from `mobile/android`: `./gradlew.bat :app:assembleDebug --no-daemon --console=plain`; expected: `BUILD SUCCESSFUL` and a self-contained APK.

- [ ] **Step 3: Fresh-install emulator flow**

Uninstall `com.example.autodlh3`, install the APK, launch explicit `MainActivity`, and capture logcat plus screenshots. Verify no crash, no unmatched route, correct header/icons, all five tabs, Create attachment preview, Agent composer/thread list, Tasks state, Gallery empty and populated states, Settings persistence, and video full-screen return.

- [ ] **Step 4: Final review and push**

Run `git status --short`, review the full diff, commit any final test-only corrections, and push `dev` to `origin`.

