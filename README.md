# AutoDL H3 Android 客户端

当前版本唯一受支持的工程是 `mobile/`：React Native + Expo Router + CopilotKit React Native + DeepAgents JS + AndroidX Media3。应用不依赖本地服务端、Node runtime 或 WebView；任务索引、Agent 会话和媒体缓存均保存在应用私有目录，密钥由 Expo SecureStore（Android Keystore）保护。

## 功能

- 原生创建：Prompt、时长、Seed，以及工作流实际接受的 `768p竖`、`480p竖`、`768p横`、`480p横` 分辨率，多达 9 张参考图和 3 段参考音频。
- 任务队列：前台刷新 + Android 系统后台任务同步，完成后自动下载 MP4 和提取首帧。
- 画廊：SQLite 索引、搜索、持久化首帧卡片和独立视频详情页。
- 播放：详情页内联预览，Media3 播放器提供稳定全屏沉浸模式，不强制旋转、不回退到画廊。
- Prompt 助手：CopilotKit 官方 RN `CopilotChat` 管理消息、Markdown、工具调用渲染、流式状态和附件 UI；DeepAgents、AG-UI harness、官方 H3 多文件 skill bundle 与线程恢复全部在 APK 本地运行。

## 开发与构建

```bash
cd mobile
npm ci --legacy-peer-deps
npm run typecheck
npm test -- --runInBand
cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

调试 APK 输出于 `mobile/android/app/build/outputs/apk/debug/app-debug.apk`。打开应用后，在“设置”中填写 AutoDL Token 与 OpenAI-compatible LLM Key/Endpoint/Model；LLM API 是 Agent 的唯一外部依赖。

## 数据与权限

所有数据以新安装 schema 初始化，无旧版迁移或兼容层。视频和首帧存储在应用私有文件目录；参考素材仅在提交时编码进请求。网络访问和媒体播放所需权限由 `mobile/app.json` 与原生 Manifest 声明。
