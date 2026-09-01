<h1><img src="mobile/assets/icon.png" alt="AutoDL H3 图标" width="42" align="center" /> AutoDL MiniMax H3 移动创作助手</h1>

一个面向 Android 手机的 MiniMax H3 视频创作客户端：让用户可以在移动端访问 AutoDL 的 [MiniMax H3 Image/Audio to Video V2 15s 工作流](https://autodl.art/large-model/comfyui/minimax_h3_image_audio_to_video_v2_15s)，并通过内置的官方 H3 Prompt Skill，以智能体对话的方式完成提示词构思、整理和交付。

这个项目希望把原本需要在桌面浏览器中完成的工作流操作，变成一套适合手机使用的创作流程：从构思 Prompt、准备参考图和音频，到创建生成任务、跟踪进度、预览视频和管理成片，都可以在同一个应用里完成。

## 项目目标

- 让用户通过 Android 手机直接创建和管理 AutoDL MiniMax H3 视频任务。
- 用智能体辅助 MiniMax H3 Prompt 撰写，降低复杂镜头、动作、声音和氛围描述的门槛。
- 将 Prompt、参考素材、生成任务和最终视频逐步组织为可持续管理的创作项目。
- 保持移动端本地优先：会话、任务索引和媒体缓存保存在应用私有目录，敏感配置使用 Android Keystore 保护。

## 当前已实现

- **视频任务创建**：填写 Prompt、分辨率、时长和 Seed，最多添加 9 张参考图与 3 段参考音频。
- **Prompt 智能体**：使用内置的官方 MiniMax H3 Prompt Skill，通过多轮对话梳理主体、动作、镜头、声音和氛围，并把完成的 Prompt 发送到任务创建页面。
- **多模态上下文**：可在 Prompt 助手中添加图片、引用素材，并保留本地会话记录。
- **任务队列**：查看任务状态、刷新进度、重试下载，并通过 Android 后台任务同步生成结果。
- **本地画廊**：搜索和管理已下载作品，查看首帧、视频详情并批量删除。
- **原生视频播放**：在详情页预览视频，通过 AndroidX Media3 进入稳定的全屏播放模式。
- **作品导出**：将视频保存到系统相册，也可按设置自动导出并保留应用内副本。
- **本地安全存储**：AutoDL Token 和 LLM API Key 由 Expo SecureStore（Android Keystore）保存。

## 典型使用流程

1. 在设置页配置 AutoDL Access Token 和 LLM API。
2. 打开 Prompt 助手，描述想制作的画面、动作、镜头和声音。
3. 根据智能体建议补充信息，得到适用于 MiniMax H3 的完整 Prompt。
4. 将 Prompt 发送到创建页，选择分辨率、时长、Seed，并添加参考图或参考音频。
5. 创建 AutoDL 工作流任务，在任务页跟踪生成状态。
6. 生成完成后，在画廊中预览、播放或导出视频。

## 安装与开始使用

### 方式一：从 Release 下载

前往项目的 [GitHub Releases](https://github.com/czh869452912/autodl_minimax_h3/releases) 页面，下载最新 Android APK，并在手机上安装。

Android 可能会提示是否允许安装来自浏览器或文件管理器的应用，请根据系统提示为本次安装授权。建议只从本项目的 GitHub Releases 下载 APK。

### 方式二：自行构建

需要准备 Node.js、npm、JDK 和 Android SDK。克隆项目后执行：

```bash
cd mobile
npm ci --legacy-peer-deps
npm run typecheck
npm test -- --runInBand
cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

Windows PowerShell 中使用：

```powershell
cd mobile
npm ci --legacy-peer-deps
npm run typecheck
npm test -- --runInBand
cd android
./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

调试 APK 将生成在：

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Release 包必须通过环境变量提供独立的上传签名密钥；签名文件和密码不会写入仓库：

```text
AUTODL_UPLOAD_STORE_FILE
AUTODL_UPLOAD_STORE_PASSWORD
AUTODL_UPLOAD_KEY_ALIAS
AUTODL_UPLOAD_KEY_PASSWORD
```

缺少这些变量时，Release 构建会主动失败。Debug 构建仍使用 Android Debug 签名。生产网络配置仅允许 HTTPS；本地 HTTP endpoint 只应在 debug 工具场景中显式启用。

### 首次配置

安装后打开应用，进入“设置”，完成以下两项配置。

#### 1. AutoDL Access Token

1. 登录 [AutoDL Access Token 管理页](https://autodl.art/large-model/tokens)。
2. 创建或复制自己的 Access Token。
3. 将 Token 填入应用设置中的 AutoDL Token 字段并保存。

该 Token 用于创建和查询 AutoDL 工作流任务。不要将 Token 写入源码、截图公开或提交到 Git 仓库。

#### 2. LLM API

Prompt 智能体需要一个兼容 OpenAI API 格式、并支持所需多模态能力的 LLM 服务。需要在设置中填写：

- **Endpoint**：服务商提供的 OpenAI-compatible API 地址。
- **Model**：模型名称。
- **API Key**：服务商签发的密钥。
- **Timeout / Retries**：可按网络情况调整超时和重试次数。

推荐使用 DeepSeek 的 `deepseek-v4-flash-vision-exp`。可以前往 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key，并按照平台当前文档填写 Endpoint 和模型名称。实验模型的名称与可用性可能调整，请以 DeepSeek 控制台显示为准。

也可以使用其他兼容 OpenAI API 的 LLM 服务，但模型需要能够满足 Prompt 助手使用的文本或视觉输入需求。

### 创建第一个任务

配置保存后，可以先在 Prompt 助手中完成提示词，也可以直接打开创建页：

1. 输入 MiniMax H3 Prompt。
2. 选择工作流支持的分辨率和时长。
3. 按需添加参考图、参考音频或 Seed。
4. 提交任务，并到任务页查看进度。
5. 任务完成后下载视频，在画廊中播放或保存到系统相册。

## Prompt 智能体如何工作

Prompt 助手不是一个简单的文本输入框。它在 APK 内运行 DeepAgents 与 AG-UI 会话逻辑，并使用 CopilotKit React Native 渲染对话、Markdown、流式响应、附件和工具调用状态。

内置的 MiniMax H3 Prompt Skill 会根据输入类型组织适合 T2VA、I2VA、FL2VA、L2VA 和 Ref2VA 等场景的提示词结构。智能体负责帮助用户完成创作前期的 Prompt 方案；实际的视频生成由 AutoDL 上的 ComfyUI 工作流执行。

当前版本不会假装调用未接入的 MiniMax Hub 画布工具。如果某个 Skill 流程依赖应用尚未提供的外部工具，智能体应交付可执行的 Prompt 与创作准备材料，并明确说明边界。

## 工作流与产品边界

- 当前版本面向 [MiniMax H3 Image/Audio to Video V2 15s](https://autodl.art/large-model/comfyui/minimax_h3_image_audio_to_video_v2_15s) 工作流。
- 应用是 AutoDL 工作流的移动客户端，不在手机本地运行 MiniMax H3 模型或 ComfyUI。
- 生成速度、队列时间和任务结果由 AutoDL 工作流及其运行环境决定。
- Prompt 智能体依赖用户配置的外部 LLM API；视频任务依赖用户自己的 AutoDL Access Token。
- 当前数据以本地存储为主，尚未提供跨设备云同步和多人协作。

## 给维护智能体与贡献者的项目上下文

在分析、修改或扩展项目时，请以以下事实为准，并明确区分“已经实现”和“Roadmap 规划”：

| 项目事实 | 当前实现 |
| --- | --- |
| 主要平台 | Android |
| 客户端技术 | React Native、Expo Router |
| Prompt UI | CopilotKit React Native |
| Agent Runtime | DeepAgents JS、AG-UI，本地会话恢复 |
| Prompt 能力 | APK 内置官方 MiniMax H3 Prompt Skill bundle |
| 视频生成 | AutoDL 托管的 ComfyUI 工作流 |
| LLM 接口 | 用户配置的 OpenAI-compatible Endpoint、Model 和 API Key |
| 本地数据 | SQLite 索引、应用私有文件目录、SecureStore |
| 原生播放 | AndroidX Media3 |
| 服务端依赖 | 项目不要求自建业务服务端；外部依赖为 AutoDL 与用户选择的 LLM API |

维护原则：

- 不要在代码、测试、文档或日志中写入真实 Token/API Key。
- 修改工作流参数前，先核对 AutoDL 工作流实际接受的字段、素材数量和枚举值。
- Agent 生成的内容必须保留用户确认环节，不能把“准备好 Prompt”描述成“视频已经生成”。
- 新能力应优先保持本地可恢复、错误可解释、任务状态可追踪。
- README 中所有“已实现”能力都应能在当前应用中找到对应入口；未来设计统一放入 Roadmap。

## Roadmap

### ✅ 当前阶段：单工作流移动创作闭环（已完成）

- Android 原生安装和移动端适配。
- AutoDL Token 与 OpenAI-compatible LLM 配置。
- MiniMax H3 Prompt 智能体和本地会话。
- 参考图、参考音频和 Prompt 的任务提交。
- 任务跟踪、后台同步、失败重试和结果下载。
- 本地画廊、视频详情、全屏播放和系统相册导出。

### 规划中

- **多工作流适配（M1/M2 已完成）**：已建立受限声明式 workflow Schema、builtin/local/remote Registry、签名与版本校验，并将 MiniMax H3 创建页和 AutoDL 任务运行迁移到 schema-driven renderer + adapter/runtime；后续仍需补充完整 Draft/附件绑定、第二平台和 Agent 直提交。
- **智能体直接创建任务**：让智能体根据对话选择工作流、补齐参数、展示提交预览，并在用户确认后直接创建任务。
- **创作项目管理**：以项目为单位管理创作 Brief、分镜、Prompt、素材、生成任务和最终交付物。
- **创作资产管理**：统一管理角色、场景、参考图、音频、视频和风格资产，支持标签、搜索、版本和跨项目复用。
- **Prompt 版本管理**：保存每次修改，支持版本对比、回滚、收藏和模板化。
- **批量生成与方案对比**：对 Prompt、Seed、分辨率或工作流参数创建多组变体，并集中比较结果。
- **任务通知与队列控制**：提供更可靠的完成通知、失败原因、暂停/重试策略和批量任务操作。
- **成本与配额提示**：在提交前展示预估消耗、账户额度和关键参数校验，减少无效任务。
- **创作模板与复用**：沉淀常用镜头、角色设定、声音设计和工作流配置，一键创建新的创作方案。
- **跨设备同步与备份**：在用户可控的前提下同步项目、Prompt、任务记录和资产元数据。
- **分享与协作**：导出项目包、分享 Prompt/配置，并支持团队审阅和反馈。
- **工作流健康诊断**：检查 Token、LLM、AutoDL 网络和工作流参数，给出可操作的错误说明。

Roadmap 表示产品方向，不代表已经交付；具体优先级会根据实际创作流程和 AutoDL 工作流演进调整。

## 数据、安全与权限

- Agent 会话、任务索引和画廊元数据保存在本地。
- 视频和首帧默认存储在应用私有文件目录，用户可选择导出到系统相册。
- 参考素材仅在创建任务需要时随请求提交。
- AutoDL Token 和 LLM API Key 使用 Expo SecureStore 保存，并由 Android Keystore 提供系统级保护。
- 应用需要网络权限以访问 AutoDL 和 LLM API；媒体权限仅用于选择素材和导出作品。
- 应用不依赖业务后端、云端任务管理或对象存储。工作流订阅（如启用）只接受固定仓库中的签名、声明式 workflow package，并在本地验证 commit 签名和内容 hash 后安装。
- AutoDL H3 的工作流 metadata 以 `ref_image_0..8` 和 `ref_audio_0..2` 为准；客户端在提交前才准备 data URI，具体 MIME、数量和请求体限制以 provider contract 为准，不把单文件大小写成 API 永久承诺。

卸载应用可能会清除尚未导出或备份的应用私有数据。重要作品请及时保存到系统相册或其他存储位置。

## 开发与验证

提交改动前建议至少执行：

```bash
cd mobile
npm run typecheck
npm test -- --runInBand
```

可选地运行只读 AutoDL metadata contract test（不会提交生成任务）：

```powershell
$env:AUTODL_CONTRACT_LIVE='1'
npm test -- --runInBand src/workflows/providers/autodl/metadata.test.ts
Remove-Item Env:AUTODL_CONTRACT_LIVE
```

涉及 Android 原生能力、键盘/安全区、媒体播放、后台任务或权限的改动，还应构建 APK 并在 Android 实机或模拟器上验证。

## 项目状态

当前 Android 单工作流版本已经形成从 Prompt 辅助、任务创建、进度跟踪到作品管理的完整闭环。项目仍在持续演进，后续重点是从“单个工作流客户端”升级为“由智能体驱动的移动创作工作台”。
