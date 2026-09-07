# React Native 完整迁移设计

## 目标

将 AutoDL H3 迁移为单一 React Native Android 应用。旧版 `v1.0.0` 仅作为视觉、交互和功能验收基线，不作为运行时前端或数据源。最终删除旧 WebView、DOM 页面和旧 bridge，避免维护两套事实。

当前迁移后的新数据架构优先：任务、媒体、下载、线程和设置的 schema、状态机、SQLite repository 及原生模块契约不回退到旧版；旧版只提供缺失行为的参考。

## 架构

```text
React Native screens
  ├─ AppShell / Header / BottomTabs / Icons
  ├─ Create (task form + attachments)
  ├─ Prompt Assistant (assistant-ui RN primitives + local Agent runtime)
  ├─ Tasks (SQLite task repository + sync state)
  ├─ Gallery (poster-first local media presentation)
  └─ Settings
        │
        ├─ TypeScript domain layer
        │   ├─ task API and normalization
        │   ├─ media presentation
        │   ├─ agent adapters and official skill bundle
        │   └─ settings / thread persistence
        │
        └─ Android native layer
            ├─ Media3 playback Activity
            ├─ poster extraction
            ├─ DownloadManager / WorkManager sync
            ├─ content provider for local media
            └─ document picker / media permissions
```

### 单一事实源

- UI 状态由 React Native 页面和共享 hooks 管理。
- 任务和媒体持久化只使用当前 SQLite repository；不再维护旧 JSON task mirror。
- Agent 线程只使用 assistant-ui RN runtime 及其持久化 adapter。
- 官方 H3 skills 继续以生成 bundle 进入 RN runtime，保留 skill 内容和多轮工具事件。
- 原生模块只承担平台能力，不拥有另一套业务模型；所有变更通过类型化方法和事件返回 RN。

## 页面与行为

### App Shell

恢复旧版 AutoDL H3 品牌栏、暗色设计 token、底部五 tab、正确的本地图标资源和安全区布局。图标使用稳定的 RN 图标包或项目内矢量资源，不依赖 Web 字体。

### Create

保留旧版完整表单行为，但字段写入新 `TaskMediaInput`/task schema：

- Prompt、时长、seed
- API 支持的分辨率枚举（由 API/配置常量统一定义）
- 最多 9 张参考图和 3 段参考音频
- 参考图缩略图预览、移除、数量/大小校验
- 音频名称、时长和播放/移除
- 提交后写入 SQLite，并导航到任务队列

### Prompt Assistant

使用 `@assistant-ui/react-native` 的 runtime 与 primitives，不恢复简易手搓聊天页：

- 多线程列表、新建、切换、归档/删除
- Composer、附件、消息、Markdown、reasoning、tool-call 和错误状态
- 流式 Agent 输出和取消
- 当前 `streamH3Agent`、模型 adapter、官方 H3 skill bundle 作为业务实现
- RN presentation component 只负责样式与布局，不复制 assistant-ui 状态机

### Tasks

基于新 task schema 显示 QUEUED/RUNNING/SUCCESS/FAILED 及下载状态、进度、错误信息。成功任务在得到视频 URL 后自动进入可靠下载状态机；页面提供重试、取消、删除和清理入口。

### Gallery

只展示成功且有可用媒体源的任务，优先本地视频。下载完成后由原生层提取首帧并写回 `thumbnailUrl`，Gallery 使用 poster-first 卡片，支持搜索、筛选、多选、删除和 Prompt 复用。打开媒体进入 Media3 原生播放 Activity，返回后回到原 Gallery，不改变任务导航栈。

### Settings

恢复旧版配置面板，同时写入新 settings storage：AutoDL Token、LLM API Key、Endpoint、Model、同步/下载策略和诊断信息。敏感信息使用 SecureStore，非敏感偏好使用 SQLite/AsyncStorage 适配器。

## 下载与媒体状态机

```text
SUCCESS + videoUrl
  -> ENQUEUED
  -> DOWNLOADING
  -> DOWNLOADED + localUri
  -> POSTER_READY + thumbnailUri

失败 -> DOWNLOAD_FAILED(error, retryable)
```

状态迁移必须幂等，部分文件使用临时后缀，成功后原子移动。后台同步和前台刷新共享同一 repository 与下载协调器，不允许通过页面临时状态推断 Gallery 内容。

## 屏幕方向与全屏

Media3 Activity 自己管理全屏窗口和系统 UI；全屏切换不修改 RN Activity 的路由或 tab 状态。退出全屏只恢复播放器窗口，关闭播放器才返回 Gallery。异常时显示可恢复错误，不结束宿主应用。

## 兼容与清理策略

以新安装、无历史数据为唯一基准，不做旧 JSON/旧 WebView 数据兼容。完成迁移后删除旧 `frontend/`、旧根 `app/`、旧 WebView bridge 以及只为旧页面存在的依赖和脚本。

## 验收标准

1. 全新安装后冷启动进入生成页，无白屏、崩溃或 unmatched route。
2. 五个 tab、品牌栏和图标在 emulator 上显示正确。
3. Create 可提交完整字段，参考图可预览/删除，分辨率与 API 枚举一致。
4. Prompt Assistant 使用 assistant-ui RN 完整交互，能流式展示 reasoning、tool-call、Markdown 和附件。
5. SUCCESS 任务自动下载；失败可重试；下载完成自动生成首帧。
6. Gallery 在有本地媒体时显示首帧，点击播放、全屏和返回链路稳定。
7. Settings 可保存并重新加载全部配置。
8. TypeScript、单元测试、Gradle 构建和 emulator 冷启动验证全部通过。

