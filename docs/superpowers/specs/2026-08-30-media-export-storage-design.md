# 视频作品存储与系统相册导出设计

## 目标

让生成完成的视频符合用户对“下载”的直觉：视频既能在 App 内离线播放，也能在系统相册、文件管理器和其他剪辑 App 中找到。下载可靠性与公共媒体发布解耦，发布失败可以单独重试，不影响已完成的下载。

本设计只考虑 Android 10（API 29）及以上，不兼容旧版外部存储 API。

## 当前问题

当前 `downloadTask` 使用 Expo `documentDirectory/media/<taskId>.mp4`。该目录是应用私有沙箱，普通相册和文件管理器不可见。设置页显示的 `Movies/AutoDL-H3` 尚未被实际写入。

## 设计决策

采用“双层存储”模型：

1. 下载器先把视频可靠地写入应用私有目录，作为 App 的播放、首帧提取、断网访问和重新发布源。
2. 私有文件提交成功后，根据导出策略将副本发布到 Android `MediaStore.Video`，位置为 `Movies/AutoDL-H3`。
3. `localUri` 永远表示私有源；系统相册的 `content://` URI 单独存储为 `galleryUri`，不能覆盖 `localUri`。

默认设置为下载完成后自动发布到系统相册，并保留应用内副本。这样首次发布失败、用户从相册删除文件或 App 内播放器对 `content://` 支持差异，都不会破坏本地作品库。

## 媒体导出接口

底层原生模块向 TypeScript 暴露一个深接口，隐藏 `MediaStore` 的生命周期和幂等细节：

```ts
type ExportVideoOptions = {
  displayName?: string;
};

type ExportVideoResult = {
  uri: string;              // content://...
  displayName: string;
  relativePath: 'Movies/AutoDL-H3/';
  alreadyExisted: boolean;
};

exportVideo(
  sourceUri: string,
  options?: ExportVideoOptions,
): Promise<ExportVideoResult>;
```

导出模块内部必须：

- 使用 `MediaStore.Video.Media.EXTERNAL_CONTENT_URI`。
- 设置 `DISPLAY_NAME`、`MIME_TYPE=video/mp4` 和 `RELATIVE_PATH=Movies/AutoDL-H3/`。
- 插入时设置 `IS_PENDING=1`，完整复制后更新为 `0`。
- 以任务 ID 生成稳定且安全的文件名；重复调用返回已有条目，不产生副本。
- 复制失败时删除 pending 条目，并返回可显示的错误。
- 优先验证已保存的 `galleryUri`；记录丢失时按相对目录和文件名再次查找。
- 不向 UI 暴露存储权限、原始路径或 MediaStore 实现。

## 任务数据模型

保留现有下载字段，并新增导出字段：

```ts
type ExportState =
  | 'NOT_REQUESTED'
  | 'QUEUED'
  | 'EXPORTING'
  | 'EXPORTED'
  | 'EXPORT_FAILED';

localUri?: string;
galleryUri?: string;
exportState?: ExportState;
exportError?: string;
exportedAt?: number;
```

SQLite 迁移新增 `gallery_uri`、`export_state`、`export_error` 和 `exported_at`。已有记录默认 `NOT_REQUESTED`，不会在升级后静默批量写入系统相册。

媒体播放源按 `localUri → galleryUri → videoUrl` 的顺序选择。默认策略下 `localUri` 始终存在；只有用户关闭“保留应用内副本”且公共发布已经成功时，才允许清空它。

下载与导出状态示例：

| 下载状态 | 导出状态 | UI 含义 |
| --- | --- | --- |
| `DOWNLOADING` | `NOT_REQUESTED` | 正在下载 |
| `DOWNLOADED` | `QUEUED` / `EXPORTING` | 已下载，正在保存到相册 |
| `DOWNLOADED` | `EXPORTED` | 已下载并已保存到相册 |
| `DOWNLOADED` | `EXPORT_FAILED` | 视频可在 App 内播放，保存到相册失败 |

导出失败不能把 `downloadState` 改成 `DOWNLOAD_FAILED`。

## 编排与恢复

保留 `downloadTask` 的单一职责，不让它直接依赖 MediaStore。新增任务级编排函数，供前台手动下载、任务页重试和后台同步共同调用：

```ts
ensureTaskMedia(task, {
  autoExport: settings.autoExportToGallery,
  onUpdate,
});
```

流程为：

```text
下载远程视频
  → 私有临时文件
  → 私有正式文件
  → 提取首帧
  → 若自动导出开启则发布到 MediaStore
  → 分别持久化 downloadState/exportState
```

App 启动或回到前台时，恢复 `QUEUED`、`EXPORTING` 状态：检查 `galleryUri` 是否仍可访问；若不存在则重新发布。MediaStore 中遗留的 `IS_PENDING=1` 条目由导出模块清理或重新完成，避免相册出现半成品。恢复过程串行处理导出，防止多个视频复制同时占用过多磁盘带宽。

## 设置页交互

新增“存储与导出”卡片：

### 下载完成后自动保存到系统相册

默认开启。固定显示：

```text
保存位置：系统相册 / Movies / AutoDL-H3
```

关闭时说明：

```text
视频仍会保存在 App 内，可在作品详情中手动保存到相册。
```

设置键为 `media.autoExportToGallery`，默认值 `true`。关闭只影响之后的下载，不会删除已经导出的作品，也不会自动处理升级前的历史视频。

### 保留应用内副本

默认开启，建议放入高级设置。关闭时，只有在 MediaStore 发布成功后才删除私有视频文件；首帧文件可按同一策略清理。若公共副本后来被用户删除，App 应显示“本地副本已删除”，允许重新下载或重新生成，而不是伪造已下载状态。

设置键为 `media.keepPrivateCopy`，默认值 `true`。

### 迁移已有视频到系统相册

显示待迁移数量，例如：

```text
将已有下载保存到相册（12 个待处理）
```

点击后展示进度、成功数和失败数；失败项可单独重试。迁移不会改变已有 `localUri`。

## 作品页交互

任务卡、画廊卡和视频详情页分别显示：

- `已下载到应用`
- `正在保存到相册`
- `已保存到相册`
- `保存到相册失败 · 重试`

详情页提供“保存到系统相册”按钮。成功后显示“已保存到相册”，并提供“查看视频”或“分享”；“查看视频”通过 `ACTION_VIEW` 打开该 `content://` 媒体项，不承诺定位到特定相册文件夹。按钮操作应幂等，多次点击不会生成多个同名视频。

删除任务时默认删除 App 记录、私有视频和首帧，但保留系统相册副本。只有用户明确勾选“同时删除系统相册中的视频”时，才调用 MediaStore 删除；删除公共副本前必须二次确认。

## 错误处理

- 磁盘空间不足：保留私有下载，导出状态为 `EXPORT_FAILED`，提示释放空间后重试。
- App 被系统杀死：下次启动按导出状态恢复，不重复创建 MediaStore 条目。
- 相册已删除公共副本：显示未发布状态，保留私有源并允许重新发布。
- 私有源不存在但远程 URL 仍有效：先重新下载再发布。
- 私有源和远程 URL 都不存在：显示“源文件不可用”，不删除任务记录。
- 发布成功但数据库更新中断：下次按稳定文件名查找并补写 `galleryUri`。

## 测试与验收

### 单元测试

- 默认设置为自动导出开启、保留私有副本开启。
- 下载成功而导出失败时，两个状态独立保存。
- 同一任务重复导出只返回一个 MediaStore 条目。
- 关闭自动导出时不创建公共媒体条目。
- `galleryUri` 丢失时可按任务 ID 恢复查找。
- 历史迁移只处理私有目录中的有效 MP4，并支持失败重试。

### Android 集成验收

1. 下载完成后，在系统相册和文件管理器的 `Movies/AutoDL-H3` 中看到 MP4。
2. 复制期间相册不会看到未完成文件。
3. 重复点击保存不会出现重名副本。
4. App 重启后导出队列可以继续。
5. 关闭“保留应用内副本”时，只有公共发布成功后才删除私有文件。
6. 删除 App 内任务不会误删系统相册视频。

## 不在本次范围

- Android 9 及以下兼容。
- 让系统相册反向同步回 App。
- 让用户任意选择外部目录（这应另行使用 Storage Access Framework）。
- 云端备份、跨设备同步和视频转码。
