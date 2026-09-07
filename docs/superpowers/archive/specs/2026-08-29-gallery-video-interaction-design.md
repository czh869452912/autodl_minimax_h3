# Gallery Video Interaction Design

## Goal

将画廊从“卡片 → 作品详情弹窗 → 视频详情页 → 原生全屏播放器”的多层交互，收敛为“卡片 → 单一视频详情页”。详情页支持直接非全屏播放、可选全屏、明确返回，并保证超长 Prompt 不会遮挡播放器或操作按钮。

## Confirmed interaction

- 普通点击画廊卡片直接进入 `/video/[id]`，不再打开中间的作品详情弹窗。
- 长按卡片继续进入批量选择模式；处于选择模式时，普通点击只切换选择状态。
- 视频详情页是唯一的作品详情界面：顶部提供明确返回按钮，页面内只出现一份 Prompt 和一个复制按钮。
- 播放器固定在详情页上部并支持原位播放。用户可使用播放器控件进入全屏，不需要先跳进另一个播放器页面才能开始播放。
- Prompt 位于播放器和主要操作区域之后，使用独立、受约束的滚动区域；无论 Prompt 多长，播放器、返回和复制按钮都保持可访问。
- Android 系统返回手势和界面内返回按钮均能退出全屏或返回画廊。

## Status semantics

生成状态和下载状态保持两个不同维度，画廊只展示已经生成出媒体源的作品。

| 条件 | 是否进入画廊 | 画廊状态 | 是否可播放 |
| --- | --- | --- | --- |
| `QUEUED` / `RUNNING` | 否 | 不适用 | 否，尚未生成视频 |
| `FAILED` / `CANCELLED` | 否 | 不适用 | 通常没有视频；即使返回异常残留 URL，也不作为完成作品展示 |
| `SUCCESS` 且无 `videoUrl`/`localUri` | 否 | 不适用 | 否，缺少媒体源 |
| `SUCCESS` + 远程 URL，下载 `IDLE`/`ENQUEUED`/`DOWNLOADING` | 是 | 准备中 | 是，使用远程 URL |
| `SUCCESS` + `DOWNLOAD_FAILED` + 远程 URL | 是 | 下载失败 | 是，继续使用远程 URL，并可从任务页重试下载 |
| `SUCCESS` + 有效 `localUri` | 是 | 已下载 | 是，优先使用本地文件 |

因此，“准备中”和“失败”画廊筛选指的是本地下载生命周期，不是视频生成生命周期。准备中的项目已有远程视频；下载失败的项目只要远程 URL 仍有效也有视频。真正生成失败的任务不进入画廊。

## Component boundaries

### Gallery presentation

`src/gallery/presentation.ts` 负责把 `TaskRecord` 投影为可展示的 `MediaAsset`：

- 只接受 `SUCCESS` 且存在媒体源的任务。
- 本地 URI 始终优先于远程 URL。
- 将下载状态归一化为画廊的“准备中 / 已下载 / 下载失败”。
- 提供集中式中文状态文案，避免组件直接展示内部枚举值。

### Gallery screen and card

`app/(tabs)/gallery.tsx` 只承担加载、搜索、筛选、批量选择和导航。删除详情 Modal 及其 Prompt/复制逻辑。`GalleryCard` 继续展示海报、标题和状态，但使用面向用户的中文标签。

### Video detail screen

`app/video/[id].tsx` 负责：

- 读取任务并处理加载中、任务不存在和媒体源缺失状态。
- 提供安全区内的顶部返回按钮。
- 渲染固定比例内嵌播放器和面向用户的元信息。
- 将复制 Prompt 按钮放在 Prompt 滚动区之外。
- 约束 Prompt 区高度并允许独立滚动；页面本身不因长 Prompt 产生不可达操作。

### Video player

`src/media/VideoPlayer.tsx` 使用 `expo-video` 提供 Media3-backed Android 内嵌播放：

- 单个页面只持有一个播放器实例，媒体源变化时由 hook 管理替换和释放。
- 显示原生播放、暂停、进度和全屏控件。
- 使用 `contentFit="contain"` 保留视频比例，并保留最后一帧而不是周期性显示人为黑色占位。
- 空源显示明确不可播放状态。
- 播放错误显示可恢复错误态和重试入口，不静默跳转。

现有独立 `Media3PlayerActivity` 不再作为详情页的必经播放层。若仍被其他入口保留，它必须提供界面内返回/关闭能力；画廊详情播放不依赖该 Activity。

## Playback and fullscreen flow

```text
Gallery card
    |
    v
Video detail route
    |
    +--> inline play / pause / seek
    |
    +--> fullscreen control
              |
              +--> back or close returns to inline player
```

内嵌和全屏共享同一个播放器实例与播放进度，退出全屏不会重新创建媒体、重置进度或插入额外详情层。

## Black-screen investigation and handling

当前详情页显示的是静态海报，点击后会启动新的原生 Activity 和新的 ExoPlayer。页面切换、Activity 生命周期暂停/恢复以及播放器重建都会扩大模拟器上黑屏或表面重建问题的可能性。实现时先用内嵌单实例播放器消除这条重复创建链路，再区分：

- 仅 Android Emulator 出现：记录模拟器图形模式、API 版本和同一视频在真机上的对照结果。
- 真机和模拟器均出现：采集播放器错误/缓冲状态，检查远程流、文件完整性、解码器和 surface 生命周期。
- 网络缓冲：保持当前画面并显示 buffering 指示，不用周期性黑色遮罩替代画面。
- 解码或媒体错误：停止自动重试循环，显示错误和一次显式重试操作。

不在缺少证据时把周期性黑屏归因于模拟器；实现后的手工验证必须包含同一媒体的模拟器与真机对照，若当前没有真机，则明确记录未验证项。

## Error handling

- 找不到任务：显示“作品不存在或已删除”及返回画廊入口。
- 任务存在但没有媒体源：不挂载播放器，显示“视频源不可用”。
- 复制失败：显示失败提示，不提前显示“已复制”。
- 海报提取失败：卡片和播放器使用中性占位，不阻止远程/本地视频播放。
- 远程播放失败但存在本地 URI：始终由 `mediaSource` 优先选择本地 URI。
- 全屏退出：界面关闭按钮和 Android 返回均返回内嵌详情，不直接丢失画廊导航栈。

## Test strategy

### Unit and component tests

- `QUEUED`、`RUNNING`、生成 `FAILED`、无媒体源 `SUCCESS` 不进入画廊。
- 下载准备中、下载失败、已下载任务分别得到正确状态；本地 URI 优先。
- 状态标签显示中文，而不是内部枚举值。
- 画廊卡片普通点击直接导航到详情，不再创建作品详情 Modal。
- 长 Prompt 使用受约束的独立滚动区域，复制按钮位于滚动区之外。
- 空源、任务不存在、复制成功/失败具有明确状态。
- 播放器接收正确 source，使用内嵌原生控件，并支持全屏。

### Build and manual verification

- 运行目标测试、完整 Jest、TypeScript typecheck 和 Android debug 构建。
- 在 Android Emulator 上验证短 Prompt 与截图量级的超长 Prompt。
- 验证远程准备中、远程下载失败和本地已下载三种媒体源。
- 验证内嵌播放、暂停、拖动、进入/退出全屏、界面返回和系统返回手势。
- 连续播放同一视频至少两个完整周期，记录是否出现周期性黑屏和播放器错误。
- 有真机时用同一视频做对照；无真机时不声称已排除 Emulator 问题。

## Scope limits

- 不改变 AutoDL API、任务生成状态定义、数据库 schema 或下载重试入口。
- 不把生成失败任务伪装成画廊作品。
- 不新增 Prompt 编辑、视频编辑、分享或删除远程任务能力。
- 不为这次交互修复引入第二套播放器状态管理。
