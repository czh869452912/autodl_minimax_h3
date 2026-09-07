# Video Storage and System Gallery Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep reliable app-private video files while publishing completed MP4s to Android MediaStore so they appear under `Movies/AutoDL-H3`, with configurable automatic export, manual retry, and historical migration.

**Architecture:** Preserve `downloadTask` as the private-file transfer primitive. Add a task-level media orchestrator that independently advances download and export state, and add one idempotent Android native `exportVideo` operation that owns MediaStore lookup, pending-row lifecycle, copying, and recovery. The UI reads separate download/export states and never treats a gallery publication failure as a download failure.

**Tech Stack:** React Native 0.86, Expo SDK 57, TypeScript 6, Expo FileSystem, Expo SQLite, Expo SecureStore, Android Kotlin, Android MediaStore API 29+, Jest 29, React Test Renderer.

**Spec:** `docs/superpowers/specs/2026-08-30-media-export-storage-design.md`

## Global Constraints

- Support Android 10 (API 29) and newer only; do not add legacy raw external-storage handling.
- Publish videos to `MediaStore.Video` with `RELATIVE_PATH = Movies/AutoDL-H3/` and `MIME_TYPE = video/mp4`.
- Keep `downloadState` and `exportState` independent.
- Keep `localUri` as the private source and `galleryUri` as the public `content://` reference; never overwrite one with the other.
- Default `media.autoExportToGallery` and `media.keepPrivateCopy` to `true`.
- Do not silently export pre-upgrade downloads; historical export is a user-triggered action.
- Repeated export of one task ID must reuse the existing MediaStore item.
- Deleting an App task must not delete its public MediaStore copy.
- Preserve the user's existing `mobile/android/gradle.properties` changes.

## File Structure

- `mobile/src/tasks/types.ts`: download/export state and persisted task fields.
- `mobile/src/tasks/repository.ts`: SQLite schema migration and task mapping.
- `mobile/src/settings/storage.ts`: persisted media export policy.
- `mobile/src/settings/validation.ts`: normalization of the settings form model.
- `mobile/src/native/media.ts`: typed JavaScript boundary for the native publisher.
- `mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt`: React Native methods only.
- `mobile/android/app/src/main/java/com/example/autodlh3/MediaStorePublisher.kt`: focused MediaStore lookup/copy/cleanup implementation.
- `mobile/src/tasks/media.ts`: download/export orchestration, recovery, and historical migration.
- `mobile/src/tasks/sync.ts`: calls the shared orchestrator for new and interrupted tasks.
- `mobile/src/gallery/presentation.ts`: playback-source fallback and user-facing media/export labels.
- `mobile/app/(tabs)/settings.tsx`: storage policy switches and historical migration action.
- `mobile/app/(tabs)/tasks.tsx`: separate download/export status and retry action.
- `mobile/app/video/[id].tsx`: manual save-to-gallery action and exported playback fallback.

---

### Task 1: Persist Export State and Resolve Public Playback Sources

**Files:**
- Modify: `mobile/src/tasks/types.ts`
- Modify: `mobile/src/tasks/repository.ts`
- Modify: `mobile/src/tasks/repository.test.ts`
- Modify: `mobile/src/gallery/presentation.ts`
- Modify: `mobile/src/media/videoNavigation.test.ts`

**Interfaces:**
- Produces: `ExportState`, `TaskRecord.galleryUri`, `TaskRecord.exportState`, `TaskRecord.exportError`, `TaskRecord.exportedAt`.
- Produces: `mediaSource(task)` with priority `localUri → galleryUri → videoUrl`.
- Consumes: existing `TaskRecord`, SQLite repository, and gallery presentation functions.

- [ ] **Step 1: Write failing persistence and playback-source tests**

Extend `mobile/src/tasks/repository.test.ts` so the fake row includes the new insert parameters and verify round-trip persistence:

```ts
test('persists gallery publication independently from private download', async () => {
  const store = createTaskRepository(fakeDb() as never);
  const task: TaskRecord = {
    id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5,
    localUri: 'file:///private.mp4', galleryUri: 'content://media/video/7',
    downloadState: 'DOWNLOADED', exportState: 'EXPORTED', exportedAt: 3_000,
    createdAt: 1_000, updatedAt: 3_000,
  };
  await store.upsert(task);
  expect((await store.list())[0]).toMatchObject({
    localUri: 'file:///private.mp4',
    galleryUri: 'content://media/video/7',
    downloadState: 'DOWNLOADED',
    exportState: 'EXPORTED',
    exportedAt: 3_000,
  });
});
```

Extend `mobile/src/media/videoNavigation.test.ts`:

```ts
it('falls back from the private file to the published gallery item', () => {
  expect(mediaSource({
    galleryUri: 'content://media/video/7',
    videoUrl: 'https://example/video.mp4',
  })).toBe('content://media/video/7');
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run from `mobile`:

```powershell
npm test -- --runInBand src/tasks/repository.test.ts src/media/videoNavigation.test.ts
```

Expected: TypeScript/Jest failure because `galleryUri`, `exportState`, and `exportedAt` do not exist and `mediaSource` ignores the public URI.

- [ ] **Step 3: Add the export types and SQLite columns**

Add to `mobile/src/tasks/types.ts`:

```ts
export type ExportState =
  | 'NOT_REQUESTED'
  | 'QUEUED'
  | 'EXPORTING'
  | 'EXPORTED'
  | 'EXPORT_FAILED';
```

Extend `TaskRecord`:

```ts
galleryUri?: string;
exportState?: ExportState;
exportError?: string;
exportedAt?: number;
```

Add these columns to the create schema and idempotent migration statements in `repository.ts`:

```sql
gallery_uri TEXT,
export_state TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
export_error TEXT,
exported_at INTEGER
```

Extend `map()` and the `INSERT OR REPLACE` parameter list. Existing rows must map missing values to `NOT_REQUESTED`; `exported_at` maps to `undefined` when null.

- [ ] **Step 4: Implement the playback source priority**

Change the projection signature and expression:

```ts
export function mediaSource(
  task: Pick<TaskRecord, 'localUri' | 'galleryUri' | 'videoUrl'>,
) {
  return task.localUri?.trim()
    || task.galleryUri?.trim()
    || task.videoUrl?.trim()
    || '';
}
```

Update `taskToMediaAsset` so a valid `galleryUri` counts as downloaded media even if `localUri` has been removed.

- [ ] **Step 5: Run focused tests and typecheck**

```powershell
npm test -- --runInBand src/tasks/repository.test.ts src/media/videoNavigation.test.ts src/gallery/presentation.test.ts
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit the persistence slice**

```powershell
git add mobile/src/tasks/types.ts mobile/src/tasks/repository.ts mobile/src/tasks/repository.test.ts mobile/src/gallery/presentation.ts mobile/src/media/videoNavigation.test.ts
git commit -m "feat: persist gallery export state"
```

---

### Task 2: Persist the Media Export Policy

**Files:**
- Modify: `mobile/src/settings/storage.ts`
- Modify: `mobile/src/settings/validation.ts`
- Modify: `mobile/src/settings/storage.test.ts`
- Modify: `mobile/src/settings/validation.test.ts`

**Interfaces:**
- Produces: `AppSettings.autoExportToGallery: boolean` and `AppSettings.keepPrivateCopy: boolean`.
- Consumes: current SecureStore-backed settings API and the settings form normalization function.

- [ ] **Step 1: Write failing default and persistence tests**

Add to `storage.test.ts`:

```ts
it('defaults media export and private retention to enabled', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  await expect(readSettings()).resolves.toMatchObject({
    autoExportToGallery: true,
    keepPrivateCopy: true,
  });
});

it('persists disabled media policy as explicit booleans', async () => {
  await saveSettings({ autoExportToGallery: false, keepPrivateCopy: false });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('media.autoExportToGallery', 'false');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('media.keepPrivateCopy', 'false');
});
```

Update every full `AppSettings` fixture in `validation.test.ts` to include both booleans, then assert `prepareSettingsForSave` preserves them.

- [ ] **Step 2: Run the tests and confirm they fail**

```powershell
npm test -- --runInBand src/settings/storage.test.ts src/settings/validation.test.ts
```

Expected: failures because the settings type and storage keys do not exist.

- [ ] **Step 3: Implement boolean serialization**

Add keys and fields in `storage.ts`:

```ts
autoExportToGallery: 'media.autoExportToGallery',
keepPrivateCopy: 'media.keepPrivateCopy',
```

```ts
autoExportToGallery: boolean;
keepPrivateCopy: boolean;
```

Read `null` as `true` and only the literal string `false` as disabled:

```ts
autoExportToGallery: autoExportToGallery !== 'false',
keepPrivateCopy: keepPrivateCopy !== 'false',
```

Serialize both booleans with `String(value)`. Preserve them unchanged in `prepareSettingsForSave`; do not run string normalization on boolean fields.

- [ ] **Step 4: Run settings tests and typecheck**

```powershell
npm test -- --runInBand src/settings/storage.test.ts src/settings/validation.test.ts
npm run typecheck
```

Expected: all pass after updating settings fixtures throughout the test suite.

- [ ] **Step 5: Commit the policy slice**

```powershell
git add mobile/src/settings/storage.ts mobile/src/settings/validation.ts mobile/src/settings/storage.test.ts mobile/src/settings/validation.test.ts
git commit -m "feat: persist video export policy"
```

---

### Task 3: Publish Videos Idempotently Through Android MediaStore

**Files:**
- Create: `mobile/android/app/src/main/java/com/example/autodlh3/MediaStorePublisher.kt`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt`
- Modify: `mobile/src/native/media.ts`
- Create: `mobile/src/native/media.test.ts`

**Interfaces:**
- Produces: `exportVideo(sourceUri, { mediaId, displayName? }): Promise<ExportVideoResult>`.
- `ExportVideoResult`: `{ uri: string; displayName: string; relativePath: 'Movies/AutoDL-H3/'; alreadyExisted: boolean }`.
- Consumes: Android `ContentResolver`, `MediaStore.Video`, and an app-private `file://` or an existing `content://` source.

- [ ] **Step 1: Write the failing TypeScript bridge contract test**

Create `mobile/src/native/media.test.ts`:

```ts
import { exportVideo } from './media';

describe('native gallery publisher', () => {
  it('passes a stable media id and file name to Android', async () => {
    const native = {
      exportVideo: jest.fn().mockResolvedValue({
        uri: 'content://media/video/7',
        displayName: 'task-1.mp4',
        relativePath: 'Movies/AutoDL-H3/',
        alreadyExisted: false,
      }),
    };
    await expect(exportVideo('file:///private.mp4', {
      mediaId: 'task-1',
      displayName: 'task-1.mp4',
    }, native as never)).resolves.toMatchObject({ uri: 'content://media/video/7' });
    expect(native.exportVideo).toHaveBeenCalledWith(
      'file:///private.mp4', 'task-1', 'task-1.mp4',
    );
  });

  it('rejects a blank source before invoking Android', async () => {
    await expect(exportVideo(' ', { mediaId: 'task-1' }, {} as never))
      .rejects.toThrow('视频源为空');
  });
});
```

- [ ] **Step 2: Run the bridge test and confirm it fails**

```powershell
npm test -- --runInBand src/native/media.test.ts
```

Expected: failure because `exportVideo` is not exported.

- [ ] **Step 3: Add the typed JavaScript wrapper**

Extend the native module type and export:

```ts
export type ExportVideoResult = {
  uri: string;
  displayName: string;
  relativePath: 'Movies/AutoDL-H3/';
  alreadyExisted: boolean;
};

type ExportVideoOptions = { mediaId: string; displayName?: string };

export async function exportVideo(
  source: string,
  options: ExportVideoOptions,
  module: AutoDLMediaModule | undefined = NativeModules.AutoDLMedia,
): Promise<ExportVideoResult> {
  if (!source.trim()) throw new Error('视频源为空');
  if (!options.mediaId.trim()) throw new Error('媒体 ID 为空');
  if (Platform.OS !== 'android' || !module?.exportVideo) throw new Error('当前设备不支持保存到系统相册');
  return module.exportVideo(
    source,
    options.mediaId,
    options.displayName?.trim() || `${options.mediaId}.mp4`,
  );
}
```

- [ ] **Step 4: Implement the focused MediaStore publisher**

Create `MediaStorePublisher.kt` with these behaviors:

```kotlin
private const val RELATIVE_PATH = "Movies/AutoDL-H3/"

data class PublishedVideo(
  val uri: Uri,
  val displayName: String,
  val alreadyExisted: Boolean,
)

fun publish(source: String, mediaId: String, requestedName: String): PublishedVideo {
  val displayName = sanitizeFileName(requestedName.ifBlank { "$mediaId.mp4" })
  findCompleted(displayName)?.let {
    return PublishedVideo(it, displayName, true)
  }
  deletePending(displayName)
  val values = ContentValues().apply {
    put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
    put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
    put(MediaStore.Video.Media.RELATIVE_PATH, RELATIVE_PATH)
    put(MediaStore.Video.Media.IS_PENDING, 1)
  }
  val target = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
    ?: throw IllegalStateException("无法创建系统媒体文件")
  try {
    resolver.openOutputStream(target, "w").use { output ->
      requireNotNull(output) { "无法写入系统媒体文件" }
      openSource(source).use { input -> input.copyTo(output) }
    }
    resolver.update(target, ContentValues().apply {
      put(MediaStore.Video.Media.IS_PENDING, 0)
    }, null, null)
    return PublishedVideo(target, displayName, false)
  } catch (error: Exception) {
    resolver.delete(target, null, null)
    throw error
  }
}
```

`findCompleted` and `deletePending` query exact `DISPLAY_NAME` plus `RELATIVE_PATH`. Crucially, lookup happens before `openSource`, so passing a persisted `content://` URI can verify/recover an existing entry even after its private copy was removed. `openSource` supports `file://` with `FileInputStream` and `content://` with `ContentResolver.openInputStream`. Sanitize names to `[A-Za-z0-9._-]`, always enforce `.mp4`, and never accept path separators.

- [ ] **Step 5: Expose `exportVideo` from `MediaModule.kt`**

Create one `MediaStorePublisher(context.contentResolver)` instance. Add a React method that runs on the existing executor and resolves a `WritableNativeMap`:

```kotlin
@ReactMethod
fun exportVideo(source: String, mediaId: String, displayName: String, promise: Promise) {
  executor.execute {
    try {
      val result = publisher.publish(source, mediaId, displayName)
      promise.resolve(Arguments.createMap().apply {
        putString("uri", result.uri.toString())
        putString("displayName", result.displayName)
        putString("relativePath", "Movies/AutoDL-H3/")
        putBoolean("alreadyExisted", result.alreadyExisted)
      })
    } catch (error: Exception) {
      promise.reject("EXPORT_FAILED", error.message ?: "保存到系统相册失败", error)
    }
  }
}
```

- [ ] **Step 6: Run bridge tests, typecheck, and Android compilation**

```powershell
npm test -- --runInBand src/native/media.test.ts
npm run typecheck
Set-Location android
.\gradlew.bat :app:compileDebugKotlin
```

Expected: all pass. No new storage permission should be added to the manifest.

- [ ] **Step 7: Commit the native publisher slice**

```powershell
git add mobile/src/native/media.ts mobile/src/native/media.test.ts mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt mobile/android/app/src/main/java/com/example/autodlh3/MediaStorePublisher.kt
git commit -m "feat: publish videos through MediaStore"
```

---

### Task 4: Orchestrate Download, Automatic Export, Recovery, and Migration

**Files:**
- Create: `mobile/src/tasks/media.ts`
- Create: `mobile/src/tasks/media.test.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/tasks/api.test.ts` or `mobile/src/tasks/sync.test.ts` if a focused sync test does not yet exist

**Interfaces:**
- Consumes: `downloadTask`, `exportVideo`, `FileSystem.deleteAsync`, `TaskRecord`, and `{ autoExportToGallery, keepPrivateCopy }`.
- Produces: `ensureTaskMedia(task, options): Promise<TaskRecord>`.
- Produces: `exportTaskVideo(task, options): Promise<TaskRecord>` for explicit manual export.
- Produces: `migrateDownloadedVideos(tasks, options): Promise<{ exported: number; failed: number }>`.

- [ ] **Step 1: Write failing orchestration tests with injected dependencies**

Create `media.test.ts` with a `deps` object instead of mocking module globals. Cover at least these cases:

```ts
it('downloads a new result and automatically exports it', async () => {
  const downloaded = { ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED' as const };
  const deps = {
    download: jest.fn().mockResolvedValue(downloaded),
    publish: jest.fn().mockResolvedValue({ uri: 'content://media/video/7' }),
    removePrivate: jest.fn(),
  };
  const result = await ensureTaskMedia(task, {
    policy: { autoExportToGallery: true, keepPrivateCopy: true }, deps, onUpdate: jest.fn(),
  });
  expect(deps.publish).toHaveBeenCalledWith('file:///private.mp4', expect.objectContaining({ mediaId: task.id }));
  expect(result).toMatchObject({ downloadState: 'DOWNLOADED', exportState: 'EXPORTED', galleryUri: 'content://media/video/7' });
});

it('keeps a successful download when gallery publication fails', async () => {
  const deps = {
    download: jest.fn().mockResolvedValue({ ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED' }),
    publish: jest.fn().mockRejectedValue(new Error('空间不足')),
    removePrivate: jest.fn(),
  };
  const result = await ensureTaskMedia(task, {
    policy: { autoExportToGallery: true, keepPrivateCopy: true }, deps, onUpdate: jest.fn(),
  });
  expect(result).toMatchObject({ downloadState: 'DOWNLOADED', exportState: 'EXPORT_FAILED', exportError: '空间不足' });
});

it('does not silently export a historical private download', async () => {
  const deps = { download: jest.fn(), publish: jest.fn(), removePrivate: jest.fn() };
  await ensureTaskMedia({ ...task, localUri: 'file:///old.mp4', downloadState: 'DOWNLOADED', exportState: 'NOT_REQUESTED' }, {
    policy: { autoExportToGallery: true, keepPrivateCopy: true }, deps, onUpdate: jest.fn(),
  });
  expect(deps.publish).not.toHaveBeenCalled();
});
```

Also test: manual export sets `QUEUED → EXPORTING → EXPORTED`; `keepPrivateCopy=false` deletes only after publication; `QUEUED`/`EXPORTING` resumes idempotently; migration runs sequentially over only `localUri + NOT_REQUESTED/EXPORT_FAILED` records.

- [ ] **Step 2: Run the tests and confirm they fail**

```powershell
npm test -- --runInBand src/tasks/media.test.ts
```

Expected: failure because the orchestration module does not exist.

- [ ] **Step 3: Implement the orchestration state machine**

Use focused dependency types:

```ts
type MediaPolicy = { autoExportToGallery: boolean; keepPrivateCopy: boolean };
type MediaDeps = {
  download: typeof downloadTask;
  publish: typeof exportVideo;
  removePrivate(uri: string): Promise<void>;
};
type EnsureOptions = {
  policy: MediaPolicy;
  onUpdate(patch: Partial<TaskRecord>): Promise<void>;
  deps?: MediaDeps;
};
```

Rules:

1. If neither `localUri` nor a valid published reference exists and `videoUrl` exists, call `download`.
2. A download completed during the current call starts export only when `autoExportToGallery` is true.
3. A pre-existing `NOT_REQUESTED` private download is historical and is not automatically exported.
4. `QUEUED` or `EXPORTING` resumes export.
5. Manual `exportTaskVideo` always requests export.
6. Before native publication, persist `EXPORTING`; on success persist `galleryUri`, `EXPORTED`, and `exportedAt`.
7. On publication failure, preserve `localUri` and `DOWNLOADED`, then persist only `EXPORT_FAILED` and `exportError`.
8. If retention is disabled, remove the private file only after `EXPORTED`, then clear `localUri`.

When `galleryUri` exists and the private copy does not, pass `galleryUri` to the idempotent native publisher first. If it returns missing-source failure and `videoUrl` exists, redownload privately and publish again.

- [ ] **Step 4: Route synchronization through the orchestrator**

In `sync.ts`, read settings once, then call `ensureTaskMedia` for:

- newly successful tasks that have a `videoUrl` but no private/public media;
- tasks with `exportState` `QUEUED` or `EXPORTING`;
- do not retry `EXPORT_FAILED` forever—leave those for explicit retry or migration.

Pass one `onUpdate` callback that merges each patch into the current task before `taskStore.upsert`, so sequential state transitions do not overwrite one another with stale task values.

- [ ] **Step 5: Run orchestration and sync tests**

```powershell
npm test -- --runInBand src/tasks/media.test.ts src/tasks/api.test.ts src/tasks/download.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit the orchestration slice**

```powershell
git add mobile/src/tasks/media.ts mobile/src/tasks/media.test.ts mobile/src/tasks/sync.ts mobile/src/tasks/sync.test.ts
git commit -m "feat: orchestrate automatic gallery export"
```

If the focused sync test is added under a different existing test file, stage that exact file instead of a nonexistent `sync.test.ts`.

---

### Task 5: Add Storage Policy and Historical Migration Controls

**Files:**
- Modify: `mobile/app/(tabs)/settings.tsx`
- Modify: `mobile/app/(tabs)/settings.test.tsx`
- Modify: `mobile/src/ui/icons.tsx` only if the existing icon map lacks gallery/storage icons

**Interfaces:**
- Consumes: `AppSettings.autoExportToGallery`, `AppSettings.keepPrivateCopy`, `taskStore.list`, and `migrateDownloadedVideos`.
- Produces: accessible switches `自动保存到系统相册` and `保留应用内副本`.
- Produces: accessible action `将已有下载保存到相册` with progress/result feedback.

- [ ] **Step 1: Write failing settings-screen tests**

Extend the mocked settings with both media fields and mock `migrateDownloadedVideos`. Add:

```ts
it('shows enabled gallery export defaults and the fixed destination', async () => {
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<SettingsScreen />); });
  expect(tree!.root.findByProps({ accessibilityLabel: '自动保存到系统相册' }).props.value).toBe(true);
  expect(tree!.root.findByProps({ accessibilityLabel: '保留应用内副本' }).props.value).toBe(true);
  const text = tree!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
  expect(text).toContain('系统相册 / Movies / AutoDL-H3');
});

it('offers user-triggered migration instead of silently exporting history', async () => {
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<SettingsScreen />); });
  await act(async () => tree!.root.findByProps({ accessibilityLabel: '将已有下载保存到相册' }).props.onPress());
  expect(migrateDownloadedVideos).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the screen test and confirm it fails**

```powershell
npm test -- --runInBand "app/(tabs)/settings.test.tsx"
```

Expected: controls and migration action are absent.

- [ ] **Step 3: Add the storage-and-export settings card**

Use React Native `Switch` controls with explicit accessibility labels. Copy:

```text
下载完成后自动保存到系统相册
保存位置：系统相册 / Movies / AutoDL-H3
关闭后视频仍会保存在 App 内，可在作品详情中手动保存。

保留应用内副本
关闭后仅在相册保存成功时删除应用内视频。
```

The existing Save button persists both booleans with the other settings. Keep private retention visible but visually secondary; do not hide it behind the unrelated LLM advanced section.

- [ ] **Step 4: Implement historical migration feedback**

Load tasks, derive the eligible count from records with a valid `localUri` and without `EXPORTED`, then label the action:

```text
将已有下载保存到相册（N 个待处理）
```

On press, show a confirmation alert. Run the sequential migrator with the current retention setting, disable the action while it runs, then show `已保存 X 个，失败 Y 个`. Do not flip the automatic-export setting as a side effect.

- [ ] **Step 5: Run settings tests and typecheck**

```powershell
npm test -- --runInBand "app/(tabs)/settings.test.tsx" src/settings/storage.test.ts src/tasks/media.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit the settings UI slice**

```powershell
git add "mobile/app/(tabs)/settings.tsx" "mobile/app/(tabs)/settings.test.tsx" mobile/src/ui/icons.tsx
git commit -m "feat: add gallery export settings"
```

Only stage `icons.tsx` if it was actually changed.

---

### Task 6: Surface Export Status and Manual Retry in Tasks and Video Details

**Files:**
- Modify: `mobile/src/gallery/presentation.ts`
- Modify: `mobile/src/gallery/presentation.test.ts`
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Modify: `mobile/app/(tabs)/tasks.test.tsx`
- Modify: `mobile/app/video/[id].tsx`
- Modify: `mobile/app/video/videoDetail.test.tsx`

**Interfaces:**
- Consumes: `exportTaskVideo`, `ExportState`, `galleryUri`, `mediaSource`.
- Produces: `exportStatusLabel(task): string`.
- Produces: manual actions `保存到系统相册` and `重试保存到系统相册`.

- [ ] **Step 1: Write failing presentation and detail-action tests**

Add presentation cases:

```ts
expect(exportStatusLabel({ exportState: 'EXPORTING' })).toBe('正在保存到相册');
expect(exportStatusLabel({ exportState: 'EXPORTED' })).toBe('已保存到相册');
expect(exportStatusLabel({ exportState: 'EXPORT_FAILED' })).toBe('保存到相册失败');
expect(exportStatusLabel({ downloadState: 'DOWNLOADED' })).toBe('已下载到应用');
```

In `videoDetail.test.tsx`, mock `exportTaskVideo` and add:

```ts
it('manually saves a downloaded private video to the gallery', async () => {
  mockList.mockResolvedValue([{ ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED', exportState: 'NOT_REQUESTED' }]);
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoDetailScreen />); });
  await act(async () => tree!.root.findByProps({ accessibilityLabel: '保存到系统相册' }).props.onPress());
  expect(exportTaskVideo).toHaveBeenCalled();
});
```

Add a task-screen assertion that `EXPORT_FAILED` displays a retry action without displaying `下载失败`.

- [ ] **Step 2: Run focused UI tests and confirm they fail**

```powershell
npm test -- --runInBand src/gallery/presentation.test.ts "app/(tabs)/tasks.test.tsx" app/video/videoDetail.test.tsx
```

Expected: export label and actions are absent.

- [ ] **Step 3: Add export presentation labels**

Implement a pure function that does not conflate transfer and publication:

```ts
export function exportStatusLabel(
  task: Pick<TaskRecord, 'downloadState' | 'exportState' | 'galleryUri'>,
): string {
  if (task.exportState === 'EXPORTED' && task.galleryUri) return '已保存到相册';
  if (task.exportState === 'QUEUED' || task.exportState === 'EXPORTING') return '正在保存到相册';
  if (task.exportState === 'EXPORT_FAILED') return '保存到相册失败';
  if (task.downloadState === 'DOWNLOADED') return '已下载到应用';
  return '';
}
```

- [ ] **Step 4: Route manual and retry actions through the shared orchestrator**

On the task screen and video detail screen:

- `NOT_REQUESTED` + downloadable media: show `保存到系统相册`.
- `EXPORT_FAILED`: show `重试保存到系统相册` plus `exportError`.
- `QUEUED`/`EXPORTING`: disable the action and show a busy indicator.
- `EXPORTED`: show `已保存到相册`; no duplicate save button.

Both actions call `exportTaskVideo`, merge every `onUpdate` patch into current state, persist through the repository, and update component state so feedback appears without a screen reload.

- [ ] **Step 5: Clarify deletion ownership**

Update the existing removal confirmation copy to:

```text
仅移除 App 内记录和应用内副本。已保存到系统相册的视频会保留。
```

Do not add public-media deletion in this change. Users can delete the public copy through the system gallery, and the acceptance requirement is that App task deletion never removes it accidentally.

- [ ] **Step 6: Run all affected UI tests and typecheck**

```powershell
npm test -- --runInBand src/gallery/presentation.test.ts "app/(tabs)/tasks.test.tsx" app/video/videoDetail.test.tsx "app/(tabs)/gallery.test.tsx"
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit the user-facing export slice**

```powershell
git add mobile/src/gallery/presentation.ts mobile/src/gallery/presentation.test.ts "mobile/app/(tabs)/tasks.tsx" "mobile/app/(tabs)/tasks.test.tsx" "mobile/app/video/[id].tsx" mobile/app/video/videoDetail.test.tsx
git commit -m "feat: expose gallery export controls"
```

---

### Task 7: Verify the Complete Storage Lifecycle

**Files:**
- Modify only files required to fix regressions discovered by verification.
- Do not modify: `mobile/android/gradle.properties` unless the user separately authorizes replacing their existing change.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: a verified Android build and a manual acceptance record in the final handoff.

- [ ] **Step 1: Run the complete JavaScript test suite**

```powershell
Set-Location mobile
npm test -- --runInBand
```

Expected: all Jest suites pass with zero failing tests.

- [ ] **Step 2: Run TypeScript validation**

```powershell
npm run typecheck
```

Expected: exits successfully with no diagnostics.

- [ ] **Step 3: Build the Android debug APK**

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

Expected: `BUILD SUCCESSFUL`; APK generated under `mobile/android/app/build/outputs/apk/debug/`.

- [ ] **Step 4: Install and exercise the MediaStore flow on Android 10+**

Install the debug APK without uninstalling the existing App, preserving historical private files. Verify:

1. With automatic save enabled, complete one new download.
2. Confirm App status advances from `已下载到应用` to `已保存到相册`.
3. Confirm exactly one MP4 appears in system Gallery and `Movies/AutoDL-H3`.
4. Tap manual save/retry repeatedly and confirm no duplicate file appears.
5. Disable automatic save, download another result, and confirm it remains App-only until manual save.
6. Run historical migration and confirm only selected pre-upgrade files are published.
7. Remove a task in the App and confirm its public video remains in Gallery.
8. Enable private-copy deletion, export a disposable test video, restart the App, and confirm playback falls back to `galleryUri`.

- [ ] **Step 5: Inspect final changes without touching unrelated work**

```powershell
Set-Location ..\..
git status --short
git diff --check
git log --oneline -10
```

Expected: no whitespace errors; the pre-existing `mobile/android/gradle.properties` change remains separate from feature commits.

- [ ] **Step 6: Commit only verification fixes, if any**

If verification required code changes, stage only those files and commit:

```powershell
git commit -m "fix: stabilize gallery export lifecycle"
```

If no code changed, do not create an empty commit.
