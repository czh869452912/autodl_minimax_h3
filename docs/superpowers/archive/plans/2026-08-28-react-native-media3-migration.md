# React Native + Media3 Native App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WebView-first Android shell with a React Native/Expo shell that keeps assistant-ui on native React primitives and provides a stable Media3-backed gallery/player.

**Architecture:** Use Expo Router and React Native for all screens. Keep H3 agent/runtime code in a platform-neutral package and adapt its storage/runtime to assistant-ui React Native. Store task/media metadata in SQLite, cache MP4/posters in app storage, and expose Android Media3 through a Fabric native component with an Expo Video fallback for development.

**Tech Stack:** React Native, Expo Router, `@assistant-ui/react-native`, `expo-video`, `expo-sqlite`, `expo-file-system`, AndroidX Media3, WorkManager, Kotlin/Java native modules, Vitest/Jest, Android instrumentation tests.

---

### Task 1: Create the React Native app shell

**Files:**
- Create: `mobile/package.json`
- Create: `mobile/app.json`
- Create: `mobile/tsconfig.json`
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/src/navigation/types.ts`
- Test: `mobile/src/navigation/types.test.ts`

- [ ] **Step 1: Write the failing navigation type test**

```ts
import type { ScreenName } from './types';

test('declares every product tab', () => {
  const tabs: ScreenName[] = ['create', 'agent', 'tasks', 'gallery', 'settings'];
  expect(tabs).toHaveLength(5);
});
```

- [ ] **Step 2: Run the test and verify it fails because the mobile package does not exist**

Run: `cd mobile; npm test -- --runInBand src/navigation/types.test.ts`
Expected: FAIL with a missing module/package error.

- [ ] **Step 3: Add the Expo shell and screen type**

Define `ScreenName` as the five tabs, configure Expo Router, and render a native tab scaffold. The shell must not import `window`, `document`, or `AndroidBridge`.

- [ ] **Step 4: Run the test and TypeScript check**

Run: `cd mobile; npm test -- --runInBand src/navigation/types.test.ts; npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile
git commit -m "feat: add react native app shell"
```

### Task 2: Port assistant-ui runtime and Agent screen

**Files:**
- Create: `mobile/src/agent/runtime.ts`
- Create: `mobile/src/agent/storage.ts`
- Create: `mobile/app/(tabs)/agent.tsx`
- Modify: `frontend/src/agent/h3Agent.ts`
- Modify: `frontend/src/agent/assistantAdapter.ts`
- Test: `mobile/src/agent/runtime.test.ts`

- [ ] **Step 1: Add a failing adapter compatibility test**

Test that the runtime accepts the existing H3 model factory and produces an assistant message from a streamed text event.

- [ ] **Step 2: Run the targeted test and verify failure**

Run: `cd mobile; npm test -- --runInBand src/agent/runtime.test.ts`
Expected: FAIL because the native runtime adapter is not present.

- [ ] **Step 3: Implement the native assistant-ui runtime**

Use `@assistant-ui/react-native` primitives and the existing H3 stream adapter. Replace browser `localStorage` with an async storage interface backed by SQLite in Task 3. Keep skill files imported from the shared generated bundle.

- [ ] **Step 4: Render the Agent screen with native primitives**

Use `AssistantRuntimeProvider`, `Thread`, `Composer`, and native `FlatList`-based message primitives. Preserve streaming, tool-call, attachment, and thread-switching behavior.

- [ ] **Step 5: Run tests and commit**

Run: `cd mobile; npm test -- --runInBand src/agent/runtime.test.ts; npm run typecheck`
Expected: PASS.

### Task 3: Add SQLite media repository and file cache

**Files:**
- Create: `mobile/src/media/schema.ts`
- Create: `mobile/src/media/repository.ts`
- Create: `mobile/src/media/fileCache.ts`
- Create: `mobile/src/media/types.ts`
- Test: `mobile/src/media/repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Cover upsert, list sorted by creation time, status filtering, deletion, and poster fallback when `posterPath` is absent.

- [ ] **Step 2: Run targeted tests and verify failure**

Run: `cd mobile; npm test -- --runInBand src/media/repository.test.ts`
Expected: FAIL because the repository functions are undefined.

- [ ] **Step 3: Implement schema and repository**

Create `tasks` and `media_assets` tables with stable IDs, URLs, local paths, poster paths, dimensions, duration, status, and timestamps. Use prepared statements and idempotent migrations.

- [ ] **Step 4: Implement file cache**

Store files under the app document directory, sanitize task IDs into filenames, expose `ensureVideoPath`, `ensurePosterPath`, and `removeAssetFiles`, and never expose arbitrary filesystem paths to the UI.

- [ ] **Step 5: Run tests and commit**

Run: `cd mobile; npm test -- --runInBand src/media/repository.test.ts; npm run typecheck`
Expected: PASS.

### Task 4: Implement reliable background download and poster extraction

**Files:**
- Create: `mobile/src/media/downloadService.ts`
- Create: `app/src/main/java/com/example/autodlh3/media/MediaDownloadWorker.java`
- Create: `app/src/main/java/com/example/autodlh3/media/PosterExtractor.java`
- Modify: `app/build.gradle`
- Modify: `app/src/main/AndroidManifest.xml`
- Test: `mobile/src/media/downloadService.test.ts`

- [ ] **Step 1: Write failing download state tests**

Verify transitions `queued → downloading → downloaded`, bounded retry, and terminal failure persistence.

- [ ] **Step 2: Run targeted tests and verify failure**

Run: `cd mobile; npm test -- --runInBand src/media/downloadService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add WorkManager and MediaMetadataRetriever implementation**

The worker downloads to the app-private media directory, atomically renames the completed file, extracts a JPEG poster at 0 ms, writes metadata, and retries only transient network failures with exponential backoff.

- [ ] **Step 4: Expose a narrow React Native native-module API**

Expose `enqueueMediaDownload`, `retryMediaDownload`, and `deleteMediaAsset`; callbacks return domain events, not raw DownloadManager or URI internals.

- [ ] **Step 5: Run Android compile and unit tests**

Run: `./gradlew :app:testDebugUnitTest :app:assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add mobile app
git commit -m "feat: add local media repository and background downloads"
```

### Task 5: Build the Media3 native player component

**Files:**
- Create: `app/src/main/java/com/example/autodlh3/media/Media3PlayerView.java`
- Create: `app/src/main/java/com/example/autodlh3/media/Media3PlayerPackage.java`
- Create: `mobile/src/media/VideoPlayer.tsx`
- Create: `mobile/src/media/ExpoVideoAdapter.tsx`
- Create: `mobile/src/media/Media3Player.tsx`
- Test: `mobile/src/media/VideoPlayer.test.tsx`

- [ ] **Step 1: Write failing player contract tests**

Cover `load`, `play`, `pause`, `seek`, `enterFullscreen`, `exitFullscreen`, `onFirstFrame`, `onError`, and release on unmount.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd mobile; npm test -- --runInBand src/media/VideoPlayer.test.tsx`
Expected: FAIL because the contract and adapters do not exist.

- [ ] **Step 3: Implement Media3 native view**

Use `ExoPlayer` and `PlayerView`, expose source, autoplay, controls, poster, and fullscreen callbacks through Fabric-compatible props/events. Fullscreen must operate inside a dedicated native container and must not call `setRequestedOrientation(LANDSCAPE)`.

- [ ] **Step 4: Implement React Native adapter and Expo fallback**

Select Media3 on Android production builds and Expo Video in development/web. Keep the same `VideoPlayerProps` and callbacks for both.

- [ ] **Step 5: Run tests, lint, and Android compile**

Run: `cd mobile; npm test -- --runInBand src/media/VideoPlayer.test.tsx; npm run typecheck; cd ..; ./gradlew :app:assembleDebug`
Expected: PASS and BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add mobile app
git commit -m "feat: add media3 native video player"
```

### Task 6: Implement native gallery and detail screens

**Files:**
- Create: `mobile/app/(tabs)/gallery.tsx`
- Create: `mobile/src/media/GalleryCard.tsx`
- Create: `mobile/src/media/VideoDetailScreen.tsx`
- Create: `mobile/src/media/MediaErrorState.tsx`
- Modify: `mobile/app/_layout.tsx`
- Test: `mobile/src/media/GalleryCard.test.tsx`

- [ ] **Step 1: Write failing gallery tests**

Verify poster-first rendering, no player mount before selection, status badges, search, sort, and recoverable error actions.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd mobile; npm test -- --runInBand src/media/GalleryCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement poster-first virtualized gallery**

Use `FlatList` or FlashList with stable keys and only load poster images in the list. The card must never autoplay a video or derive a poster by seeking a hidden HTML video.

- [ ] **Step 4: Implement detail screen**

Show Media3 player, prompt, metadata, copy/reuse actions, retry download, and open-external action. Use Android back handling to close detail/fullscreen before leaving the tab.

- [ ] **Step 5: Run tests and commit**

Run: `cd mobile; npm test -- --runInBand src/media/GalleryCard.test.tsx; npm run typecheck`
Expected: PASS.

### Task 7: Port remaining screens and native task bridge

**Files:**
- Create: `mobile/app/(tabs)/create.tsx`
- Create: `mobile/app/(tabs)/tasks.tsx`
- Create: `mobile/app/(tabs)/settings.tsx`
- Create: `mobile/src/native/autodlModule.ts`
- Create: `mobile/src/native/secureStore.ts`
- Modify: `app/src/main/java/com/example/autodlh3/MainActivity.java`
- Modify: `app/src/main/java/com/example/autodlh3/NativeBridge.java`
- Test: `mobile/src/native/autodlModule.test.ts`

- [ ] **Step 1: Write failing native-module contract tests**

Cover submit task, task status subscription, media picker, secure token read/write, and LLM config read/write.

- [ ] **Step 2: Implement TurboModule/native-module boundary**

Move Java API calls and Keystore access behind typed methods. Remove UI reliance on `window.AndroidBridge`; retain Java methods only as internal implementations during migration.

- [ ] **Step 3: Port create/tasks/settings screens**

Preserve current product behavior with React Native controls and the shared domain models. Reuse the media repository for task status and gallery derivation.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd mobile; npm test -- --runInBand src/native/autodlModule.test.ts; npm run typecheck`
Expected: PASS.

### Task 8: Switch Android entry point and remove WebView fullscreen path

**Files:**
- Modify: `app/src/main/AndroidManifest.xml`
- Modify: `app/src/main/java/com/example/autodlh3/MainActivity.java`
- Modify: `settings.gradle`
- Modify: `app/build.gradle`
- Modify: `README.md`
- Test: `app/src/androidTest/java/com/example/autodlh3/MediaGalleryInstrumentedTest.java`

- [ ] **Step 1: Add instrumentation tests for back/fullscreen behavior**

Verify opening a local portrait video, entering/exiting fullscreen without forced landscape, pressing back from fullscreen, and returning to gallery without Activity recreation.

- [ ] **Step 2: Replace WebView Activity content with React Native host**

Register the React Native host and native packages. Remove `WebChromeClient.onShowCustomView` orientation switching and all custom WebView fullscreen state.

- [ ] **Step 3: Build and run instrumentation tests**

Run: `./gradlew :app:connectedDebugAndroidTest :app:assembleDebug`
Expected: BUILD SUCCESSFUL and all media navigation tests pass.

- [ ] **Step 4: Update project documentation**

Document React Native/Expo setup, native module boundaries, SQLite schema, Media3 player contract, and migration notes. Remove WebView-first architecture claims.

- [ ] **Step 5: Commit**

```bash
git add app settings.gradle README.md
git commit -m "feat: switch android entry point to react native"
```

### Task 9: Full verification and cleanup

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/App.tsx`
- Delete after migration validation: `frontend/src/components/VideoModal.tsx`
- Delete after migration validation: `frontend/src/components/MediaLightbox.tsx`
- Test: `mobile/src/e2e/gallery-flow.test.ts`

- [ ] **Step 1: Run all JS tests and typechecks**

Run: `npm --prefix frontend test; npm --prefix frontend run lint; npm --prefix mobile test; npm --prefix mobile run typecheck`
Expected: PASS.

- [ ] **Step 2: Run Android build and instrumentation suite**

Run: `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:connectedDebugAndroidTest`
Expected: BUILD SUCCESSFUL and no fullscreen/gallery failures.

- [ ] **Step 3: Execute manual device matrix**

Validate portrait video, landscape video, missing poster, failed download, offline local playback, process recreation, system back gesture, and repeated fullscreen entry/exit.

- [ ] **Step 4: Remove obsolete WebView gallery/player code**

Only after the new shell passes the matrix, remove old gallery/lightbox/player imports and the WebView asset build dependency. Keep agent skill source files that are still consumed by the RN runtime.

- [ ] **Step 5: Commit final cleanup**

```bash
git add .
git commit -m "chore: remove obsolete webview media path"
```
