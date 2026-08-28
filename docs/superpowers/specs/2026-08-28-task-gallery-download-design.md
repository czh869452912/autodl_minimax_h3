# Task Download Synchronization and Media Gallery Design

## Goal

修复任务队列和结果画廊在 Android 后台下载、视频首帧、长 Prompt 详情和全屏播放方面的体验问题，并将结果详情升级为成熟媒体灯箱交互。

## Scope

### In scope

- 下载完成后，任务状态在 Activity 回到前台或广播丢失时也能自动收敛到“本地视频就绪”。
- 生成状态和下载状态分开计算，避免已经生成成功或已下载的任务继续出现在活动队列。
- 结果卡片尽量显示视频第 0 帧，并保留明确的加载失败占位。
- 使用 `yet-another-react-lightbox` 及其 Video/Fullscreen 能力承载结果预览。
- 桌面端并列展示视频和生成信息，手机端使用底部详情面板；长 Prompt 在独立滚动区内展示。
- 支持顶部关闭、遮罩、Esc、Android 返回键关闭详情。
- WebView 视频全屏时自动横屏并隐藏系统栏，退出后恢复竖屏和系统栏。

### Out of scope

- 不更换现有 AutoDL API、任务持久化格式或视频下载目录。
- 不把结果详情迁移为独立原生 Activity。
- 不新增图片/音频编辑能力，也不改变任务提交参数。

## Current Root Causes

1. Android 只在 `onCreate()` 调用一次 `reconcileDownloads()`。下载完成广播如果没有在 Activity 可见生命周期内送达，回到前台不会重新查询 `DownloadManager`。
2. 前端结果网格使用 `preload="metadata"`，没有主动触发首帧解码。
3. Android `WebChromeClient` 没有实现 `onShowCustomView()` 和 `onHideCustomView()`，原生视频全屏按钮没有 custom view 容器。
4. 当前详情弹窗把 Prompt 和播放器放入同一个最大高度纵向容器，长 Prompt 会压缩播放器；关闭按钮只在底部。

## Architecture

### Android task/download state

- `onCreate()` 加载任务、注册 `DownloadManager.ACTION_DOWNLOAD_COMPLETE` 广播并执行一次 reconcile。
- `onResume()` 再次执行 reconcile 并推送最新任务 JSON 到 WebView。
- `reconcileDownloads()` 对每个任务按以下优先级收敛：
  1. 目标文件存在且大小大于 0：写入本地 URI，状态为 `已下载`。
  2. 有 `downloadId`：查询 `DownloadManager`，同步 pending/running/successful/failed。
  3. 生成成功且有远程 URL 但没有下载记录：创建下载并标记 `下载中`。
- 轮询继续覆盖有未完成生成状态的任务，以及有下载 ID 但未处于 `已下载`/`下载失败` 的任务，以便广播丢失时最终一致。
- `notifyWebTasks()` 在每次状态变化后推送，React 不需要重启或重新加载页面。

### React state and media source

- `selectedVideo` 使用 `GalleryItem | VideoTask | null`，不再使用 `any`。
- 本地 `localUri` 始终优先于 `videoUrl`。
- 任务页分别计算生成活动任务、历史任务和下载状态；`SUCCESS` 不会因为下载仍在进行而回到“生成中”。
- 画廊卡片视频使用 `preload="auto"`，在 `loadeddata`/`canplay` 后尝试定位第 0 帧；加载失败时显示占位和可用的重试/外链操作。

### Media lightbox

使用 `yet-another-react-lightbox` 作为交互壳，并启用官方 Video 和 Fullscreen 插件。自定义 slide/render 区域承载项目自己的 HTML video 和详情信息：

- 视频区域使用固定的响应式尺寸和 `object-contain`，不受 Prompt 长度影响。
- 桌面端详情面板位于播放器右侧，手机端详情面板位于视频下方并限制最大高度。
- Prompt 内容区独立滚动；复制 Prompt、复制任务 ID、重用 Prompt 等操作保持可见。
- 关闭交互由灯箱处理，并补充 Android 返回键桥接/页面事件。

Official component references: [Lightbox documentation](https://yet-another-react-lightbox.com/documentation), [Video plugin](https://yet-another-react-lightbox.com/plugins/video), [Fullscreen plugin](https://yet-another-react-lightbox.com/plugins/fullscreen).

### Android WebView fullscreen

- 在 `WebChromeClient` 中保存当前 custom view 和回调。
- `onShowCustomView()` 将 custom view 放入全屏容器，隐藏状态栏/导航栏，设置横屏。
- `onHideCustomView()` 移除容器、恢复系统 UI 和竖屏，并调用隐藏回调。
- Activity 返回键优先退出全屏，其次关闭灯箱，最后保留默认行为。
- Activity 销毁时清理全屏视图和窗口状态。

## Data flow

```text
DownloadManager / API
          |
          v
Android reconcile + broadcast + polling
          |
          v
SharedPreferences task snapshot + WebView callback
          |
          v
React tasks state
     /             \
TasksScreen      GalleryScreen
                      |
                      v
              Lightbox + detail panel
```

## Error handling

- 找不到任务对应的下载记录时保留生成结果，并显示可重试下载状态，不伪造本地就绪。
- 本地文件存在但 WebView 不能播放时显示错误占位，允许回退远程 URL或重新下载。
- 视频首帧解码失败不阻塞画廊渲染；卡片显示媒体占位。
- 全屏回调异常时恢复保存的系统 UI/方向状态，并保留普通播放器可用。
- Prompt 为空时显示无 Prompt 文案；复制按钮禁用或不执行空复制。

## Test plan

### Frontend tests

- 已下载任务派生为本地就绪，且不出现在活动任务列表。
- `localUri` 优先于远程 URL。
- 长 Prompt 详情使用独立滚动容器，视频区域仍保持稳定比例/尺寸。
- 灯箱存在顶部关闭入口，并触发关闭回调。
- 视频首帧事件将卡片从加载状态切换为可见媒体。

### Android/build verification

- 验证下载状态归一化和本地文件优先判定逻辑。
- `npm test`
- `npm run lint`
- `npm run build`
- `gradlew.bat assembleDebug`

### Manual acceptance

1. 提交任务后将应用置于后台，等待 Android 通知显示下载成功，再回到应用；任务页立即显示本地视频就绪，结果页出现对应卡片。
2. 结果卡片显示视频首帧，不依赖鼠标 hover。
3. 打开长 Prompt 结果时视频保持大尺寸，详情区可独立滚动，顶部关闭和系统返回都可退出。
4. 点击播放器全屏后进入横屏沉浸式播放，退出全屏恢复竖屏。
