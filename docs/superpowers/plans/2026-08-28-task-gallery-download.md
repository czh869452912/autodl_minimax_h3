# Task Download Synchronization and Media Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep task/download state synchronized in the foreground and replace the result modal with a responsive video lightbox that shows first frames, long prompts, and working fullscreen playback.

**Architecture:** Extract deterministic task/media presentation helpers for testable React behavior. Use `yet-another-react-lightbox` as the result interaction shell, with a project-owned details panel and stable video viewport. Harden Android download reconciliation across lifecycle/polling boundaries and implement WebView custom fullscreen with landscape system UI handling.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `yet-another-react-lightbox`, Android Java 17, Android WebView, `DownloadManager`.

---

## File Map

- Create `frontend/src/utils/taskPresentation.ts`: pure task-to-gallery and task-state derivation helpers.
- Create `frontend/src/utils/taskPresentation.test.ts`: regression tests for local-video precedence and task classification.
- Create `frontend/src/components/MediaLightbox.tsx`: lightbox composition, video slide, responsive details, and stable close affordances.
- Create `frontend/src/components/MediaLightbox.test.ts`: source-contract tests compatible with the current Vitest setup.
- Modify `frontend/package.json` and `frontend/package-lock.json`: add the lightbox dependency.
- Modify `frontend/src/types.ts`, `frontend/src/App.tsx`, `frontend/src/components/TasksScreen.tsx`, `frontend/src/components/GalleryScreen.tsx`, and `frontend/src/utils/nativeBridge.ts`.
- Modify `app/src/main/java/com/example/autodlh3/MainActivity.java`: lifecycle download reconciliation and WebView fullscreen.
- Modify `app/src/main/AndroidManifest.xml` only if fullscreen configuration requires it.

### Task 1: Define Testable Task and Media State

**Files:**
- Create: `frontend/src/utils/taskPresentation.ts`
- Create: `frontend/src/utils/taskPresentation.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("uses a completed local download as the media source", () => {
  const task = makeTask({
    status: "SUCCESS",
    videoUrl: "https://example.test/video.mp4",
    localUri: "file:///storage/emulated/0/Movies/AutoDL-H3/task.mp4",
    downloadState: "下载中",
  });
  expect(resolveTaskMediaSource(task)).toBe(task.localUri);
  expect(getTaskDownloadPresentation(task)).toMatchObject({
    state: "ready",
    label: "本地视频就绪",
  });
});

it("classifies successful tasks as history even while download is running", () => {
  expect(classifyTask(makeTask({ status: "SUCCESS", downloadState: "下载中" }))).toBe("history");
});

it("keeps queued and running tasks active", () => {
  expect(classifyTask(makeTask({ status: "RUNNING", downloadState: "" }))).toBe("active");
});
```

Use a local makeTask fixture with the existing VideoTask fields and call real helpers.

- [ ] **Step 2: Run the focused test and verify RED**

Run from frontend:

```powershell
npm test -- src/utils/taskPresentation.test.ts
```

Expected: FAIL because the helper module and exports do not exist.

- [ ] **Step 3: Implement the minimal pure API**

Export TaskBucket, DownloadPresentation, resolveTaskMediaSource, classifyTask, getTaskDownloadPresentation, and `toGalleryItem(task: VideoTask): GalleryItem`. Local URI presence must win over a stale downloadState; map 已下载 to ready, 下载中 to downloading, 下载失败* to failed, and empty state to unknown. The gallery mapper must use the resolved media source for thumbnailUrl while preserving videoUrl as the remote fallback.

- [ ] **Step 4: Run tests and commit**

Run the focused test; expected PASS. Commit `test: define task media presentation states`.

### Task 2: Wire State and Decode Gallery First Frames

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/TasksScreen.tsx`
- Modify: `frontend/src/components/GalleryScreen.tsx`
- Modify: `frontend/src/utils/nativeBridge.ts`
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/components/GalleryScreen.test.ts`

- [ ] **Step 1: Write failing mapping and source-contract tests**

```ts
it("maps successful tasks with local media first", () => {
  const item = toGalleryItem(makeTask({
    status: "SUCCESS",
    localUri: "file:///ready.mp4",
    videoUrl: "https://remote/video.mp4",
  }));
  expect(item.thumbnailUrl).toBe("file:///ready.mp4");
  expect(item.videoUrl).toBe("https://remote/video.mp4");
});
```

The GalleryScreen source test must require preload=auto and a loadeddata or canplay handler.

- [ ] **Step 2: Run tests and verify RED**

Run `npm test -- src/utils/taskPresentation.test.ts src/components/GalleryScreen.test.ts`; expected failure because toGalleryItem and first-frame behavior are absent.

- [ ] **Step 3: Implement the wiring**

Use toGalleryItem in App, filter successful tasks with a media source, and type selectedVideo as GalleryItem | VideoTask | null. Make native media resolution local-first. In GalleryScreen use preload=auto, muted, playsInline, and loadeddata/canplay to call load and attempt currentTime=0 without playing. Use the download presentation helper in TasksScreen so local URI overrides stale persisted state.

- [ ] **Step 4: Run focused tests and commit**

Run both focused files; expected PASS. Commit `fix: prioritize local video task state and first frames`.

### Task 3: Add and Test the Mature Media Lightbox

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/components/MediaLightbox.tsx`
- Create: `frontend/src/components/MediaLightbox.test.ts`

- [ ] **Step 1: Install the dependency**

From frontend run:

```powershell
npm install yet-another-react-lightbox
```

Do not add a second gallery library or manually edit package-lock.json.

- [ ] **Step 2: Write failing source-contract tests**

Require the component to import the base lightbox plus the official Video and Fullscreen plugins, contain aspect-video, overflow-y-auto, onClose, and visible top details actions for 复制 Prompt and 在生成页重用此 Prompt.

- [ ] **Step 3: Run the focused test and verify RED**

Run `npm test -- src/components/MediaLightbox.test.ts`; expected FAIL because the component does not exist.

- [ ] **Step 4: Implement the lightbox**

Use a stable one-slide array, render only when item is non-null, enable Video and Fullscreen plugins, and configure the library close toolbar. The custom slide must keep the video viewport independent from details:

```tsx
<div className="grid min-h-0 h-full grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
  <div className="aspect-video min-h-0 bg-black md:aspect-auto">...</div>
  <aside className="min-h-0 max-h-[42dvh] overflow-y-auto md:max-h-none">...</aside>
</div>
```

Use native video controls, autoPlay, playsInline, resolveMediaSrc, and object-contain. Put a close button at the top of the details panel in addition to the library toolbar close. Keep copy/reuse actions reachable without scrolling to the bottom.

- [ ] **Step 5: Run focused tests and commit**

Run the component contract; expected PASS. Commit `feat: add responsive result media lightbox`.

### Task 4: Replace the Bespoke Modal

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/VideoModal.tsx`
- Modify: `frontend/src/components/MediaLightbox.tsx`
- Modify: `frontend/src/index.css` only for the one global lightbox stylesheet import.

- [ ] **Step 1: Write the failing integration contract**

Extend MediaLightbox.test.ts to require App renders MediaLightbox, does not render VideoModal directly, and types selectedVideo as GalleryItem | VideoTask | null.

- [ ] **Step 2: Run the contract and verify RED**

Run `npm test -- src/components/MediaLightbox.test.ts`; expected failure while App still renders the bespoke modal.

- [ ] **Step 3: Wire the replacement**

Pass selectedVideo, onClose, and the existing prompt reuse callback into MediaLightbox. Remove dead bespoke modal code or retain only a thin compatibility export if required by imports. Import the lightbox CSS once at app entry.

- [ ] **Step 4: Run all frontend tests and commit**

Run `npm test`; expected PASS. Commit `refactor: route results through media lightbox`.

### Task 5: Reconcile Android Downloads and Implement Fullscreen

**Files:**
- Modify: `app/src/main/java/com/example/autodlh3/MainActivity.java`
- Modify: `app/src/main/AndroidManifest.xml` only if required.
- Create: `frontend/src/androidContract.test.ts`

- [ ] **Step 1: Write the failing Android source contract**

```ts
expect(source).toContain("protected void onResume()");
expect(source).toContain("reconcileDownloads();");
expect(source).toContain("onShowCustomView");
expect(source).toContain("onHideCustomView");
```

The contract must initially fail for onResume, onShowCustomView, and onHideCustomView.

- [ ] **Step 2: Run the contract and verify RED**

Run `npm test -- src/androidContract.test.ts`; expected failure because the hooks are missing.

- [ ] **Step 3: Implement lifecycle download convergence**

Add onResume calling super, reconcileDownloads, notifyWebTasks, and pollTasks without duplicating an in-flight poll. Make unresolved download IDs continue through reconciliation until ready or failed. Keep local file existence as the first condition and persist/notify once after changes.

- [ ] **Step 4: Implement WebView custom fullscreen**

Add custom view, callback, previous orientation, and previous system UI fields. In WebChromeClient, onShowCustomView must reject a second view, save state, set SCREEN_ORIENTATION_LANDSCAPE, hide status/navigation bars with IMMERSIVE_STICKY, and attach the view with MATCH_PARENT layout. onHideCustomView must be idempotent, remove the parent view, restore orientation/system UI, and call the callback. Override onBackPressed so fullscreen exits first; clean up in onDestroy.

- [ ] **Step 5: Run contract/build checks and commit**

Run the Android contract and `.\\gradlew.bat assembleDebug`; expected contract PASS and Gradle exit code 0. Commit `fix: reconcile downloads and support webview fullscreen`.

### Task 6: Full Verification and Manual Acceptance

**Files:** Only files identified by failing verification.

- [ ] **Step 1: Run frontend checks**

From frontend run `npm test`, `npm run lint`, and `npm run build`; expected all tests pass, TypeScript exits 0, and Vite builds dist.

- [ ] **Step 2: Build the Android APK**

From repository root run `.\\gradlew.bat assembleDebug`; expected exit code 0 and an APK under app/build/outputs/apk/debug.

- [ ] **Step 3: Inspect the final diff**

Run `git diff --check` and `git status --short`. Confirm only planned source, tests, dependency, generated asset, and documentation files changed.

- [ ] **Step 4: Perform device/manual acceptance**

1. Background a submitted task until Android reports download success, return to the app, and confirm 本地视频就绪 appears immediately in tasks and results.
2. Confirm result cards show decoded first frames without hover.
3. Confirm a long Prompt keeps a large video viewport, details scroll independently, and top close/system back both work.
4. Confirm fullscreen enters landscape immersive playback and exits to portrait with system UI restored.

- [ ] **Step 5: Report fresh evidence**

If a check fails, add a focused failing test before fixing it. Report exact command outcomes and any device check that could not be run.
