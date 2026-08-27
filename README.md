# AutoDL H3 视频生成 Android 客户端 (Web-Native 混合架构)

这是一个基于 **Web-Native 混合架构**（React + Vite + Tailwind CSS + Android WebView + JSBridge）的原生 Android 客户端，专门用于调用 AutoDL.Art 的 `minimax_h3_image_audio_to_video_v2_15s` ComfyUI 视频生成工作流。

---

## 🌟 核心功能与特色

### 1. 5 大核心 Tab 导航
- **生成 (Creative Studio)**：
  - 完美适配 AutoDL ComfyUI 工作流参数：Prompt 描述、视频时长（1-15秒）、分辨率选择（`768p竖`, `480p竖`, `768p横`, `480p横`）及可选随机 Seed。
  - 支持逐个添加与移除最多 **9 张参考图片**（`@image0` ~ `@image8`）与 **3 段参考音频**（`@audio0` ~ `@audio2`）。
  - 已选图片实时缩略图预览，音频支持在提交前直接播放测试。
- **Prompt 助手 (Skill Agent)**：
- 使用 `deepagents/browser` 作为 APK 内的 agent harness，通过多轮自主循环读取并组合 MiniMax H3 官方 skills。
- 使用 `assistant-ui` LocalRuntime 提供聊天、流式消息、工具轨迹、线程和图片附件 UI；agent runtime、上下文和 skill 文件全部随 APK 运行。
- 官方 skills 原样存放在 `frontend/src/agent/skills/minimax-h3/`，构建时以完整文件树打包（包含 `SKILL.md` 与 references）；需要 MiniMax Hub 的 skill 在当前未连接 Hub 时会降级为明确的 pre-production 结果。
  - Agent 生成最终 H3 Prompt 后，可点击 **应用到生成器** 自动填入主界面并跳转。
- **任务队列 (Tasks Queue)**：
  - 显示本机提交的异步任务进度与状态（`QUEUED`、`RUNNING`、`SUCCESS`、`FAILED`、`CANCELLED`）。
  - 自动后台轮询，支持手动清空已完成历史。
- **生成结果 (Gallery)**：
  - 成功生成的视频自动通过 Android 系统 `DownloadManager` 下载保存至本地公共目录 `Movies/AutoDL-H3`。
  - 画廊列表中提供首帧缩略图预览、画幅/时长标记及全屏视频弹窗播放。
- **设置 (System Settings)**：
  - 支持安全配置 AutoDL ComfyUI Token 和 Prompt 助手 LLM API Key。
  - 密钥使用 **Android Keystore 加密存储**，保障账户安全。

---

## 🛠️ 软件架构设计

```text
+-------------------------------------------------------------------+
|               Android App (Native Container / APK)               |
|                                                                   |
|  +-------------------------------------------------------------+  |
|  |           WebView (加载本地 Assets 编译出的 H5 网页)          |  |
|  |  frontend/ (React 19 + TypeScript + Tailwind CSS)            |  |
|  +------------------------------|------------------------------+  |
|                                 | window.AndroidBridge            |
|                                 v                                 |
|  +-------------------------------------------------------------+  |
|  | Native Bridge & Services (Java)                             |  |
|  |  - KeystoreTokenStore   (安全加解密 Token / LLM Key)         |  |
|  |  - AutoDLApiClient       (HTTP POST/GET 任务与轮询)          |  |
|  |  - DownloadManagerHelper (自动下载 MP4 至 Movies/AutoDL-H3)   |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

---

## 🏗️ 编译与打包指南

### Prompt Agent 配置

Prompt Agent 不需要单独的服务端、Node runtime 或局域网电脑。打开 APK 的“系统设置”，填写 OpenAI-compatible API Key、Endpoint（默认 `https://api.minimaxi.com/v1`）和模型名（默认 `MiniMax-M2.7`）。配置和对话线程保存在本机。

启动前端开发预览（仅用于 UI 开发）：

```bash
cd frontend
npm install
npm run dev      # Vite: http://127.0.0.1:3000
```

### 方式 1：使用一键打包脚本（推荐）

1. **编译前端 Web 资源**：
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. **命令行构建 APK**：
   在项目根目录下运行 bash 构建脚本：
   ```bash
   ./build-apk.sh
   ```
   生成的调试包位于：`app/build/AutoDL-H3-debug.apk`。

### 方式 2：使用 Android Studio 导入
直接使用 **Android Studio** 打开 `autodl_minimax_h3` 根目录，即可进行真机/模拟器可视化调试与 Gradle 编译打包。Gradle 的 `preBuild` 会自动执行前端构建并同步 `frontend/dist` 到 Android WebView 资源目录，无需手工复制。

---

## 🔒 安全与隐私

- **令牌保护**：AutoDL Token 和 LLM API Key 使用 Android 硬件支持的 Keystore 机制加密后保存在本地 `SharedPreferences` 中，绝对不会写入源码、Git 提交或 APK 资源。
- **素材限制**：图片与音频采用 Base64 方式随请求传输，建议单次选择素材文件总量控制在 50 MB 以内。
