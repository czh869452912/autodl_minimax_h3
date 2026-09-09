# Prompt 助手第三轮审查：Agent、交互、Timeline 与 Session（修复后复审）

> **后续独立核验（2026-09-07）**：[核验矩阵与证据](2026-09-07-prompt-assistant-round3-verification.md)纠正了本文 T6、U4、A1、P11、P5、H4 等结论或部分推理，并补充 SDK 默认摘要、附件大小限制及现有 CAS/GC 的实际行为。本文保留作为原始评审记录；修正优先级与实施边界请以[综合方案](../../plans/2026-09-07-prompt-assistant-foundation-remediation.md)为准，不再沿用下述“0 项推翻”结论。

日期：2026-09-06。代码基线：`cb263cf3`（dev 已对齐 origin/main，v1.4.13），包含 `codex/prompt-assistant-correctness` 两批修复（PR #27）。

> **2026-09-07 复核修订（v2）**：对本文 47 项新发现逐项对照代码复核（G 组逐行核验，U/T/S 组四路并行核验，全部只读）。结论：**42 项属实、5 项修正细节（G7/U3/U11/T5/T8）、0 项推翻**；已修复项抽查（F1/F2/F4/F5/F7/F8/F9/A8/B1/D9）全部属实。正文已按复核结论修正（标注"复核"），并新增第五节"前端展示效果评审"与 H 组复核补充发现。复核基线：`b1807e65`（仅文档提交，src 与 `cb263cf3` 一致）。

## 结论与范围

本轮四路并行复审（agent 实现 / UI 交互 / timeline / session），逐项核验前两轮发现在修复后的状态，并对新增代码（`deepAgentStream.ts`、`runState.ts`、`promptVersions.ts`、`promptHandoff.ts`、`imageMessageIdentity.ts`、`assistantWorkspace.ts`、`PromptVersionPanel.tsx`、`RunTimelineRow.tsx` 等）做深审。全部只读。

结论：

1. **批次 1–3 声称的修复全部属实**：F1–F9、F7/F8、建议 1/2/3/5/8、B1/B4/B7、C10/C16/C20、A8/A11/A15、D9 均已修复且回归测试到位。`runtimeIntegration.test.ts` 走真实 `AbstractAgent.runAgent()` 管线（仅 mock uuid），是本轮最有价值的测试资产。
2. **上一轮遗留的架构项全部未动**（文档已声明）：A1 上下文窗口、A2/D2 图片 base64、A6 工具超时/HITL、建议6/D1 消息级存储、D3–D6。
3. **本轮最重要的新发现**：新功能在新地基上放大了旧问题——
   - 版本/草稿功能把 base64 图片在 `state_json` 中复制了 N 倍（恢复 5 次版本后同一图片 ≥7 份，S1）；
   - 流式失败反馈链路存在盲区：有历史 run 的会话发送失败时用户零反馈、草稿已清、气泡悬挂（U1+C1，"按了发送什么都没发生"）；
   - 失败轮输出被从**所有**后续轮模型上下文剔除，UI 可见而模型不可见，追问必然答非所问（G4）；
   - 每 delta 仍触发全量 normalize + 正则解析 + 全文签名 + threads 全量重排（T1/S2，性能结构未变）。

## 一、前两轮发现状态总览

### 已修复（核验属实）

| 编号 | 现位置 | 核验要点 |
| --- | --- | --- |
| F1 增量丢字 | `deepAgentStream.ts:84,122` | 显式 chunk 判定 + 纯追加；`ha+ha+!`→`haha!` 回归 |
| F2 工具参数分块 | `deepAgentStream.ts:88-119,131` | index/id 双键聚合，END 在 finish_reason/结果/流末收口，晚于最后 ARGS |
| F3 回传丢工具调用 | `aguiAgent.ts:31-63` | toolCalls 转 LangChain 格式；无结果残缺调用降级纯文本；损坏+有结果显式报错 |
| F4 重命名覆盖 | `threadStore.ts:113-121`、`runtimeStore.ts:211-221` | rename 仅 UPDATE 标题列 + 经 enqueueSave 串行化 + 序号守卫 |
| F5 删除死锁 | `AgentScreen.tsx:176-194` | 删空自动建替代会话，初始化路径同 |
| F6 提及重编号 | `imageMessageIdentity.ts:14-27` | 附件身份持久化，展示优先持久化 displayName |
| F7 Run 不持久化 | `runState.ts`、`runtimeStore.ts:142-161` | 4 终态（另 running 进行态）入 `h3Runs` 随 state_json 落盘，boundary 立即 flush，retryOf 链（复核修正：原文"5 终态"未剔除 running） |
| F8 防抖丢数据 | `runtimeStore.ts:99-126` | 300ms + 2s max wait、失败保留 dirty 快照重试、6 类显式 flush 时机 |
| F9 产物误判 | `promptParser.ts:10-49` | 仅认闭合 `h3-prompt` 围栏 + 三/六字段非空校验，13 种拒绝样例 |
| A8 配置白屏 | `AgentScreen.tsx:36-41,74-88` | 校验前置渲染分支，不再进入会 throw 的 ensure |
| A11 randomUUID | `index.js:4` | polyfill 先于一切；@ag-ui/client 走 uuid 包 |
| A15 重试截断 | `aguiAgent.ts:147-156` | 重试只裁模型输入，显示层保留半成品，attempt 并存 |
| B1 假"进行中" | `runtimeStore.ts:72` | 冷启动 running→interrupted，工具转 cancelled/failed |
| B4/B7 | `promptParser.ts:40,57`、`RunTimelineRow.tsx:31` | 围栏闭合才出卡；错误内联 run 行、失败自动展开 |
| 建议1/2/3 | `RunTimelineRow.tsx:12-29`、`agentPresentation.ts:107`、`assistantWorkspace.ts:13-37` | 当前活动+秒表；ToolMessage.status 真实来源；按轮次锚定+耗时（复核修正：无"定向流动画"，实际仅 ActivityIndicator 与流式 markdown 动画） |
| 建议5/8、C10/C16/C20 | 图片可点预览、交接带素材/参数、运行中可输入、引用回流、导出锁 | 见 UI 复核 |
| D9 标题不落盘 | `runtimeStore.ts:179-188` | updateMetadata 同步快照+pendingSave |

### 未修复（多已文档化遗留）

A1 上下文窗口（`aguiAgent.ts:196-198` 全量重放）、A2/D2 图片 base64（`threadStore.ts:106` + `aguiAgent.ts:86-99` 每轮重发）、A6 工具超时/HITL、A9 全局 fetch shim 与总时长超时、A12 技能包全量注入（复核实测约 402KB UTF-8 / 36 文件，且虚拟 FS 无 checkpointer，每次 run 重新播种、无法摊销）、建议6/D1 单行 JSON 整行覆盖无索引、D3 runtime 无上限、D4 零 GC、D5 threadId 时间戳+random、D6 搜索 O(N)、B2/B3/B5/B6/B9/B10、B12 空态建议、C2 触控目标、C5 权限引导、C6/C7 键盘、C8 触觉、C9 动态字体、C12 防双击、C13 设置死端、C14 深色模式、C17 横屏误触宽布局。

## 二、本轮新发现

### G. Agent 实现（deepAgentStream / aguiAgent / runState）

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| G1 | P2 | 同一 run 内消息交错时，已关闭消息的新增文本被静默吞掉 | `deepAgentStream.ts:75,96,123` | id 序列 `id1,id2,id1`（并行分支可发生）时 id1 二次到达直接丢弃，无日志。允许重开（新 START/END）或至少 warn |
| G2 | P2 | 完整快照与前缀不匹配时整段重发，文本与工具参数处理不一致 | `deepAgentStream.ts:122` vs `:105-111` | 工具参数冲突会 throw，文本却静默 `delta=text` 全量重发 → UI 文本重复。文本复用同样的冲突判定 |
| G3 | P2 | 历史工具参数损坏+有结果 ⇒ 会话永久不可用 | `aguiAgent.ts:55-62` | runStream 开头 JSON.parse throw，每次发送都复现，唯一出路删会话。改为合成 tool 错误结果降级，保留其余上下文 |
| G4 | **P1** | 失败/取消轮输出从**所有**后续轮模型上下文剔除 | `aguiAgent.ts:196-197` | `abandonedIds` 在每次 run 生效（不止 retry）：用户追问"接着上面的思路改"时，模型看不到那条 UI 上可见的半成品。仅在 retry 时应用 abandonedIds；普通追问保留已显示内容。**复核属实且比原文更糟**：`prepareRetry`（`:155`）已按用户消息切片，retry 路径下 abandonedIds 本就冗余——即该过滤只在普通追问时生效，而生效处恰是有害处。可整体移除，无结果调用已有 `messagesForDeepAgent` 降级兜底 |
| G5 | P2 | RUN_ERROR 路径仍不闭合已 START 的 TEXT/TOOL_CALL；RUN_FINISHED 恒 success | `aguiAgent.ts:129-134,222` | batch1 只修了 abort 的 CUSTOM 终态；异常路径悬挂消息对第三方订阅者可见 |
| G6 | P2 | abort 仍无 AG-UI 协议终态（仅 CUSTOM + complete） | `aguiAgent.ts:123-128` | 官方 HttpAgent abort 后发 RUN_ERROR(code=abort)；本地可用但偏离协议，补 2 行即可对齐 |
| G7 | P3（复核降级） | run 末 STATE_SNAPSHOT 基于 run 起点状态回写，非白名单键会被回滚 | `aguiAgent.ts:217-221`、`runtimeStore.ts:73-76` | 改为基于 run 结束时活状态合并；白名单仅作持久化裁剪。**复核**：机制属实（`:217` 确用 `input.state`），但 `runtimeStore.ts:141` 的 onStateSnapshotEvent 会用 mergeState 重新覆盖白名单键+h3Runs，且当前代码在 run 中只写白名单键——是潜在雷而非现行 bug |
| G8 | P3 | 无 id 消息共享 `assistant-<runId>`，多轮折叠为一条；连带完成凭据判定失真 | `deepAgentStream.ts:63`、`aguiAgent.ts:220` | 按"自上一条 tool result 起"递增合成 id |
| G9 | P3 | runState 语义瑕疵：completed 终态把 running 工具标 cancelled；interrupt 分支不可达 | `runState.ts:23-24,42` | 修语义或注明 interrupted 唯一来源是冷启动归一化 |
| G10 | P3 | `clone()` 仍丢 threadId/messages（潜伏雷） | `aguiAgent.ts:164` | 当前无调用点；补 super.clone() 或冻结 |
| G11 | P3 | 图片身份按位置隐式配对 | `imageMessageIdentity.ts:9-22` | 优先 attachmentId 显式匹配，按位仅作回退；补乱序回归 |
| G12 | P3 | 生产代码使用 `agents__unsafe_dev_only` 注册表 | `LocalCopilotKitProvider.tsx:17` | CopilotKit 升级可能静默失效；封装降级路径 |
| G13 | P3 | aguiAgent.test.ts mock 基类绕过 verifyEvents，协议合法性仅 2 个集成场景兜底 | `aguiAgent.test.ts:1-2` | 事件序列类断言迁到真实基类 |

### U. UI 交互（PromptAssistantUi / PromptVersionPanel / 交接链路）

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| U1 | **P1** | 有历史 run 的会话发送失败零反馈 | `PromptAssistantUi.tsx:414,578-584` | `runIssue={runs.length ? null : runIssue}` 把提交期异常/provider 错误整体抑制；run 未创建时也无 failed 行兜底；叠加 C1（草稿已清、气泡悬挂）="按了发送什么都没发生"。失败 runIssue 不受 runs.length 抑制，改为与 failed run 行去重 |
| U2 | P2 | CreateForm：工作流加载失败时 `loadingDraft` 永久卡死 | `CreateForm.tsx:206-207,328,404` | definition 为 null 时 effect 提前 return，"正在读取交接草稿…"永挂、提交永久禁用。loadError 时置 false 并合并呈现。复核属实；注意修复只消除误导文案，提交因 `!definition` 被禁是预期行为，实际用户价值有限 |
| U3 | P2 | h3Composer 逐键落库含 base64 图片的完整 state | `PromptAssistantUi.tsx:297-299`、`runtimeStore.ts:189-195` | 图片与文本分流：图片走 composerSignature，文本只存引用。**复核修正机理**：JSON 序列化落库走 300ms/2s 防抖（`runtimeStore.ts:99-104`），并非每字符一次；但每键 `patchClientState` → `agent.setState` → `useSyncExternalStore` 会触发会话体全树重渲染（`AgentScreen.tsx:281-282`），比写放大更直接 |
| U4 | P2 | 文件路径仍绕过 9 张上限且超限静默丢弃 | `PromptAssistantUi.tsx:277`、`AgentScreen.tsx:304-308` | `onUploadFailed` 未传，use-attachments 内部仅 console.error。补回调+限额。**复核补充**：文件路径同时绕过 50MB 总量与单图 20MB 校验（相册路径有 `assistantImagePicker.ts:69` 检查，文件路径全无） |
| U5 | P2 | 预览 Modal 内打字触发底层抽屉键盘监听，关闭后抽屉滞留高档 | `DraggableSheet.tsx:32-45` | 键盘监听按抽屉自身 input 聚焦过滤，或关闭预览时恢复 snap。**复核补充**：触发面比预览 Modal 更广——版本面板输入框、历史 sheet 内 autoFocus 的重命名 Modal（`PromptAssistantUi.tsx:1249-1251`）均可复现；`keyboardDidHide` 只清 `keyboardTop` 永不复位 snap（`:40`） |
| U6 | P3 | "恢复此版本"可双击产生重复恢复版本 | `PromptVersionPanel.tsx:95` | 加 busy 锁或按 restoredFrom 幂等 |
| U7 | P3 | 时长输入 decimal-pad 与整数校验矛盾 | `PromptVersionPanel.tsx:115,54` | 改 number-pad 或即时格式化 |
| U8 | P3 | "加入草稿"空输入静默关抽屉 | `PromptAssistantUi.tsx:477-482` | 空内容保持打开并提示 |
| U9 | P3 | 交接素材文件零 GC（成功路径不清理 reference-*） | `promptHandoff.ts:115-127`、`promptDraft.ts:103` | consume 时清理未引用文件或定期清扫。**复核约束**：consume 后 reference-\* 是 data URI 来源图片的**唯一本地副本**（任务管线只存 URI 不移入 CAS，`prepareInputs.ts` 仅读取），清理必须挂任务终态之后而非提交即删；且同一 handoff 重复导出会重复物化多份副本（无内容寻址去重，见 H3） |
| U10 | P3 | "草稿已保留"文案无再应用入口，旧稿只能等 1h 过期 | `CreateForm.tsx:222`、`promptDraft.ts:5` | 提供源页"继续上次交接"入口或延长/手动清除 |
| U11 | P3 | 新 UI 债务：工具条文本按钮完全无样式（RN 默认 14pt，复核修正原"约 20pt"说法）；RunTimelineRow 硬编码第三套色板、重试钮无最小高度、a11y 残留 | `PromptAssistantUi.tsx:423-424`、`RunTimelineRow.tsx:19-37` | 并入主题色板、44pt、expanded 态 |
| U12 | P3 | DraggableSheet 拖拽中途抓取视觉跳变（dragStart 取目标值非当前值）；正文区不可拖 | `DraggableSheet.tsx:84-90,116` | grant 时读 position 当前值；内容区加拖拽 |
| U13 | P3 | 复制反馈不自动清除/不一致（助手消息无反馈；版本面板滞留） | `PromptAssistantUi.tsx:627-639`、`PromptVersionPanel.tsx:80,98` | 统一 1.6s 自动复位 |

### T. Timeline 展示

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| T1 | **P1** | 流式期间全量重解析+整列表重渲染（结构未变） | `PromptAssistantUi.tsx:185,533-539,585-654`、`agentPresentation.ts:154`、`runtimeStore.ts:135-139`→`AgentScreen.tsx:215-222` | 每 token 触发 O(消息数×长度) 正则解析、全文签名、内联 renderItem、无行 memo，emit→setThreads 全量排序。缓存 parsePromptResult（按 id+长度）、行 memo、emit 节流/局部更新 |
| T2 | P2 | interrupted 运行耗时被冷启动时间夸大（隔夜重启显示数万秒） | `runtimeStore.ts:72`、`RunTimelineRow.tsx:18` | endedAt 夹到合理上限或 interrupted 不显示耗时 |
| T3 | P2 | pendingRow 去重误匹配连续重复消息（B9 残留） | `PromptAssistantUi.tsx:191-208` | 第二条"继续"的乐观气泡闪没。只与尾部第一条 user 行比对或按提交序号对齐 |
| T4 | P2 | 遗留"标题+围栏"格式完成后正文与卡片双份展示（B5 残留） | `PromptAssistantUi.tsx:620` | 判定放宽为"parse 覆盖消息尾部围栏"或返回 bodyRange 裁剪 |
| T5 | P3 | versions memo 依赖不含 messages/runs，恢复链路脆弱 | `PromptAssistantUi.tsx:133-137` | **复核修正**：原场景不成立——h3Versions 丢失会使 `savedVersions` 变为 `[]`（新引用），memo 必然重算、版本照常重建。真实盲区仅是 messages/runs 变化而两依赖稳定时（如 run.endedAt 更新后 createdAt/图片候选过时），影响轻微；补廉价签名依赖即可 |
| T6 | P2（复核升级） | 双 h3-prompt 围栏导致**整条消息不可见** | `promptParser.ts:43-44`、`PromptAssistantUi.tsx:620` | **复核加重**：不止卡片消失——`PromptAssistantUi.tsx:620` 的贪婪正则 `[\s\S]*` 会跨两个 fence 匹配，正文也被隐藏，用户可见内容全部丢失（只剩工具时间线）。修复：parser 返回 bodyRange 或渲染多卡片，至少保证正文可见 |
| T7 | P3 | TITLE 回退正文遇围栏内行内 `#` 被截断误拒 | `promptParser.ts:7,46-49` | titled 正文优先按完整围栏块提取 |
| T8 | P3 | 工具结果交错后流动画判定失效（messageIds 末位是 tool id） | `PromptAssistantUi.tsx:624`、`runState.ts:29-31` | 动画判定用"最后一个文本消息 id"。**复核**：机制属实，但适配器在工具结果前必先闭合当前文本（`deepAgentStream.ts:64-65`），误判窗口几乎不可观察，属防御性修复 |
| T9 | P3 | args 全链路仍未入 run（TOOL_CALL_ARGS 发出但不持久化）；无单步展开 | `runState.ts:1-4,32-39`、`deepAgentStream.ts:116-118` | B6 半途：数据已发出，未入 state |
| T10 | P3 | 重试行无跳转（retryOf 仅存 id）；a11y 暴露原始 run id；摘要截断口径不一（240 vs 160） | `RunTimelineRow.tsx:22,20,33`、`deepAgentStream.ts:70`、`agentPresentation.ts:83-87` | 点击徽标滚动展开原 run；序号化标签；统一截断 |
| T11 | P3 | 导出按钮按 promptText 反查版本，同文版本可能选中错误项 | `PromptAssistantUi.tsx:410` | 用 result.sourceMessageId 反查 |
| T12 | P2（复核升级） | 版本图片编号 NaN 排序 + 落地校验只认"图片N" | `PromptVersionPanel.tsx:49-51`、`promptHandoff.ts:82-84` | **复核加重**：NaN 时 `invalidBindings` 恒真 → `cannotExport`，**导出被完全阻断**；且面板已把 `Picture N` 归一为"图片N"（`:53`）而 materialize 未同步，两处不一致。修复：排序用 index+1 兜底、归一化逻辑共用 |

### S. Session 管理

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| S1 | **P1** | base64 图片在 state_json 中 N 倍复制 | `promptVersions.ts:47,57,71`、`assistantWorkspace.ts:5-11`、`PromptAssistantUi.tsx:297-299`、`threadStore.ts:104-107` | 同一图至少存于 messages_json + h3Composer 快照 + 每个 h3Versions 条目 images + 恢复副本 + 导出草稿；版本无上限、全部走整行重写，写放大随版本数线性恶化。版本只存 attachmentId 引用+CAS；设版本数上限。**这是 A2/D1 未修地基上新功能造成的最大新增风险** |
| S2 | P2 | 每个流式 delta 触发全局 emit → threads 全量重排重渲染 | `runtimeStore.ts:88-92`、`AgentScreen.tsx:215-222` | 防抖只管落盘不管 emit。emit 按 flush 窗口节流或按 threadId 局部更新 |
| S3 | P2 | 草稿保存同步写（db.runSync）且写入端无体积校验 | `promptDraft.ts:79-85`、`promptHandoff.ts:99,111` | 50MB 上限只在消费端。save 前校验总字节，改异步写 |
| S4 | P2 | 历史列表陈旧"生成中"：interrupted 归一化只在 ensure()（点开会话）时发生 | `runtimeStore.ts:72`、`assistantWorkspace.ts:28-34` | list 载入后展示层归一化或投影列 |
| S5 | P2 | h3Runs/h3Versions 只增不减，随整行全量重写 | `runtimeStore.ts:145-148` | 上限裁剪（如最近 50）或拆独立表 |
| S6 | P3 | run 记录创建前的崩溃窗口：无 run 覆盖的尾部用户消息重启后无"重新生成"入口 | `runtimeStore.ts:137-138,142-151` | 加载时为尾部无 run 用户消息合成 interrupted run |
| S7 | P3 | `updateMetadata` 在 pendingSave 为空时不武装保存 | `runtimeStore.ts:186` | `pendingSave ??= snapshot; schedule()`。**复核**：唯一调用方 `renameThread`（`:218`）已直写 `threadStore.rename`，今日无实际后果，卫生级修复 |
| S8 | P3 | 辅助 Map 永不清理（saveTails、appliedRenames） | `runtimeStore.ts:43,48,222-227` | evictThread 同步清理 |
| S9 | P3 | dispose 后 emit 直接 return，最终保存失败仍无用户可见信号 | `runtimeStore.ts:89,124` | 至少记录诊断 |

### H. 复核补充发现（2026-09-07）

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| H1 | P2 | 虚拟 FS 跨 run 清零，与创作助手工作流承诺相悖 | `h3Agent.ts:38`、`aguiAgent.ts:198`、`assistantWorkspace.ts:36` | deepagents 无 checkpointer（dist 中 checkpointer 仅现于 langsmith chunk），`configurable.thread_id` 不产生持久化，`files` 每次 run 由输入重播种——`write_file`"整理创作方案"的产物在下一轮追问时全部丢失，而 `toolActivity` 文案仍以持续产物口吻呈现。建议随 thread 持久化 files 状态，或与 S1 的 CAS 改造统一设计 |
| H2 | P3 | composer 每键 `agent.setState` 触发会话体全树重渲染 | `PromptAssistantUi.tsx:297-299`、`AgentScreen.tsx:281-282` | 比 U3 的写放大更直接的性能伤害，应并入 T1/S2 的 emit 节流方案一并处理 |
| H3 | P3 | 同一 handoff 重复导出重复物化 reference-* 副本（无内容寻址去重） | `promptHandoff.ts:115-127` | 文件名用 `sha256` 命名即可复用（`media/cas.ts` 现成） |
| H4 | P3 | 发送路径双重非空断言，ready 附件缺 displayName 时抛错 | `PromptAssistantUi.tsx:241` | `find(... )!.displayName!` 改可选链+回退名，属健壮性问题 |

## 三、对标业界优秀 agent 应用（更新版）

| 维度 | 对标依据 | 当前状态 | 优先级 |
| --- | --- | --- | --- |
| 流式协议正确性 | AG-UI/LangGraph 事件语义 | F1/F2/F3/F9/A5 已达标；剩 G1/G2（交错与冲突边界）、G5/G6（异常路径终态） | P2 |
| 重试/Attempt 模型 | ChatGPT/Cline attempt 级、保留部分产物 | **已达标且部分更强**：半成品保留、retryOf 链、原素材绑定 | — |
| 产物版本管理 | Claude Artifacts/Canvas | 版本+diff+恢复+来源绑定+双重校验，超出同类移动端平均水准；缺引用化存储（S1）与 word-level diff | P1→P2 |
| 上下文工程 | Claude Code compaction、Cline 窗口 | 全量重放未变（A1）；G4 使失败轮输出对模型不可见，加剧上下文失真 | P1 |
| 创作状态跨轮持久 | Claude Projects/Artifacts 会话内连续性、LangGraph checkpointer 生态 | 虚拟 FS 跨 run 清零（H1），`write_file` 产物不随会话延续 | P2 |
| 多模态存储 | 对象存储/引用化（CopilotKit 官方、ChatGPT 资产库） | base64 N 倍复制（S1），库内 CAS 空置 | **P1（最高）** |
| 取消/终态协议 | AG-UI 终态契约、HttpAgent abort→RUN_ERROR | 仅 CUSTOM；对齐成本低 | P2 |
| HITL/工具超时 | Claude Code 权限、LangGraph interrupt 生态（client 已内建 resume 数组） | 未接；runState interrupt 分支是死代码 | P2 |
| 渲染性能 | 消息级订阅+memo+节流（assistant-ui MessagePrimitive） | 结构未变（T1/S2），长会话必卡 | P1 |
| 失败反馈链 | 失败气泡标红+重发、草稿保留 | U1+C1 组合缺陷是当前最差单点体验 | P1 |
| 系统适配（深色/字体/触觉/44pt/键盘） | 移动端标配 | C2/C5-C9/C14/C17 基本未动 | P2 |
| 存储模型 | 消息级 append+索引+分页 | D1/建议6 未动，且新状态全堆进同一 JSON 列（S5） | P1→P2 |
| 空态/引导 | 能力卡、动态示例 | 9 个内置技能仍未利用（B12） | P3 |

## 四、推荐落地顺序

### 第一批：新风险止血（P1）
1. **S1 附件引用化止血**：版本快照只存 attachmentId 引用（不复制 data URI），设版本数上限；h3Composer 持久化剥离 base64（U3 同修）。可复用 `promptHandoff.ts` materialize 的 data URI→file 模式，代码库已有先例。
2. **U1+C1 失败反馈链**：runIssue 不受 runs.length 抑制、与 failed run 行去重；发送失败回填草稿、pendingRow 加失败态。
3. **G4 abandonedIds 移除**（复核后建议从"收窄"改为"整体移除"）：retry 已按用户消息切片，过滤器仅在普通追问处生效且有害；无结果调用已有降级兜底。
4. **T1/S2 渲染放大**：parsePromptResult 按 id+长度缓存、行组件 memo、emit 按 flush 窗口节流（含 H2 的 setState 重渲染）。
5. **U2 CreateForm 草稿卡死** + S4 历史列表陈旧"生成中"（均为小改；U2 修复仅消除误导文案，价值有限，顺手做）。
6. **T6 双围栏整条消息不可见**（复核升级 P2，建议并入第一批）：放宽 body 隐藏判定 + parser 返回 bodyRange。

### 第二批：正确性边界与协议（P2）
G1/G2/G3（交错、冲突、损坏降级）、G5/G6（异常路径事件闭合与 abort 终态）、G7（STATE_SNAPSHOT 回写基线）、T2/T3/T4/T8、S3/S5/S6、A3/A4 收尾、A6 工具超时与 HITL 接入（LangGraph interrupt + CopilotKit resume 生态现成）、C2/C6/C7/C8/C9 系统适配、C4/C5 附件限额与权限。

### 第三批：架构与打磨（P2→P3）
D1 消息级存储拆分（runs/versions 独立表）、A1 上下文窗口/摘要压缩、A2 图片 CAS 外置、H1 虚拟 FS 跨轮持久化（与 A2 的 CAS 统一设计）、D3-D6（runtime LRU、GC、UUID、FTS）、版本 diff 增强、B12 技能驱动空态、A12 技能包瘦身与渐进披露、D10 会话级导出。

## 五、前端展示效果评审（2026-09-07 增补）

两路并行评审（主聊天界面 / 面板·抽屉·脚手架），只读静态分析，聚焦视觉层次、主题一致性、排版、动效反馈、状态呈现与 a11y。与 U/C 组重叠项不重复收录。

### 主聊天界面（M 组，`PromptAssistantUi.tsx` 为主）

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| M1 | **P1** | 触控目标普遍 < 44pt | `PromptAssistantUi.tsx:1641-1651,1227-1232,869,1598-1605,1615-1622,1391-1398` | 附件移除仅 20×20（负偏移悬挂在外）、历史"•••"与删除为裸 Text、"展开全文"裸 Pressable、headerButton 38×38、add/send 36×36、runIssueAction minHeight 32。统一 hitSlop 或最小 44×44 命中区 |
| M2 | P2 | 硬编码色约 30 处/18 种绕过主题 | `PromptAssistantUi.tsx:680,682,1127,1300,1305,1356-1399,1447,1505-1506,1602,1623-1655,1708,1723-1770,1805,1839` | `#ECEBE6` ×10、`#F0EFEA` ×3+、`#FFFFFF` ×5；`#68856D`/`#B35E53`（1505-1506）直接照抄 LIGHT_PROMPT_COLORS.success/danger 值却不引用 token；3 种 rgba 背板并存。theme.ts 补 fill/scrim/warning/info 派生 token 后收敛 |
| M3 | P2 | 明暗割裂 + 深色模式零准备 | `theme.ts:1-26`、`PromptAssistantUi.tsx:1308` | 本界面整体 LIGHT_PROMPT_COLORS 亮色，而 tasks/settings/gallery/video 各 Tab 用暗色 COLORS，Tab 切换明暗跳变；全仓无 `useColorScheme`，LIGHT_PROMPT_COLORS 无暗色变体、无切换机制——两套配色并存但互不衔接 |
| M4 | P2 | 全部 Pressable 无按压反馈 | `PromptAssistantUi.tsx:367,388,594,758,786,869,1219` 等 | 全文件无 `({pressed})=>style`、无 android_ripple、无 activeOpacity；chips、复制、发送键应有按压缩放/变暗 |
| M5 | P2 | 未读/生成中徽标扫视不可见 | `PromptAssistantUi.tsx:1225,1718`、`assistantWorkspace.ts:33` | "已完成 · 未读"以 10px 灰色纯文本混入 meta 行，无红点/徽标/着色；状态与消息数混排同级弱化。加 accent 色圆点或按语义着色加粗 |
| M6 | P2 | markdown 样式未覆盖链接/列表/引用 | `PromptAssistantUi.tsx:1288-1306` | markdownStyles 仅配 paragraph/h1-h3/code；链接回退系统蓝破坏米色调性，blockquote/list 无缩进配色；codeBlock 背景 `#F0EFEA` 应入 token |
| M7 | P2 | a11y role 缺失约 18 处 + label 泄露内部 id | `PromptAssistantUi.tsx:367,388,594,786,869,981,1219,1227` 等 | 多数 Pressable 缺 `accessibilityRole="button"`；历史会话行（1219）连 label 都没有；附件 label 泄露原始 attachment id（594），应改 displayName |
| M8 | P3 | 字号 11 档无规范 | `PromptAssistantUi.tsx:1640,1328,1508,1358,1478,691,1439,1536,1335,1797,1419` | 9-21px 共 11 档；9px"上传中"与 10px meta 过小难读。收敛为 11/13/15/17/21 五档 |
| M9 | P3 | RunningIndicator 静态无动效 | `PromptAssistantUi.tsx:773-780,1400-1406` | 8px 圆点无呼吸/脉冲动画，与"生成中"氛围不符 |
| M10 | P3 | 两处图片预览 Modal 表现不一致 | `PromptAssistantUi.tsx:679 vs 1009-1026` | 时间线预览有 fade+关闭按钮；附件条预览无动画、无关闭控件（仅点背景）、背板无 a11y label |
| M11 | P3 | 缩略图三套规格 | `PromptAssistantUi.tsx:1285,1625-1638` | 发送图 54×54/r11、composer 55×55/r12、mention 52×52/r12，三套并存 |
| M12 | P3 | @提及 chip 与气泡几乎同色 | `PromptAssistantUi.tsx:1447,1453` | 气泡 `#ECEBE6` vs chip `#E9E7E1` 色差极小，"可点预览"affordance 不可见；加边框或下划线 |
| M13 | P3 | 长英文串/URL 无换行保障 | `PromptAssistantUi.tsx:866-868,1540-1545` | promptText 无 breakStrategy/word-break，含长 token 的 prompt 展开后可能横向溢出卡片 |

### 面板 / 抽屉 / 脚手架（P 组）

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| P1 | P2 | 运行状态无颜色/图标语义 | `RunTimelineRow.tsx:21-22` | completed/failed/cancelled/interrupted 全部同色默认文本，仅 running 有 spinner，一眼无法区分成败。失败/中断用 danger、完成用 success，或加 ✓/×/⊘ 前缀图标 |
| P2 | P2 | 重试按钮是纯文本链接 | `RunTimelineRow.tsx:33-37` | 无边框/背景/按压反馈，disabled `#888` 与正文几乎无差别。改次要按钮样式（1px 边框、minHeight 44、busy 时 spinner） |
| P3 | P2 | 快捷入口裸 Text 不像可点 | `PromptAssistantUi.tsx:422-425` | "补充创作信息 / Prompt 版本 · N"无颜色/图标/边框。加 chevron + ink 色文字或 chip 化 |
| P4 | P2 | 配置错误屏观感断裂且无出路 | `AgentScreen.tsx:74-88,337-368` | 错误屏深色 `#020617` vs 就绪后 `#FAFAF7`，修复配置前后跳变；`configError` 原始串可能直接透出英文；且无"去设置"CTA，用户需自寻出路。改 LIGHT_PROMPT_COLORS + 友好映射 + CTA 按钮 |
| P5 | P2 | 抽屉无入场过渡、浮起感弱 | `DraggableSheet.tsx:107,114,137-139` | `animationType="none"` 遮罩瞬显；无阴影/描边，仅 30% 平涂遮罩分层。遮罩淡入 + elevation/shadow 或 1px 顶边高光 |
| P6 | P3 | 展开/收起用文本字形 `⌄`/`›`，无旋转动画且两处各写一份 | `RunTimelineRow.tsx:22`、`PromptAssistantUi.tsx:791` | 统一 AppIcon expand_more/less + 旋转动画 |
| P7 | P3 | 版本激活态太弱 | `PromptVersionPanel.tsx:87,136-137` | 仅边框 `#FFFFFF`→ink、底色 surface→background，扫视难辨认当前版本。用 ink 填充反白文字或"当前"徽标 |
| P8 | P3 | "恢复此版本"不突出且无成功反馈 | `PromptVersionPanel.tsx:95` | 与"复制版本 Prompt"同等次要样式。用强调描边/主色变体 + 成功 toast/高亮 |
| P9 | P3 | 表单无聚焦态；分辨率双路径易混 | `PromptVersionPanel.tsx:112-115,155` | TextInput 无 focus 边框高亮；分辨率既可自由输入又提供 chips。focused 变色 + 纯 chips 选择器 |
| P10 | P3 | 抽屉抓手对比度低、hitArea 40pt、无档位指示 | `DraggableSheet.tsx:116,140-141` | 42×4 `#D9D7D0` 对 `#FAF9F5` 对比极低，加深至 `#B8B6AE` 左右；hitArea ≥44；可选拖动时档位提示 |
| P11 | P3 | 动态字体零适配 | 全仓无 `allowFontScaling`/`maxFontSizeMultiplier` | 9-11px 小字在大字号下截断（loadingText 9、eyebrow 10、historyMeta 10）。设 multiplier 上限 + 去固定高度约束 |
| P12 | P3 | 全部交互无触觉反馈 | 全仓无 expo-haptics 引用 | 版本选择、恢复、导出、发送、抽屉吸附等确认类操作加 light impact |

### 展示层做得好的

- 键盘避让：`getKeyboardAvoidancePadding`（`PromptAssistantUi.tsx:496-504`）对 Android adjustResize/边到边设备的补偿考虑周全且有注释
- 消息区分清晰：用户右对齐气泡（尾角不对称圆角 1446）+ 助手头像行（1458-1466）；PromptResultCard 白底描边 + eyebrow 标题，视觉权重恰当
- 空会话状态完整：图标徽章 + 主/副标题 + 可点建议 chips（736-771），非白屏非裸文案
- 错误横幅配色体系完整、`accessibilityRole="alert"`、重试有 busy 态文案（1373-1399）
- DraggableSheet 把手 a11y 样板级：adjustable 角色 + increment/decrement 动作 + 档位播报，关闭钮 44×44（`DraggableSheet.tsx:116-123,145`）
- 版本胶囊完整 a11y：role + `accessibilityState.selected` + minHeight 44（`PromptVersionPanel.tsx:87,136`）；diff 视图全行底色 + `−`/`+` 前缀 + 图例，可读性好（92,147-148）
- 跟随滚动 + "回到最新"浮钮体验成熟（540-570,656-678）；发送键 send↔close 图标切换语义清楚（1124）

### 主题系统小结

`theme.ts` 两套静态配色（暗色 COLORS / 亮色 LIGHT_PROMPT_COLORS）并存但无切换、无暗色变体，属"半套深色模式"。建议：明确锁定浅色（或补 useColorScheme）→ 抽出 fill/scrim/warning/info 派生 token → 按 M2 清单收敛约 40 处硬编码色 → 横切落实三条规范：44pt 触控（M1/P2/P10）、按压反馈（M4）、语义色状态（P1/M5）。

## 六、验证记录

- `npm test`（mobile/）：131 套件通过、1 跳过；817 项通过、2 跳过（与批次文档一致；错误用例输出预期 console.error）。
- `npx tsc --noEmit`：通过（exit 0）。
- 本轮四路审查均为只读静态分析 + 逐项复核，未修改代码、未调用真实 LLM、未运行 Android 实机；模拟器级验收以批次文档记录为准。
- 未验证：真实网络 LLM 端到端、长会话/多图实测帧率与内存（T1/S1 为代码层结构判断）、Android 杀进程恢复实机。
- **2026-09-07 复核**：G 组逐行人工核验，U/T/S 组三路并行核验（只读）；47 项新发现 → 42 属实 / 5 修正细节（G7、U3、U11、T5、T8）/ 0 推翻；已修复项抽查 10 项全部属实。deepagents dist 确认无默认 checkpointer（仅 langsmith chunk 出现 checkpointer 字样），作为 H1 依据。前端展示评审两路并行（主界面 / 面板·抽屉·脚手架），只读静态分析，未运行实机。
