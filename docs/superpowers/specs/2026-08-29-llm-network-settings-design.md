# LLM 网络高级设置设计

## 目标

解决慢速 OpenAI-compatible API 在 Android Prompt 助手中被固定 60 秒 XHR 超时提前终止的问题，并允许用户在设置页自行配置单次请求超时和最大重试次数。

## 当前行为与根因

- Android 流式请求适配器在 `mobile/src/shims/copilotKitStreamingFetch.ts` 中固定设置 `xhr.timeout = 60_000`。
- OpenAI SDK 默认请求超时为 10 分钟，默认最大重试次数为 2 次。
- Android 的 60 秒限制通常先于 SDK 超时触发，因此慢 API 会表现为 `Network request timed out` 或笼统的 `Network request failed`。

## 用户界面

在设置页现有“Prompt 助手 LLM”卡片内增加默认收起的“高级设置”区域。

展开后显示：

- `请求超时（秒）`
  - 默认值：`600`
  - 允许范围：`30–3600`
  - 仅允许整数
- `最大重试次数`
  - 默认值：`2`
  - 允许范围：`0–5`
  - 仅允许整数

辅助说明明确：超时是一次 LLM 请求允许持续的最长时间；重试会延长总体等待时间，并可能产生额外 API 调用成本。

## 数据模型与持久化

`AppSettings` 新增：

- `llmTimeoutSeconds: string`
- `llmMaxRetries: string`

使用字符串保留 TextInput 的可编辑状态，保存时统一解析并校验。SecureStore 新增键：

- `llm.timeoutSeconds`
- `llm.maxRetries`

未保存过这些字段的旧安装自动使用 `600` 和 `2`，无需数据库迁移。

`H3AgentConfig` 新增：

- `timeoutMs: number`
- `maxRetries: number`

`toH3AgentConfig()` 将秒转换为毫秒。

## 请求参数传播

保存后的配置在 Prompt 助手获得焦点时沿现有设置刷新流程读取：

1. `readSettings()` 读取 SecureStore 或默认值。
2. `prepareSettingsForSave()` 负责整数与范围校验。
3. `toH3AgentConfig()` 生成毫秒超时和重试次数。
4. `createOpenAICompatibleModel()` 将 `timeout` 和 `maxRetries` 传给 `ChatOpenAI`。
5. Android XHR 流式适配器读取同一个 `timeoutMs`，替换当前固定 60 秒。

同一套配置同时约束 SDK 与 Android 流式传输，避免两层超时不一致。

## 错误处理

- XHR `ontimeout` 返回包含实际秒数的错误，例如：`LLM 请求超过 600 秒未完成，请在设置的高级选项中增大请求超时。`
- XHR `onerror` 保持为网络连接失败，但提示检查 API 地址、网络和服务可用性。
- HTTP 4xx/5xx 和 API 返回正文继续走现有错误链路，不转换成网络超时。
- 用户主动停止生成仍使用 `AbortError`，不显示成超时。

## 生命周期行为

设置保存后，下一次进入 Prompt 助手时创建对应配置的 runtime。正在执行的旧请求不在中途改变超时；这避免修改全局参数时影响已经发送的请求。

## 测试与验收

- 存储测试覆盖默认值、读取旧设置和写入新字段。
- 校验测试覆盖合法边界、非整数、过小/过大值。
- Agent 配置测试覆盖秒到毫秒的映射。
- Model adapter 测试确认 `ChatOpenAI` 收到 `timeout` 和 `maxRetries`。
- Streaming shim 测试确认 XHR 使用配置值并区分 timeout/network error。
- 设置页测试确认高级区域默认收起、可展开、显示默认值。
- 运行全量 Jest、TypeScript 检查、Android debug 构建，并在模拟器验证保存与重新读取。

## 非目标

- 本阶段不增加按“首 token 超时”和“流中断超时”分别配置。
- 不增加无限重试。
- 不改变视频生成 API 的超时设置。
- 不保证 Android 进程被系统杀死后请求继续执行。
