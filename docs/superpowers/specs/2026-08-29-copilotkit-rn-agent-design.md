# CopilotKit React Native Agent UI 迁移设计

## 目标

将 Prompt 助手从当前“assistant-ui Native primitives + 自定义消息/工具 UI”迁移为 CopilotKit React Native 的完整渲染组件，并通过 AG-UI 连接服务端 DeepAgents。RN 端只维护原生应用壳、导航和业务专属卡片；通用 agent 交互由 CopilotKit 提供，官方 H3 多文件 skills、模型调用、工具执行和会话状态由服务端维护。

## 决策

- 前端：Expo/React Native Android，使用 `@copilotkit/react-native/components` 的 rendered chat surface。
- Agent 协议：AG-UI SSE，统一传递文本、reasoning 摘要、工具调用、工具结果、状态更新和 interrupt。
- Runtime：服务端 Copilot Runtime，负责鉴权、agent 路由和 AG-UI 代理；不在 APK 内运行 DeepAgents 或直接携带模型密钥。
- Agent：服务端 LangChain DeepAgents，加载官方 H3 skills 的完整多文件目录，并保留真实工具调用 harness。
- 持久化：服务端保存 agent thread/checkpoint；RN 本地只保存用户设置、任务/媒体索引和必要的 UI 偏好。
- 新安装基线：不提供旧版 assistant-ui runtime、旧版 agent adapter 或数据迁移兼容层。

## 数据流

```text
RN App
  ├─ AutoDL 原生 Header / Tabs / 业务页面
  └─ CopilotKitProvider + CopilotChat
       │ HTTPS + AG-UI SSE
       ▼
Copilot Runtime
       │ authenticated agent route
       ▼
DeepAgents
  ├─ official H3 skill files
  ├─ model adapter / provider credentials
  ├─ real tools and tool results
  ├─ interrupts / approvals
  └─ checkpoint / thread persistence
```

## 边界和实现约束

1. `AgentScreen.tsx` 不再定义通用消息气泡、timeline、composer、tool-call fallback 或 reasoning 展示。
2. CopilotKit 的 `CopilotChat` 是 Prompt 助手唯一通用聊天表面；外层只包装品牌 Header、Safe Area 和应用导航。
3. 视频生成、任务进度、参考素材预览等业务内容通过明确的 frontend/backend tool renderer 或任务页面展示，不混入通用聊天协议。
4. 服务端必须暴露 `/info` 和 agent run/connect/stop 的 AG-UI 端点，并在 Android emulator 上使用可达地址（开发环境默认 `10.0.2.2`，生产使用 HTTPS 域名）。
5. RN 不再把完整 skill bundle 打进 APK；服务端 skills 目录是唯一事实来源。
6. API key、AutoDL token 和其他服务端凭证不得下发给 RN agent runtime。RN 只发送用户认证凭证和业务输入。
7. 流式错误必须进入 CopilotKit 的错误状态；不得出现空 assistant 气泡或静默失败。

## 验收标准

- 新安装启动后，Prompt 助手显示 CopilotKit rendered chat，而不是当前自定义 `MessageParts`/`Composer`。
- 发送消息可以看到流式文本；agent 触发工具时能看到工具进行中、完成和失败状态。
- interrupt/approval 可以暂停并继续 agent run。
- 重启应用后，服务端 thread 可以恢复；断线重连不丢失已完成消息。
- Android emulator 使用 debug APK 时，首次发送不会因为 `localhost`、Hermes polyfill 或 SSE 解析失败而出现空白消息。
- TypeScript、单元测试、Metro release bundle 和 Android debug APK 均通过。
- 当前自定义 assistant runtime、端侧 skills bundle 和旧版 Web assistant adapter 不再被生产入口引用。

## 不在本次范围内

- 重新设计 Gallery、视频播放器或设置页的业务视觉。
- 迁移旧版 Web UI 到 WebView。
- 为 CopilotKit RN 重新实现一套通用 timeline。
- 为旧版本地 agent 会话提供数据迁移。
