# Prompt 助手第二轮审查：Agent、交互、Timeline 与 Session

日期：2026-09-06。代码基线：`b8014025`（与第一轮审查相同，期间无代码变更）。应用版本 1.4.12。

## 结论与范围

本轮在第一轮审查（`2026-09-06-prompt-assistant-agent-ux-review.md`）基础上做独立复核与增量审查。四路并行覆盖：agent 实现（协议/技能/模型）、UI 交互、timeline 展示、session 管理。全部只读，未修改代码。

结论：

1. **第一轮全部发现（F1–F9）复核成立**，行号见下； timeline 建议 1–8 同样全部成立。
2. 新增约 40 项问题，其中最重要的三类系统性风险是第一轮未覆盖的：
   - **上下文工程缺位**：历史全量重放 + 图片 base64 每轮重发，长会话 token/费用/内存线性爆炸（A1/A2）。
   - **事件生命周期不闭合**：错误/中断时无终态事件，恢复后死会话永挂"进行中"（A3/A4/B1）。
   - **消息级存储缺位**：单行 JSON 整行覆盖式持久化，带来写放大、双写者竞态、假 running、无 GC 等一系列问题（S 系列）。
3. 已达标、应保留的能力：滚动跟随守卫（48pt 阈值 + 回到最新）、工具折叠时间线、附件去重与原子提及 token、93 项测试覆盖、全局迁移框架与 CAS blob 基座（agent 附件尚未复用）。

## 一、既有发现复核（全部成立）

| 编号 | 结论 | 当前位置 | 复核要点 |
| --- | --- | --- | --- |
| F1 增量当累计丢字 | 成立 | `aguiAgent.ts:176-178`；`h3Agent.ts:112-115` | `previous.set(id, text)` 只存最后一片从不累加；`startsWith` 截前缀 |
| F2 工具参数分块未聚合 | 成立 | `aguiAgent.ts:21-24,156-171`；`h3Agent.ts:75-87` | `callsOf` 不读 `tool_call_chunks`；首片即 `TOOL_CALL_END`；备用路径把每个分片当独立调用 |
| F3 回传丢 assistant 工具调用 | 成立 | `aguiAgent.ts:52` | 非 user 消息原样透传，camelCase `toolCalls` 不被 LangChain 识别；结果侧却转了 `tool_call_id`，形成孤儿 tool 消息 |
| F4 重命名覆盖后台结果 | 成立 | `AgentScreen.tsx:183-198`、`threadStore.ts:101-112`、`runtimeStore.ts:85-97` | rename 绕过 runtime 写队列直写整行；重命名后不调 `updateMetadata`，旧标题会被下次 flush 写回（标题回退确定复现） |
| F5 删除最后会话死锁 | 成立 | `AgentScreen.tsx:174-176,209,306-326` | 初始化 effect 不重跑，StatusView 无任何按钮，切 Tab 也不恢复 |
| F6 提及发送后重新编号 | 成立 | `agentPresentation.ts:71-73`、`PromptAssistantUi.tsx:1026-1029` | composer 用 ref 计数器编号，持久化渲染按数组位置覆盖 displayName，删图后必然错配 |
| F7 错误/停止无持久化 | 成立 | `AgentScreen.tsx:255`（key=threadId 卸载即失） | 无 Run/Attempt 表；schema `agent_threads` 无 run 级结构 |
| F8 防抖无上限 | 成立（加重） | `runtimeStore.ts:95-107` | flush 先取走 `pendingSave` 再 enqueue，失败后该快照**直接丢弃**（不止是"仅 notice"）；dispose flush 失败被 `.catch(() => undefined)` 吞掉 |
| F9 代码块误判为 FINAL | 成立 | `promptParser.ts:8-10` | FENCE 语言标签可选组命中任意裸代码块；TITLE 的 `$` 使流式中未写完标题即出卡；`confidence` 从未在 UI 展示，卡片恒写"可直接用于生成" |

## 二、新发现

### A. Agent 实现（协议 / 上下文 / 模型）

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| A1 | P1 | 无上下文窗口管理，历史全量重放 | `aguiAgent.ts:135`、`h3Agent.ts:28-33` | 每轮把全部消息（含历史工具结果、技能文件内容）整包传给 DeepAgents；未挂 checkpointer，`thread_id` 形同虚设。加消息窗口裁剪/摘要压缩（LangGraph summarization middleware 或手动 compaction），工具结果按需截断 |
| A2 | P1 | 图片 base64 持久化并每轮重发 | `imageAttachmentUpload.ts:6-11`、`aguiAgent.ts:63-76`、`threadStore.ts:104-107` | 20MB 原图 base64（≈27MB）进消息 JSON 入 SQLite，且每次 run 把所有历史用户消息的图片重新内联发给 LLM。应持久化文件引用（复用已有 CAS `media/casRepository.ts`），仅当前轮内联 |
| A3 | P2 | RUN_ERROR 时生命周期不闭合 | `aguiAgent.ts:94-103,182-184` | catch 只发 RUN_ERROR；已 START 的 TEXT/TOOL_CALL 永无 END，UI 工具卡卡"运行中"；RUN_FINISHED 硬编码 success。出错时补发 END + error 终态 |
| A4 | P2 | abort 后无协议终态 | `aguiAgent.ts:143,182` | 中断直接 return，仅靠 Observable complete；AG-UI 要求 run 有终态事件，重连/重放会出现"幽灵运行中"。abort 发 `RUN_ERROR(aborted)` 或 error outcome |
| A5 | P2 | TEXT_MESSAGE_END 全部推迟到 run 末尾 | `aguiAgent.ts:182-183` | 多段输出同时处于 streaming，markdown 无法按消息粒度 finalize；新 messageId 出现时应闭合前一条 |
| A6 | P2 | 无工具超时、无 HITL、失败靠正则猜 | `h3Agent.ts:28-33`、`agentPresentation.ts:99` | 工具静默执行无 interrupt；应注入超时与结构化 `isError` 结果，UI 状态来自事件而非 `/error|fail/` 关键词 |
| A7 | P2 | 备用流 h3Agent 事件语义残缺 | `h3Agent.ts:55-59,102-115` | ToolMessage 被过滤无 tool-result 事件；`tool-start/end` 背靠背；非工具轮过渡叙述被标 `final` 会被 F9 解析器抢先当最终 Prompt |
| A8 | P2 | 配置校验 render 期同步抛出 → 白屏 | `AgentScreen.tsx:256-259` → `h3Agent.ts:27`、`modelAdapter.ts:15-18` | `useMemo` 内 `ensure()` 链路 throw 无 ErrorBoundary；`applyAgentSettings` 恒返回 `error:null`，校验被推迟到最危险时机。ensure 前预检并走 UI 错误态 |
| A9 | P2 | 全局 fetch shim + 总时长超时 | `copilotKitStreamingFetch.ts:14-47,101` | 模块级单例 timeout 影响所有在飞请求；XHR timeout 是含流式读取的总时长而非空闲超时，长生成被腰斩。改 idle-timeout、参数随请求传 |
| A10 | P2 | 重试不中止在飞 run；abort 单槽 | `LocalCopilotKitProvider.tsx:24-39`、`aguiAgent.ts:92-104` | rerun 直接 runAgent，旧 run 靠 teardown 间接终止；`this.abortController` 单槽被第二个 run 覆盖。run 入口先 abort 旧 controller |
| A11 | P3 | `crypto.randomUUID` Hermes 兼容风险 | `h3Agent.ts:86` | polyfill 仅含 `getRandomValues`，chunk 缺 id 时抛 ReferenceError。改用 expo-crypto |
| A12 | P3 | 430KB 技能包全量内联 + 每 run 全量注入 | `generated/h3Skills.ts`、`aguiAgent.ts:135`、`skillBundle.ts:24-42` | 9 技能含双语构建期全量 import；8/9 声明 not portable。仅打包 `h3-prompt-writing` 或按 manifest 过滤；CN 版按语言二选一 |
| A13 | P3 | frontmatter 用 JSON.parse 解析 YAML | `skillBundle.ts:13-22` | 失败静默放弃归一化；fallback 到已是依赖的 js-yaml |
| A14 | P3 | 消息转换零类型防护 | `aguiAgent.ts:8-15,76` | 全 `Record<string,any>`，camelCase 字段混入 LangChain 输入；两处 `as never` 绕类型 |
| A15 | P3 | 重试永久截断失败轮次 | `LocalCopilotKitProvider.tsx:35-37` | `slice(0, lastUserIndex+1)` 不可逆删除失败轮（含半成品）且随之持久化；应软删或提供撤销，区分"重新生成"与"断点续跑"语义 |

### B. Timeline 展示

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| B1 | P1 | 中断/崩溃后半截工具永挂"进行中" | `agentPresentation.ts:129-133,156`、`aguiAgent.ts:143`、`runtimeStore.ts:85-97` | 有 toolCalls 无 result 的消息已按防抖落库；归纳只看"有无 result"→ 重载后死会话显示"正在分析…"。加载时归一化孤儿 toolCall（标 interrupted/failed），或持久化 run 边界 |
| B2 | P1 | 单条 delta 引发整列表 + 整屏重渲染 | `PromptAssistantUi.tsx:150-153,448-460,500`、`AgentScreen.tsx:199-205` | 每 render 全量 normalize（每条消息 3 个正则）+ 全文 signature join 作为 effect 依赖；renderItem 内联、行无 memo；emit → setThreads 又放大到侧栏。行组件 memo + 按 messageId 细粒度订阅 + normalize 按 id 缓存 |
| B3 | P1 | 无 id 消息每次渲染随机 key → remount | `agentPresentation.ts:112`、`PromptAssistantUi.tsx:469` | key 变导致 Markdown 重挂载、展开态丢失、图片重载。以 index 兜底并保证 normalize 幂等 |
| B4 | P2 | 产物卡识别抖动 | `promptParser.ts:8`、`PromptAssistantUi.tsx:748-750` | 未完成标题即出卡且随 delta 增长；FENCE 闭合瞬间卡片突现。流式中延迟到消息 END 再解析，或"识别中→FINAL"两态 |
| B5 | P2 | 正文与产物卡双份长文本 | `PromptAssistantUi.tsx:534-562` | 全文 markdown + 卡片重复渲染同一 prompt。对含 FINAL 段的正文裁剪重复段（Claude artifacts 做法：产物出正文） |
| B6 | P2 | 工具展示信息密度低 | `agentPresentation.ts:110,136,79`、`PromptAssistantUi.tsx:679-720` | `TOOL_CALL_ARGS` 发出但 UI 从不消费（args 丢弃）；摘要 160 字符裸 JSON；无耗时；仅全 timeline 一个总开关无单步展开；展开态随虚拟化丢失 |
| B7 | P2 | 运行中错误被 RunningIndicator 掩盖 | `PromptAssistantUi.tsx:493-499` | 条件顺序 running 优先于 runIssue；错误固定在 footer，回看历史时不可见；`copilotkit.runAgent` 异常只 console.error 不产生 runIssue |
| B8 | P2 | 无 id 消息合并 + 差分失败内容重复 | `aguiAgent.ts:146,177-179` | 同 run 多条消息共享 `assistant-${runId}` 累成一条；文本非前缀关系时全文当 delta 重发。差分失败先 END 再新 START |
| B9 | P3 | pendingRow 去重误匹配 | `PromptAssistantUi.tsx:155-177` | 按"文本+附件数"匹配任意历史行，连发两条相同消息第二条不显示；`Date.now()` 毫秒碰撞。记录提交时消息数精确匹配 |
| B10 | P3 | 每 delta 动画 scrollToEnd | `PromptAssistantUi.tsx:455-484` | 非 inverted 列表 + 每 delta 重启动画滚动是流式抖动来源。`maintainVisibleContentPosition` 或 inverted + 节流 |
| B11 | P3 | 附件 key 含 index 冲突 | `PromptAssistantUi.tsx:508-510` | 相同 uri 的两张图 key 冲突 |
| B12 | P3 | 空态引导单薄 | `PromptAssistantUi.tsx:631,653-664` | 仅 2 条硬编码建议；本地 9 个技能 meta 未用作动态 starter |

### C. UI 交互

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| C1 | P1 | 发送失败草稿不回填，乐观气泡悬挂 | `PromptAssistantUi.tsx:197-221` | `setDraft('')` 在 await submit 之前；失败时文本消失，pendingRow 匹配不到持久化行则永挂且无失败态。失败回填 draft 或给 pendingRow 失败态 |
| C2 | P1 | 触控目标普遍 <44pt | `PromptAssistantUi.tsx:1518-1528`（20×20 删附件）、`:1475-1499`（36×36）、`:1195-1202`（38×38）、`:1104-1109`（历史行内嵌套无隔离） | 历史行内"•••"与删除按钮嵌套在行级 Pressable 内，误触删除风险。hitSlop 补足；行内操作改长按菜单 |
| C3 | P2 | 错误 notice 永不清除、双通道重复 | `AgentScreen.tsx:264`、`PromptAssistantUi.tsx:356-361` | setNotice 无清除路径无关闭按钮；同一故障可能同时出现在横幅与 runIssue。收敛到单通道 + 超时/关闭 |
| C4 | P2 | 文件选择绕过 20MB/9 张上限 | `PromptAssistantUi.tsx:239` | 直接 `openPicker()` 不经 `pickAssistantImages` 校验与配额；base64 全量入内存无压缩。统一走配额校验 + expo-image-manipulator 压缩 |
| C5 | P2 | 相册权限无主动请求/拒绝引导 | `native/imagePicker.ts:7-19`、`PromptAssistantUi.tsx:232-234` | 全仓无 `requestMediaLibraryPermissionsAsync`；被拒仅 Alert 无"去设置"。首次请求 + `Linking.openSettings()` |
| C6 | P2 | 横屏键盘补偿失准 | `PromptAssistantUi.tsx:123,419-427`、`app.json:8` | baselineHeight 仅 mount 捕获，旋转后不更新。监听尺寸重置或锁竖屏 |
| C7 | P2 | timeline 不随拖动收起键盘 | `PromptAssistantUi.tsx:466-486` | 无 keyboardDismissMode。iOS interactive / Android on-drag |
| C8 | P2 | 全程无触觉反馈 | 全仓 grep haptics/vibration 零命中 | 发送/复制/停止/删除均无 haptic。expo-haptics 覆盖关键节点 |
| C9 | P2 | 动态字体零适配 | 全仓无 allowFontScaling/maxFontSizeMultiplier | 大字体下 composer maxHeight 120 截断、历史行截断。关键区域设 multiplier，composer 高度随字体缩放 |
| C10 | P3 | 运行中输入框锁死 | `PromptAssistantUi.tsx:958` | `editable={!isRunning}` 且 submitting 覆盖整个 run；仅禁发送按钮保留输入（ChatGPT/Claude 均可边生成边输入） |
| C11 | P3 | 渲染期变异 ref | `PromptAssistantUi.tsx:243-256` | IIFE 读写 attachmentNames/nextAttachmentNumber，StrictMode 下可能重复递增 |
| C12 | P3 | 新建会话无防双击 | `AgentScreen.tsx:150-166` | 两个入口快速双击创建两个空会话 |
| C13 | P3 | 配置错误 StatusView 死端 | `AgentScreen.tsx:306-326` | 无"前往设置"按钮（与 F5 同类模式） |
| C14 | P3 | 无深色模式；加载态与主界面主题断裂 | `AgentScreen.tsx:334`、`theme.ts:16-26` | StatusView 深色 → 就绪瞬间闪切浅色硬编码 |
| C15 | P3 | a11y 缺口 | `PromptAssistantUi.tsx:888-905,683-690` | 预览 Modal 无标签无关闭按钮；ToolTimeline 展开控件缺 role/state |
| C16 | P3 | 引用面板选图后不回流 | `PromptAssistantUi.tsx:410-413` | onAdd 先关 sheet 再选图，选完不重开，需手动再点 @ |
| C17 | P3 | 手机横屏误触宽布局 | `PromptAssistantUi.tsx:124,1217-1222` | width≥720 即 264px 侧栏，横屏手机对话区被挤压。加高度条件 |
| C18 | P3 | 搜索与计数无节流 | `PromptAssistantUi.tsx:1060-1069,1102` | 每击键全量扫描全部会话消息 + 每行全量 normalize |
| C19 | P3 | 复制反馈不一致、无错误处理 | `PromptAssistantUi.tsx:541-553,729-754` | 助手复制无成功反馈；两处 void Clipboard 无 catch |
| C20 | P3 | 导出无 busy 态 | `PromptAssistantUi.tsx:766-774` | 双击可两次导航 |

### D. Session 管理

| # | 严重度 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- | --- |
| D1 | P1 | 单行 JSON 整行覆盖式持久化 | `threadStore.ts:104-107`、`schema.ts:20` | 消息/状态单 JSON 列，INSERT OR REPLACE 整行；无消息级存储、无索引（对比其他表均有）。每次 flush 全量序列化写放大；是 F4/B1/C18 的共同根源。改消息级 append 表 + 元数据投影 |
| D2 | P1 | 附件未复用 CAS、体积无上限 | `imageAttachmentUpload.ts:6-11`、`schema.ts:36-38` | 库内已有 SHA-256 CAS（artifact_blobs）但 agent 附件直塞消息 JSON；单行可达数十 MB 且流式期间每 300ms 重写 |
| D3 | P2 | runtime 注册表无上限累积 | `runtimeStore.ts:40,152`、`AgentScreen.tsx:212` | 浏览过的每个线程常驻 runtime（agent + 全部消息 + CopilotKit core），切会话不 evict；内存无界增长，且形成多 runtime 并发写库。LRU 上限 + 空闲 dispose |
| D4 | P2 | 空会话孤儿、零 GC | `AgentScreen.tsx:125-166`、对比 `promptDraft.ts:43-49` | 点击即落库（不发消息也存），agent_threads 是全库唯一无清理策略的业务表。清理"空消息且超 N 天" |
| D5 | P2 | threadId 时间戳+random，PK 冲突静默吞数据 | `AgentScreen.tsx:127,153`、`threadStore.ts:104` | 碰撞即整行覆盖无报错；`Date.now()` 决定排序/分组，改时钟跳变；重命名把会话顶到最前（副作用）。改 UUID；INSERT ON CONFLICT DO UPDATE |
| D6 | P2 | 搜索 O(线程×消息) 内存扫描 | `agentPresentation.ts:190-202` | 无投影/FTS/分词；数据量大后每击键全量扫描。防抖 + 预计算摘要列，规模化再上 FTS5（中文需 2-gram） |
| D7 | P3 | dispose flush 失败被吞 | `runtimeStore.ts:128` | `.catch(() => undefined)`，尾部保存失败用户无感知 |
| D8 | P3 | `clone()` 丢失 threadId/messages（潜伏雷） | `aguiAgent.ts:114` | 覆写丢掉基类拷贝的字段；当前无调用点，但上游一旦 clone 将产生随机新 threadId 的空 agent 且不入库 |
| D9 | P3 | `updateMetadata` 不落盘不 emit | `runtimeStore.ts:136-143` | 仅改内存，flush 前崩溃标题回退（F4 同根） |
| D10 | P3 | 导出单一 | `AgentScreen.tsx:223-229`、`promptDraft.ts:4` | 仅 prompt 文本 + `attachmentIds: []`，草稿 1 小时过期；无会话级导出/导入 |

## 三、对标业界优秀 agent 应用

| 维度 | 对标依据 | 当前差距 | 优先级 |
| --- | --- | --- | --- |
| 流式协议正确性 | AG-UI 事件语义（chunk vs snapshot、参数 END、run 终态）；LangGraph streaming | F1/F2/F3 + A3/A4/A5：增量算法、参数聚合、生命周期闭合、abort 终态全缺 | P1 |
| 上下文工程 | Claude Code compaction；Cline"最近 N 条 + 摘要"窗口 | 全量重放无窗口无摘要（A1）；历史图片每轮内联重发（A2） | P1 |
| 多模态存储 | CopilotKit 官方 RN 模式（上传换 URL）；文件路径按需读取 | base64 直存消息 JSON 入库（A2/D2），未复用库内 CAS | P1 |
| Run/Attempt 与崩溃恢复 | LangGraph checkpointer 按 step 持久化、interrupt/resume；ChatGPT run 状态机 | runId 瞬时存在；runIssue 仅 React state（F7）；崩溃后假 running（B1）；失败快照丢弃（F8） | P1→P2 |
| 运行中输入 | ChatGPT/Claude/assistant-ui 允许流式期间输入与排队 | `editable={!isRunning}` 全程锁死（C10） | P1→P2 |
| 结构化产物 | Claude Artifacts 独立展示/版本/正文去重；Cline 显式 artifact 标记 | 正则抓任意代码块（F9）；双份展示（B5）；confidence 未用；版本/来源轮次缺失 | P1→P2 |
| 计划与状态可见性 | Claude Code TodoWrite 结构化状态；Manus 阶段 timeline；CopilotKit STATE_SNAPSHOT/CUSTOM 事件 | DeepAgents todos/files 状态完全不外露，STATE/CUSTOM 事件零使用 | P2 |
| 工具调用展示 | Cline 参数预览 + 单步展开 + 耗时；assistant-ui args 流式渲染 | 仅 name；args 丢弃；无耗时；单一总开关（B6） | P2 |
| HITL 工具审批 | Claude Code 权限提示；Cline 写文件前确认 | DeepAgents 无 interrupt 配置，工具静默执行（A6） | P2 |
| 错误恢复路径 | 失败消息标红 + 一键重发，原文回填 | 草稿不回填（C1）；重试截断失败轮（A15）；notice 永驻（C3） | P1→P2 |
| 会话检索与存储 | 消息级 append + 投影索引；FTS 检索 | 单 JSON 列整行覆盖（D1）、无索引、内存扫描（D6）、零 GC（D4） | P2→P3 |
| 基础移动体验 | 触控 ≥44pt、动态字体、haptics、深色模式、interactive 键盘 | C2/C6/C7/C8/C9/C14 全缺 | P2 |
| Token/成本透明 | CopilotKit/assistant-ui 展示 usage；Claude Code 汇报 context 占比 | 无 usageMetadata 采集，用户对成本零感知 | P3 |

已达标（应保留）：滚动跟随守卫与"回到最新"（`timelineScroll.ts` + 测试）、工具折叠时间线骨架、附件去重与原子提及 token、composer 预览 Modal、runtime 按 thread 复用与写队列、全局迁移框架（迁移前备份 + recovery 标记）与 CAS 基座。

## 四、推荐落地顺序

### 第一批：正确性与数据安全（P1）
1. F1/F2/F3 流式协议三连（第一轮已列）。
2. F4 单写者化：rename 只 UPDATE 元数据列并走 runtime 队列；D9 一并修。
3. F5 空会话出口 + C13 设置入口。
4. F6 提及身份持久化。
5. F9 产物结构化交付（专用标记/工具调用），confidence 进 UI。
6. B1 半截 run 归一化（加载时孤儿 toolCall 标 interrupted）。
7. C1 发送失败回填草稿 + pendingRow 失败态。
8. A1/A2 上下文窗口 + 图片引用化（可先做"仅当前轮内联图片"止血）。
9. A8 配置错误走 UI 态而非白屏。
10. B3 key 稳定性 + B2 行级 memo（低成本高收益部分）。

验收：重复 chunk 不丢字；工具参数跨片完整；两轮保留工具上下文；流式中重命名不丢不回退；删除最后会话可新建；删图后 @ 不漂移；杀进程重载无假"进行中"；发送失败文本不丢。

### 第二批：可靠性与可观察性
F7 Run/Attempt 持久化、F8 max-wait + 失败重试、A3/A4/A5 事件生命周期闭合、A6 工具结构化失败 + 真实活动文案、A9/A10 超时与重试竞态、D1 消息级存储（可与 A2/D2 一并）、D3 runtime LRU、D4 GC、D5 UUID、C2/C6/C7/C8/C9 移动基础体验、C4/C5 附件校验与权限、B6 工具信息密度、C10 运行中可输入。

### 第三批：产物闭环与打磨
Prompt 版本/差异/回退、STATE/CUSTOM 桥接 DeepAgents 计划状态、结构化澄清卡、正文去重（B5）、深色模式（C14）、FTS 检索（D6）、会话导出/导入（D10）、技能瘦身（A12）、token 用量透明。

## 五、验证记录

- 本轮为静态源码审查 + 独立复核，未修改代码，未调用用户 LLM，未运行 Android 实机。
- 第一轮（同基线）已运行：`npm test -- --runInBand src/agent`（18 套件 93 项通过）、`npm run typecheck` 通过；本轮未重复执行。
- 未验证：真实 LLM/provider 端到端、Android 键盘/触控/帧率/杀进程恢复；C6/C9 等系统适配项基于代码推断，需实机确认。
