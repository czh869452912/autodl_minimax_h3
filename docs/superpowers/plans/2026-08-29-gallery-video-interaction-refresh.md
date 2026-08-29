# Gallery Video Interaction Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse gallery playback into one usable detail route with inline playback, independently scrollable long prompts, clear status semantics, and reliable fullscreen/back behavior.

**Architecture:** Keep task persistence and download APIs unchanged. Centralize gallery visibility/status labels in `src/gallery/presentation.ts`; make the gallery navigate directly to `/video/[id]`; make `/video/[id]` the only detail surface; and restore `expo-video` as a single inline Media3-backed player instance with native fullscreen controls. The old standalone `Media3PlayerActivity` remains unused by the gallery path and is not part of the normal playback flow.

**Tech Stack:** React Native 0.86, Expo Router 57, `expo-video` 57, Expo SQLite, Jest + `react-test-renderer`, Android Media3 through Expo.

---

### Task 1: Centralize gallery media/status projection

**Files:**
- Modify: `mobile/src/gallery/presentation.ts`
- Test: `mobile/src/gallery/presentation.test.ts`

- [ ] **Step 1: Write failing tests for generation/download semantics and labels**

Add cases to `presentation.test.ts`:

```ts
it('excludes queued, running, failed, cancelled, and successful tasks without a source', () => {
  const base = { ...task, localUri: undefined, videoUrl: 'https://example/video.mp4' };
  expect(projectGallery([{ ...base, status: 'QUEUED' }])).toEqual([]);
  expect(projectGallery([{ ...base, status: 'RUNNING' }])).toEqual([]);
  expect(projectGallery([{ ...base, status: 'FAILED' }])).toEqual([]);
  expect(projectGallery([{ ...base, status: 'CANCELLED' }])).toEqual([]);
  expect(projectGallery([{ ...base, status: 'SUCCESS', videoUrl: undefined }])).toEqual([]);
});

it('maps download lifecycle to user-facing gallery labels while retaining remote playback', () => {
  const base = { ...task, localUri: undefined, videoUrl: 'https://example/video.mp4' };
  expect(projectGallery([{ ...base, downloadState: 'DOWNLOADING' }])[0]).toMatchObject({ status: 'downloading' });
  expect(projectGallery([{ ...base, downloadState: 'DOWNLOAD_FAILED' }])[0]).toMatchObject({ status: 'failed' });
  expect(projectGallery([{ ...base, localUri: 'file:///local.mp4', downloadState: 'DOWNLOADED' }])[0]).toMatchObject({ status: 'downloaded', localPath: 'file:///local.mp4' });
});

it('provides stable Chinese status labels', () => {
  expect(mediaStatusLabel('downloading')).toBe('准备中');
  expect(mediaStatusLabel('failed')).toBe('下载失败');
  expect(mediaStatusLabel('downloaded')).toBe('已下载');
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing contract**

Run from `mobile`:

```powershell
npm test -- --runInBand src/gallery/presentation.test.ts
```

Expected: FAIL because `mediaStatusLabel` is not exported and the current projection does not explicitly reject all non-success states.

- [ ] **Step 3: Implement the minimal projection helpers**

Update `presentation.ts` to export:

```ts
export function mediaStatusLabel(status: MediaStatus): string {
  return status === 'downloaded' ? '已下载' : status === 'failed' ? '下载失败' : '准备中';
}
```

Keep `mediaSource` local-first. In `taskToMediaAsset`, return `null` unless `task.status === 'SUCCESS'` and `mediaSource(task)` is non-empty; map a local URI to `downloaded`, `DOWNLOAD_FAILED` to `failed`, and every other remote-only download state to `downloading`.

- [ ] **Step 4: Run focused and existing gallery tests**

```powershell
npm test -- --runInBand src/gallery/presentation.test.ts src/media/videoNavigation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/gallery/presentation.ts mobile/src/gallery/presentation.test.ts
git commit -m "fix: clarify gallery media status projection"
```

### Task 2: Remove the redundant gallery detail modal

**Files:**
- Modify: `mobile/app/(tabs)/gallery.tsx`
- Modify: `mobile/src/media/GalleryCard.tsx`
- Test: `mobile/app/(tabs)/gallery.test.tsx` (create)

- [ ] **Step 1: Write a failing navigation test**

Create `gallery.test.tsx` with mocks for `expo-sqlite`, task repository, poster extraction, `expo-router`, and `AppIcon`. Assert that pressing a card calls `router.push` directly and that no `Modal` is rendered:

```tsx
it('opens the video detail route directly without an intermediate modal', async () => {
  const push = jest.fn();
  mockedUseRouter.mockReturnValue({ push } as never);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<GalleryScreen />); });
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '打开视频 cinematic city' }).props.onPress());
  expect(push).toHaveBeenCalledWith({ pathname: '/video/[id]', params: { id: 'task-1' } });
  expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
});
```

- [ ] **Step 2: Run the test and verify it fails**

```powershell
npm test -- --runInBand "app/(tabs)/gallery.test.tsx"
```

Expected: FAIL because the current card press opens `detail` state and renders a `Modal`.

- [ ] **Step 3: Remove modal state and navigate from card press**

Delete `detail` state, `Modal` JSX, and clipboard logic from `gallery.tsx`. Add a `openAsset` callback that calls `router.push({ pathname: '/video/[id]', params: { id: asset.id } })`. Pass it to `GalleryCard` when not in selection mode. Preserve long-press selection and deletion behavior.

Update `GalleryCard` metadata to call `mediaStatusLabel(asset.status)` rather than displaying internal enum values, and keep accessibility labels stable.

- [ ] **Step 4: Run the focused test and typecheck**

```powershell
npm test -- --runInBand "app/(tabs)/gallery.test.tsx" src/gallery/presentation.test.ts
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```powershell
git add "mobile/app/(tabs)/gallery.tsx" mobile/src/media/GalleryCard.tsx "mobile/app/(tabs)/gallery.test.tsx"
git commit -m "fix: navigate gallery cards directly to video details"
```

### Task 3: Replace the click-to-launch shell with an inline `expo-video` player

**Files:**
- Modify: `mobile/src/media/VideoPlayer.tsx`
- Test: `mobile/src/media/VideoPlayer.test.tsx` (create)

- [ ] **Step 1: Write failing component tests**

Mock `expo-video` with a `useVideoPlayer` spy and a `VideoView` test component. Cover source, fullscreen configuration, and empty source:

```tsx
it('renders an inline VideoView with native controls and fullscreen enabled', () => {
  const tree = create(<VideoPlayer source="file:///video.mp4" poster="file:///poster.jpg" />);
  const view = tree.root.findByType(VideoView);
  expect(view.props.nativeControls).toBe(true);
  expect(view.props.fullscreenOptions).toMatchObject({ enable: true });
  expect(view.props.surfaceType).toBe('textureView');
  expect(view.props.useExoShutter).toBe(false);
});

it('renders a recoverable empty state without constructing a player', () => {
  create(<VideoPlayer source="" />);
  expect(useVideoPlayer).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

```powershell
npm test -- --runInBand src/media/VideoPlayer.test.tsx
```

Expected: FAIL because the current component is a Pressable that opens `Media3PlayerActivity` and does not render `VideoView`.

- [ ] **Step 3: Implement a single inline player instance**

Use `useVideoPlayer(source || null, player => { player.muted = false; player.loop = false; player.keepScreenOnWhilePlaying = true; player.bufferOptions = { minBufferForPlayback: 2, preferredForwardBufferDuration: 20 }; })`. Render `VideoView` with `nativeControls`, `contentFit="contain"`, `surfaceType="textureView"`, `useExoShutter={false}`, and `fullscreenOptions={{ enable: true, orientation: 'default' }}`. Keep the poster as an absolute cover image until `onFirstFrameRender`, then hide it; use `useEvent` for `statusChange` and show a retry button for `error` status that calls `player.replay()` and `player.play()`.

Do not call `openNativeVideo` from this component. This removes the second Activity/player creation that caused the multi-step flow and potential surface black frames.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
npm test -- --runInBand src/media/VideoPlayer.test.tsx src/media/videoNavigation.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/media/VideoPlayer.tsx mobile/src/media/VideoPlayer.test.tsx
git commit -m "fix: restore inline expo video playback"
```

### Task 4: Make the video detail route resilient to long prompts and back navigation

**Files:**
- Modify: `mobile/app/video/[id].tsx`
- Test: `mobile/app/video/videoDetail.test.tsx` (create)

- [ ] **Step 1: Write failing layout/interaction tests**

Mock the repository with one successful task containing a long prompt, mock `VideoPlayer` and clipboard, then assert:

```tsx
it('keeps long prompts in an independent scroll area and keeps copy outside it', async () => {
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoDetailScreen />); });
  expect(tree!.root.findByProps({ accessibilityLabel: '滚动 Prompt' })).toBeTruthy();
  expect(tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' })).toBeTruthy();
  expect(tree!.root.findByProps({ accessibilityLabel: '返回画廊' })).toBeTruthy();
});

it('shows a recoverable state when a successful task has no media source', async () => {
  mockedList.mockResolvedValue([{ ...task, videoUrl: undefined, localUri: undefined }]);
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoDetailScreen />); });
  expect(tree!.root.findAllByProps({ children: '视频源不可用' })).toHaveLength(1);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

```powershell
npm test -- --runInBand "app/video/videoDetail.test.tsx"
```

Expected: FAIL because the current screen uses one page-level `ScrollView`, has no independent prompt scroll region or labeled back/copy controls, and always mounts the click-to-launch shell.

- [ ] **Step 3: Implement the single detail surface**

Use `SafeAreaView` + page `ScrollView`. Put a top `Pressable` with `accessibilityLabel="返回画廊"`, a fixed-aspect player container immediately below, metadata with `mediaStatusLabel`, and a prompt card containing `ScrollView accessibilityLabel="滚动 Prompt"` with bounded `maxHeight` (around 240). Put `Pressable accessibilityLabel="复制 Prompt"` after the prompt card so it remains reachable. Use `mediaSource(task)` for local-first source selection.

Handle missing task and missing source separately. Disable or omit the player when source is empty. Await `Clipboard.setStringAsync` before showing success; show an error alert when copying rejects. Keep `router.back()` as the route-level back action. The native `VideoView` fullscreen control supplies the fullscreen exit affordance and Android back handling without opening a second screen.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
npm test -- --runInBand "app/video/videoDetail.test.tsx" "app/(tabs)/gallery.test.tsx"
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add "mobile/app/video/[id].tsx" "mobile/app/video/videoDetail.test.tsx"
git commit -m "fix: make video details scroll-safe and navigable"
```

### Task 5: Full verification and Android playback build

**Files:**
- No planned source changes; inspect `mobile/android/app/src/main/java/com/example/autodlh3/Media3PlayerActivity.java` only if build or manual verification reveals a remaining caller that still requires an explicit close action.

- [ ] **Step 1: Run the complete JavaScript test suite**

```powershell
cd mobile
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run static checks**

```powershell
npm run typecheck
```

Expected: PASS with no diagnostics.

- [ ] **Step 3: Build Android debug APK**

```powershell
cd android
./gradlew.bat assembleDebug
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Manual acceptance matrix**

On Android Emulator, verify: direct card navigation; short and screenshot-length prompt; inline play/pause/seek; fullscreen enter and exit by visible control and system back; local downloaded video; remote preparing video; remote download-failed video; missing-source state; and at least two full playback loops while watching for black frames. If a real device is available, repeat the same media on device and record whether black frames are emulator-only.

- [ ] **Step 5: Review diff and commit verification notes**

```powershell
git diff --check HEAD~4..HEAD
git status --short
```

Record any emulator-only limitation in the final response; do not claim the black-screen cause is known without reproduction evidence.
