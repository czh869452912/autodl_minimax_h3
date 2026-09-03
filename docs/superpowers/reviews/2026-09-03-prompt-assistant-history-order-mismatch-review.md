# Prompt 助手历史会话顺序错乱与"点开不是对应对话"问题审查

> 审查时间：2026-09-03
> 审查对象：历史会话列表的排序与选中加载链路（`mobile/src/agent/AgentScreen.tsx`、`runtimeStore.ts`、`threadStore.ts`、`agentPresentation.ts` 的 `groupSessions`/`sessionTitle`、`PromptAssistantUi.tsx` 的 `HistoryList`）。
> 现象：① 历史列表顺序与创建顺序不一致；② 点开的对话与所点条目不符——条目显示"12 条消息"，打开后像是另一个只有 2 条消息的会话。
> 审查方法：从 `HistoryList` 行渲染反查数据源（threads state → runtime 事件 → threadStore），逐段核对排序、计数、标题与运行时缓存逻辑；核对了 `@copilotkit/react-native` 的消息来源与 `useAgent` 解析路径；运行 `runtimeStore.test.ts`、`agentPresentation.test.ts`（8 项全部通过，当前无针对切换顺序的测试）。

## 1. 总体结论

三个叠加缺陷共同造成观察到的现象，数据本身未损坏：

1. **列表顺序冻结**：`threads` 数组顺序只在 App 启动（或删除会话）时按 `updated_at DESC` 全量加载，此后活动会话的 `updatedAt` 持续变化但数组位置不重排，组内顺序变成"非时间序、也非创建序"的冻结序。
2. **计数口径不一致（"12 条 vs 2 条"的直接解释）**：列表行统计的是持久化原始消息条数（含每条工具结果消息），而时间线把工具消息折叠进助手气泡的 `ToolTimeline`，一轮多工具会话轻松出现"12 条存储消息 → 2 个气泡"，用户自然误判为打开了别的对话。
3. **同名会话 + 冻结顺序 → 真点错行**：会话标题取"第一条用户消息前 40 字"，重复式提问产生多个同名会话；叠加顺序漂移后，相邻同名行极易点错——这时打开的才是真正"另一个 2 条消息的对话"。

另发现一个同族的潜在数据完整性风险（第 5 节），建议一并处理。

## 2. 顺序错乱的机制（代码级确认）

| # | 环节 | 位置 | 行为 |
|---|---|---|---|
| 1 | 全量加载 | `AgentScreen.tsx:98-137` | 仅挂载时 `threadStore.list()`（SQL `ORDER BY updated_at DESC`，`threadStore.ts:105-111`） |
| 2 | 原地更新 | `AgentScreen.tsx:186-192` | `handleSnapshotChange` 用 `items.map` 按 threadId 替换快照，**数组位置不变** |
| 3 | updatedAt 持续推进 | `runtimeStore.ts:65-76` | 每次消息变化 `updatedAt: Date.now()`，活动会话时间不断变新 |
| 4 | 分组不排序 | `agentPresentation.ts:185-204` | `groupSessions` 按 updatedAt 分桶（今天/近 7 天/更早），**组内保持传入数组顺序** |

结果示例：数组冻结为 `[B(今日 10:00), A(今日 14:00)]`，两行同属"今天"组 → B 显示在 A 上方，但 B 的时间戳更早。顺序既非创建序也非最近活动序，直到下次全量 reload 才恢复。

## 3. "12 条消息" vs 打开后 2 个气泡：计数口径不一致

- 行内 meta：`{thread.messages.length} 条消息 · {时间}`（`PromptAssistantUi.tsx:941`）——统计**持久化原始消息**，包含：
  - 每条工具结果消息（CopilotKit 将 TOOL_CALL_RESULT 事件存为独立的 role 缺失/`tool` 消息，`aguiAgent.ts:43-47` 注释证实；`normalizeMessages` 第 45 行专门兼容这种无 role 形态）；
  - 带工具调用的中间 assistant 消息。
- 时间线渲染：`normalizeMessages`（`agentPresentation.ts:104-149`）只产出 user / assistant 两类行，工具消息折叠进助手气泡的 `ToolTimeline`，不产生独立气泡。
- DeepAgents 一轮流程典型构成：1 user + 1 assistant(工具调用) + N tool 结果 + 1 assistant 正文 ≈ 12+ 条存储消息，时间线只有 2 个气泡。**多数情况下打开的就是同一个会话**，只是两个界面的"条数"口径不同。

## 4. "确实是另一个对话"的路径：同名标题 + 顺序漂移

`sessionTitle`（`agentPresentation.ts:162-169`）= `customTitle || 第一条用户消息.slice(0, 40)`。用户重复用相似开头提问（常见于反复调试 prompt）会产生多个同名会话；叠加第 2 节的顺序冻结/漂移，同名行位置随活动变动，点错相邻同名行后看到的就是"另一个 2 条消息的对话"，且其行内条数（2 条）与用户记忆中目标会话（12 条）不符，进一步强化"点错了"的判断。

## 5. 同族潜在风险：孤儿 runtime 双写同一会话行（代码级确认，未触发也建议防御）

- `promptRuntimeRegistry` 是模块级单例，runtime 按 `configKey+threadId` **永不淘汰**（`runtimeStore.ts:46-51, 109`）。
- LLM 设置任一字段变更 → `ReadyAgent` key 变化整体重挂载（`AgentScreen.tsx:71-77`）→ 同一会话在新 configKey 下创建新 runtime R2；旧 R1 的 agent 仍被 registry 引用、旧 CopilotKit core 仍被 `localCores` WeakMap(agent) 引用（`LocalCopilotKitProvider.tsx:8-22`），**在途流式 run 不会被 abort**，继续经 `persist` 的 300ms 防抖写库（`runtimeStore.ts:73-76`）。
- R1 的 emit 已无监听者（旧 session 卸载时退订）→ UI/threads 状态只跟随 R2，但 R1、R2 交替 `INSERT OR REPLACE` 同一行（`threadStore.ts:112-121`）→ last-writer-wins，历史可能被回滚或交错覆盖，且 UI 无感知。

## 6. 修复建议（未改动代码）

1. **顺序（低成本，直接解决现象 ①）**：`groupSessions` 组内加 `sort((a, b) => b.updatedAt - a.updatedAt)`；或在 `handleSnapshotChange` 后整体按 `updatedAt DESC` 重排。同步在 `runtimeStore.test.ts` / 新增 `agentPresentation` 用例锁定"组内时间降序"。
2. **计数口径（解决"12 vs 2"误解）**：行 meta 改为按时间线同口径计数（仅 user/assistant 行，或直接展示最后活动相对时间），去掉裸 `messages.length`。
3. **同名会话**：无 customTitle 时标题附加序号或开始时间（如"同一开头 · 09-03 14:22"），消除同名歧义。
4. **数据完整性防御**：设置变更重挂载时对旧 runtime `abortRun()` + `flush()`；registry 提供 `evict`；`persist` 前校验该 runtime 仍是当前绑定（如带代际标记）。
5. **测试缺口**：现有测试未覆盖"切换会话 → 列表顺序/计数/标题一致性"，建议补一条集成用例（两条会话交替活动后断言列表序与点开内容一致）。
