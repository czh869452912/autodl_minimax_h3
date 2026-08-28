# React Native + Media3 Native App Design

## Goal

将 AutoDL H3 Android 客户端从 WebView 主导的混合架构迁移为 React Native/Expo 统一 UI 架构；保留 assistant-ui 的原生 Agent 交互，并以可替换的视频播放器接口接入 Android Media3 原生组件，解决画廊首帧、视频详情、全屏和横竖屏稳定性问题。

## Decisions

- UI 终局采用 React Native/Expo，而不是 Kotlin Compose + WebView 混合。
- Agent 使用 `@assistant-ui/react-native` 与现有 H3 runtime/skill bundle；Agent runtime 与 UI 解耦。
- 画廊和详情页使用 React Native 原生组件，不再使用 `yet-another-react-lightbox`、HTML `<video>` 或 WebView fullscreen。
- 播放器暴露 `VideoPlayer` 抽象；默认实现为 Android Media3 原生 Fabric/Native Component，开发预览可使用 Expo Video 适配器。
- 本地媒体元数据使用 SQLite；视频和 poster 使用应用专属文件目录；后台下载使用 WorkManager。
- 全屏只切换播放器容器和系统 UI，不强制横屏；竖屏视频保持竖屏，横屏视频允许用户旋转。

## Architecture

```text
React Native / Expo
├── Expo Router + shared theme
├── assistant-ui/react-native
├── screens: create / agent / tasks / gallery / settings
├── media repository (SQLite metadata + file paths)
├── VideoPlayer interface
│   ├── ExpoVideoAdapter (preview/fallback)
│   └── Media3NativeAdapter (Android production)
└── Native modules
    ├── WorkManager download + retry
    ├── MediaMetadataRetriever poster extraction
    └── Keystore secrets
```

Task status remains a single domain model. A successful task creates a `media_asset` record with source URL, local path, poster path, dimensions, duration, and download state. The gallery renders poster images immediately and only mounts a player after the user opens a detail screen. Player events are translated into platform-neutral callbacks.

## Error handling

- Missing source: show a recoverable empty state with retry/open-external actions.
- Download failure: persist state and retry through WorkManager with bounded backoff.
- Poster extraction failure: show a generated placeholder and retain video playback.
- Fullscreen rejection: remain inline and show no navigation change.
- Native player error: release player, show error state, and offer retry with the same asset.

## Migration boundary

The migration introduces a new React Native app shell and shared domain/storage packages. Existing WebView code remains only as a temporary reference during migration; it is not the production entry point after the new shell is enabled. The current Java API client and secure storage logic are wrapped by native modules rather than exposed through `window.AndroidBridge`.

## Verification

- Unit tests for media repository mapping, poster fallback, and player state transitions.
- Android instrumentation tests for gallery loading, detail navigation, fullscreen enter/exit, back handling, and download retry.
- Manual matrix: portrait video, landscape video, no-network local playback, failed download, Android back gesture, and process recreation.
