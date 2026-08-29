# React Native 本地 Agent Harness 设计（修订版）

## 目标

Prompt 助手必须是 Android APK 内的完整 agent harness：DeepAgents、官方 H3 多文件 skills、工具调用、循环、取消、线程状态和恢复都在本地运行。网络层只允许访问用户配置的 OpenAI-compatible LLM API；不需要 CopilotKit Runtime、Express、LangGraph Server、云端线程服务或局域网服务。

同时，通用聊天交互尽量使用现成的 CopilotKit React Native 组件，不重新设计消息气泡、composer、timeline、tool-call 状态和 session 生命周期。

## 核心决策

- **宿主**：Expo/React Native Android，生产入口不加载 WebView agent，也不启动 Node/HTTP 服务。
- **Harness**：APK 内运行 `deepagents/browser`，负责模型/工具循环、计划、技能渐进读取、上下文管理、取消和迭代限制。
- **聊天 UI**：使用 `@copilotkit/react-native/components` 的 `CopilotChat`。它拥有消息流、输入、停止、重试和工具调用渲染管线；业务代码只注册必要的业务工具 renderer。
- **本地连接**：由于 RN 官方 `CopilotKitProvider` 只接受 `runtimeUrl`，不能直接注入本地 agent，因此封装一个很薄的 `LocalCopilotKitProvider`，内部使用 CopilotKit Core 的本地 agent 注册能力（`agents__unsafe_dev_only`）。不修改 CopilotKit 的消息/timeline 协议。
- **模型**：`ChatModelAdapter` 只向用户配置的 LLM API 发请求。API key 由 Android Keystore-backed SecureStore 提供，不进入 bundle、日志或线程记录。
- **技能**：完整官方 H3 `skills/` 目录在构建时原样打包到 APK，运行时作为 DeepAgents 的本地文件树；不生成缩短 prompt、不维护技能分支表。
- **存储**：使用 `expo-sqlite` 做一个隔离的本地存储适配器，保存 thread 元数据、CopilotKit message records、最终结果和 DeepAgents checkpoint/event snapshot。UI 不直接操作 SQLite。适配器只负责序列化/恢复，不实现第二套 timeline。

## 数据流

```text
Android APK
├─ React Native shell / navigation
├─ LocalCopilotKitProvider (thin local-agent adapter)
├─ CopilotChat (official rendered chat surface)
├─ DeepAgents browser harness
│  ├─ complete H3 skill files
│  ├─ local tools and tool results
│  ├─ local checkpoint + event snapshot
│  └─ OpenAI-compatible model adapter
└─ expo-sqlite LocalThreadStore
                 │
                 └─ HTTPS only to configured LLM API
```

## 不可避免的两个薄适配器

### `LocalCopilotKitProvider`

将本地 `AbstractAgent` 注册到 CopilotKit Core，并提供 RN 上下文、错误订阅和工具执行跟踪。所有消息、流式事件和 renderer 仍使用 CopilotKit 官方协议；该文件不包含消息气泡或时间线状态机。

### `LocalThreadStore`

以稳定 `threadId` 为键保存和恢复 CopilotKit message records、工具调用/结果、附件引用、agent checkpoint 和最终 H3 prompt。它是 SQLite 的序列化边界，不向 UI 暴露数据库细节。若某项记录无法恢复，必须显示可重试的持久化错误。

这是当前约束下无法由 CopilotKit RN 直接提供的最小基础设施：官方 RN threads persistence 依赖 Enterprise 平台，且官方自托管说明明确指出普通 framework checkpointer 不会恢复 AG-UI 可视化事件历史。该适配器应保持独立、可替换，并配合上游版本升级测试。

## 会话和可视化行为

1. `CopilotChat` 通过 `threadId` 绑定 `LocalThreadStore`，负责消息列表、流式更新、停止、重试和错误展示。
2. 创建/切换会话只改变稳定 `threadId` 并调用 store 的 hydrate/save；不在业务页面维护第二份消息数组。
3. DeepAgents 的工具调用、工具结果、interrupt 和多轮文本事件直接转成 CopilotKit Core 接受的 agent events，由官方 chat surface 渲染。
4. 只为视频生成等业务工具注册 renderer；通用工具使用 CopilotKit 默认显示。不得重新实现 timeline、stage reducer 或自定义 message bubble 系统。
5. 重启后先恢复 message records 和 checkpoint，再继续同一 `threadId`；无法恢复 checkpoint 时允许以已恢复 transcript 创建新 run，并明确提示用户。

## 失败边界

- 缺少 LLM endpoint/key/model：在 composer 上显示配置错误，不调用任何 agent。
- 网络/TLS/模型能力错误：显示可重试的 transport/capability 状态，不伪造结果。
- skill 文件缺失：报告具体路径并停止本轮。
- 取消或达到迭代限制：保留部分 trace，状态为 cancelled/limit，不把部分文本标记为最终结果。
- SQLite 读写失败：显示持久化错误，禁止静默丢失会话。

## 明确排除

- 生产路径不依赖远端 CopilotKit Runtime 或任何 agent server。
- 不维护第二套手写 chatbot、timeline、SSE parser、session reducer 或固定技能模板。
- 不为旧版数据提供迁移；以新安装、无历史数据为基线。

## 验收标准

- 关闭所有服务端进程，APK 仍可启动 Prompt 助手；仅配置 LLM API 后即可运行。
- 一次请求可产生真实的多轮模型/工具调用，并在 CopilotChat 中显示进行中、完成、失败状态。
- APK 中存在完整官方 H3 skills，agent 能按需读取多文件 references。
- 新建、切换、重启恢复 thread 不丢失文本、工具调用/结果、附件引用和最终 prompt。
- Android emulator 上不因 `localhost`、远端 health check 或 SSE 解析导致白屏。
- TypeScript、单元/集成测试、Metro bundle、debug APK 和本地离线 mock LLM 流程全部通过。

## 参考依据

- [CopilotKit RN `useThreads` 限制](https://docs.copilotkit.ai/reference/react-native/hooks/useThreads)
- [CopilotKit 自托管 threads 与持久化边界](https://docs.copilotkit.ai/deepagents/threads-self-managed)
- [CopilotKit thread 生命周期](https://docs.copilotkit.ai/deepagents/threads-lifecycle)
- [DeepAgents backends](https://docs.langchain.com/oss/javascript/deepagents/backends)
- [DeepAgents production persistence](https://docs.langchain.com/oss/javascript/deepagents/going-to-production)
