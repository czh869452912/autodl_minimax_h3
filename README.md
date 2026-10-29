<h1><img src="mobile/assets/icon.png" alt="AutoDL H3 图标" width="42" align="center" /> AutoDL MiniMax H3 移动创作助手</h1>

一个面向 Android 的本地创作工作台，连接 AutoDL MiniMax H3 视频工作流、NovelAI 图片生成和用户配置的 LLM。支持独立快速创作，也能按项目组织简报、镜头、草稿、版本素材、生成任务与助手对话。

这个项目希望把原本需要在桌面浏览器中完成的工作流操作，变成一套适合手机使用的创作流程：从构思 Prompt、准备参考图和音频，到创建生成任务、跟踪进度、预览视频和管理成片，都可以在同一个应用里完成。

## 项目目标

- 让用户通过 Android 手机直接创建和管理 AutoDL MiniMax H3 视频任务。
- 用智能体辅助 MiniMax H3 Prompt 撰写，降低复杂镜头、动作、声音和氛围描述的门槛。
- 将 Prompt、参考素材、生成任务和最终视频组织为可持续管理的创作项目。
- 保持移动端本地优先：会话、任务索引和媒体缓存保存在应用私有目录，敏感配置使用 Android Keystore 保护。

## 当前源码已实现

以下描述当前开发分支；GitHub Release 的能力以对应版本说明为准。

- **项目与镜头**：项目简报、镜头图像/视频采用版本、关联素材、项目页签恢复和成果审阅。快速创作不强制创建项目。
- **统一创作入口**：图片和视频工作台，自动保存草稿；旧助手交接可转换为正式草稿，保留来源且重复打开不重复创建。
- **NovelAI 图片创作**：图片生成、参考图、修图/遮罩及图片处理，复用本地任务、资产与授权链路。
- **版本素材与精确结果**：图片、视频、音频、Prompt 和文档资产；任务只显示本次产物，指定版本失效时不悄悄替换为其他版本。
- **Agent 创作工具**：按用户选定项目读取素材、准备草稿、提出项目/镜头修改建议，并在有限结构化授权内提交生成。修改提案需用户审阅；助手不能自行批准。
- **持久两步计划**：用户选图后生成视频，等待选择和授权、重启核查、避免重复消费；所有必要步骤成功才完成计划。当前不是通用任意流程引擎。
- **本地文本技能库**：粘贴或导入 SKILL.md/单技能 ZIP，检查、安装不可变版本、显式启用；新运行固定版本，支持停用撤销。详见[技能使用与持久化契约](docs/architecture/local-agent-skills.md)。
- **本地备份与资源恢复**：数据库和私有文件完整备份、缺失原件定位与按哈希恢复；恢复的执行记录隔离，不自动重新消费。

- **手动同步工作流**：设置页从官方签名仓库同步已兼容的 AutoDL H3 工作流。创建页和 Prompt 助手导入预览可选择工作流，按目标 schema 对齐参数和素材约束。新增的升级画质 `zm-u24` 包作为远端发布源提供；首次发布前仍使用内置工作流。发布方法见 [工作流仓库发布指南](docs/workflow-registry-publishing.md)。

- **视频任务创建**：填写 Prompt、分辨率、时长和 Seed，最多添加 9 张参考图与 3 段参考音频。
- **Prompt 智能体**：使用内置的官方 MiniMax H3 Prompt Skill，通过多轮对话梳理主体、动作、镜头、声音和氛围，并把完成的 Prompt 发送到任务创建页面。
- **多模态上下文**：可在 Prompt 助手中添加图片、引用素材，并保留本地会话记录。
- **任务队列**：查看任务状态、刷新进度、重试下载，并通过 Android 后台任务同步生成结果。
- **本地画廊**：搜索和管理已下载作品，查看首帧、视频详情并批量删除。
- **原生视频播放**：在详情页通过 AndroidX Media3 控件和 libmpv 引擎预览、全屏播放多种本地视频编码。
- **作品导出**：将视频保存到系统相册，也可按设置自动导出并保留应用内副本。
- **本地安全存储**：AutoDL Token 和 LLM API Key 由 Expo SecureStore（Android Keystore）保存。
- **工作流内核 B 阶段**：声明式 WorkflowPackage、受限 JSON Schema/JSON Pointer compiler、本地 Registry active/previous 指针、兼容性校验、固定 Git commit-attestation 校验，以及 Registry 驱动的创建页已经接入。远程工作流仍只能是签名声明式 JSON，不执行远程代码。

## 典型使用流程

1. 在设置页配置 AutoDL Access Token 和 LLM API。
2. 打开 Prompt 助手，描述想制作的画面、动作、镜头和声音。
3. 根据智能体建议补充信息，得到适用于 MiniMax H3 的完整 Prompt。
4. 将 Prompt 发送到创建页，选择分辨率、时长、Seed，并添加参考图或参考音频。
5. 创建 AutoDL 工作流任务，在任务页跟踪生成状态。
6. 生成完成后，在画廊中预览、播放或导出视频。

## 安装与开始使用

### 已知限制

本地视频已统一使用 Media3 控件和 libmpv 引擎；系统相册等外部播放器的编码支持可能不同。真机多编码和超长后台操作的验收范围见[已知问题](docs/known-issues.md)。进程退出后的 Agent 运行显示为中断，不承诺任意工具边界续跑或后台常驻。

### 方式一：从 Release 下载

前往项目的 [GitHub Releases](https://github.com/czh869452912/autodl_minimax_h3/releases) 页面，下载最新 Android APK，并在手机上安装。

当前源码构建要求 Android 8.0（API 26）或更高版本，与统一播放引擎的最低系统版本一致。

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

构建链支持 Temurin JDK 17 或 21。Android Studio JBR 25（例如 `25.0.2`）与当前 Kotlin/React Native Gradle 解析器不兼容，不应作为本项目构建 JDK。模拟器必须使用与 APK 相同的 ABI：x86_64 模拟器请执行：

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.7.6-hotspot'
./gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64
```

arm64-v8a APK 只能安装到 arm64 设备/模拟器；在 x86_64 模拟器上会因缺少 `libreactnative.so` 崩溃。

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

安装后打开应用，进入“设置”，按所用能力配置账号：H3 视频需要 AutoDL，助手需要 LLM，NovelAI 图片需要对应账号。手工查看本地项目与已有素材无需模型配置。

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

按服务商控制台提供的实际模型名称与接口填写配置。文本、视觉、工具调用和流式输出能力需要与当前使用场景匹配；不把实验模型名当作长期可用的默认配置。

### 创建第一个任务

配置保存后，可以先在 Prompt 助手中完成提示词，也可以直接打开创建页：

1. 输入 MiniMax H3 Prompt。
2. 选择工作流支持的分辨率和时长。
3. 按需添加参考图、参考音频或 Seed。
4. 提交任务，并到任务页查看进度。
5. 任务完成后下载视频，在画廊中播放或保存到系统相册。

## Prompt 智能体如何工作

Prompt 助手不是一个简单的文本输入框。它在 APK 内运行 DeepAgents 与 AG-UI 会话逻辑，并使用 CopilotKit React Native 渲染对话、Markdown、流式响应、附件和工具调用状态。

内置的 MiniMax H3 Prompt Skill 会根据输入类型组织适合 T2VA、I2VA、FL2VA、L2VA 和 Ref2VA 等场景的提示词结构。智能体可准备 Prompt 与正式创作草稿，调用已注册的创作工具；实际的视频生成由 AutoDL 上的 ComfyUI 工作流执行，图片生成由 NovelAI 执行。生成权限来自用户配置的有限额度授权，技能正文与聊天内容不能扩大权限。

当前版本不会假装调用未接入的 MiniMax Hub 画布工具。如果某个 Skill 流程依赖应用尚未提供的外部工具，智能体应交付可执行的 Prompt 与创作准备材料，并明确说明边界。

## 工作流与产品边界

- 视频连接已适配的 AutoDL H3 工作流，图片连接 NovelAI；新服务商仍需完整输入、输出、授权与恢复适配。
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
| Agent Runtime | DeepAgents 1.13.2、AG-UI，本地会话持久化；中断可见，不是任意 checkpoint 续跑 |
| Prompt 能力 | APK 内置只读 H3 Skill bundle + 不可变本地文本技能版本/运行快照 |
| 图片生成 | NovelAI |
| 项目编排 | 固定的选图 → 视频两步计划 |
| 视频生成 | AutoDL 托管的 ComfyUI 工作流 |
| LLM 接口 | 用户配置的 OpenAI-compatible Endpoint、Model 和 API Key |
| 本地数据 | SQLite 索引、应用私有文件目录、SecureStore |
| 原生播放 | AndroidX Media3 UI + libmpv 0.41.0 |
| 服务端依赖 | 项目不要求自建业务服务端；外部依赖为 AutoDL、NovelAI 与用户选择的 LLM API |

生成队列、服务商装配、凭据绑定及扩展约定见[本地生成后端架构](docs/architecture/generation-backend.md)。

维护原则：

- 不要在代码、测试、文档或日志中写入真实 Token/API Key。
- 修改工作流参数前，先核对 AutoDL 工作流实际接受的字段、素材数量和枚举值。
- Agent 生成的内容必须保留用户确认环节，不能把“准备好 Prompt”描述成“视频已经生成”。
- 新能力应优先保持本地可恢复、错误可解释、任务状态可追踪。
- README 中所有“已实现”能力都应能在当前应用中找到对应入口；未来设计统一放入 Roadmap。

## Roadmap

### 后续方向与验证门槛

- **技能提炼与角色库**：在现有导入/启用/运行闭环上增加用户选择证据、草稿审阅、发布和独立启用；当前不提供模型自动提炼或复杂角色管理。
- **静态 3D 导演台**：离线 WebView/Three.js 已有独立 Android 实验，验证取景、保存、PNG 和 context 恢复；尚未接入生产项目/素材/草稿。目标实机与资源预算通过后再产品化，见[实验记录](experiments/scene-probe/README.md)。
- **通用持久流程**：当前保持 selection/video；实际第三种业务步骤交付后再推广 handler、人工节点和执行租约，不增加空步骤。
- **DeepAgents 升级**：固定候选 1.16.0 的隔离实验已解决最小 Metro 入口阻塞并编译 Hermes 字节码；完整 APK、视觉/流式/旧会话迁移未验收，生产未升级，见[兼容实验](experiments/deepagents-1.16/README.md)。
- **编辑与复用**：完整 Prompt 版本对比、创作模板、场景文档、时间线、运动轨道和视频编码按实际编辑需求引入。
- **跨设备与协作**：本地完整备份已有；项目分享包、跨设备同步和多人协作尚未交付。

当前调整的逐项决策、提交批次与测试边界见[研究采纳及调整计划](docs/reviews/2026-10-29-research-adoption-and-adjustment-plan.md)。Roadmap 表示后续方向，不代表所有能力都已实现。

## 数据、安全与权限

- Agent 会话、任务索引和画廊元数据保存在本地。
- 视频和首帧默认存储在应用私有文件目录，用户可选择导出到系统相册。
- 参考素材会在生成任务或用户选用的视觉助手调用需要时发送给对应服务商；技能文本会随模型实际读取进入该次模型上下文。
- AutoDL Token 和 LLM API Key 使用 Expo SecureStore 保存，并由 Android Keystore 提供系统级保护。
- 应用需要网络权限以访问 AutoDL、NovelAI 和 LLM API；媒体权限仅用于选择素材和导出作品。
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

当前开发分支已包含独立图片/视频创作、项目与镜头、版本素材、受授权约束的 Agent 创作工具、本地文本技能和持久两步计划。3D、通用编排、复杂角色及依赖升级仍按实验结果和验收门槛推进。
