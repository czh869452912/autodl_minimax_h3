# 本地 React Native Agent Harness 迁移计划

> 基于 2026-08-29 修订设计；所有 agent 运行时均在 Android APK 内。

## 目标

移除生产路径中的远端 CopilotKit/Express Agent Runtime，将完整 DeepAgents harness、官方 H3 skills、CopilotKit RN chat 和本地线程恢复迁移到 React Native Android。

## 实施步骤

### 1. 建立本地运行边界

- 从旧版 release/reference 复用 `deepagents/browser` harness、模型适配器和完整 H3 skill 文件。
- 将 `@langchain/openai` 仅作为 LLM API 适配层；API key 从 SecureStore 读取。
- 添加 `LocalCopilotKitProvider`，集中封装 CopilotKit Core 的本地 agent 注册 API。
- 增加 mock model 测试，覆盖多轮文本、工具调用、取消和错误。

### 2. 打包官方 skills

- 构建时递归复制完整官方 `skills/` 目录，保持路径和字节内容。
- 生成带 SHA-256 manifest 的 RN 可读资源表。
- 测试所有 `SKILL.md`、references 和 supporting files 均存在。

### 3. 接入官方聊天组件

- 将 `AgentScreen` 改为 `LocalCopilotKitProvider` + `@copilotkit/react-native/components` `CopilotChat`。
- 删除远端 `runtimeUrl`、health check、SSE client 和自定义消息/timeline reducer。
- 仅注册视频生成等业务工具 renderer；通用工具使用官方默认渲染。

### 4. 添加本地线程存储适配器

- 用 `expo-sqlite` 建立隔离 `LocalThreadStore`，保存 thread 元数据、CopilotKit messages、tool call/result、附件引用、checkpoint/event snapshot 和最终 prompt。
- 暴露 `load/save/list/delete`，UI 不直接访问 SQLite。
- 覆盖进程重启恢复、损坏数据、写入失败和 checkpoint 不可恢复等状态。

### 5. 清理旧服务端路径

- 删除生产不再使用的 CopilotKit Runtime、Express、DeepAgents server route 和 server skills source of truth。
- 删除设置页中的 Agent Runtime URL/访问令牌，仅保留 LLM endpoint/model/key。
- 更新 README、Gradle/Metro 边界检查，确保 APK 不含 `/api/copilotkit` 或 LAN runtime 地址。

### 6. 验证

- `npm test`、`npm run typecheck`、Metro bundle、Gradle `assembleDebug`。
- 无任何服务端进程时安装 APK，在 emulator 中完成：新建会话、发送、多轮工具调用、停止、重试、切换线程、强杀重启恢复。
- 检查日志和 APK 资源中不出现 API key、远端 Agent endpoint 或旧版 harness。

## 维护原则

CopilotKit `CopilotChat`、DeepAgents、LangChain model adapter 和 Expo SQLite 是事实来源。业务代码只维护两个薄适配器（本地 provider 与存储序列化），不得重新实现通用 timeline、消息气泡、session reducer 或 agent loop。
