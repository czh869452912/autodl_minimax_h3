# Prompt 助手：Agent、交互、Timeline 与 Session 审查

日期：2026-09-06。代码基线：`b8014025`，应用版本 1.4.12。

## 结论与范围

当前已经具备可用的移动端 Prompt 对话基础：本地 DeepAgents、AG-UI/CopilotKit 接入、官方 H3 skills、多模态输入、会话搜索/重命名/删除、流式 Markdown、工具折叠展示和 Prompt 导出。下一步应优先补齐**协议正确性、会话数据一致性、产物可信度**，然后再提升进度可读性与版本管理。

本轮包括源码审查、独立 session 复核、当前依赖源码核对、现有测试及无网络最小复现，并查阅官方产品与协议文档。没有修改应用代码，没有调用用户的 LLM 或提交视频任务。未运行 Android 实机/模拟器，因此键盘、触控、滚动流畅度和视觉布局只给出代码层建议，不声称完成视觉验收。

优先级：P1 为优先修复的数据或行为缺陷，P2 为应排期的可靠性/交互改进，P3 为后续产品能力。没有证据支持将这轮问题定为无条件阻断全应用的 P0。

## 已有改善，应保留

9 月 3 日的旧 timeline 审查不能直接当作当前缺陷清单：

- `PromptAssistantUi.tsx:445`、`:474`、`:568` 已有贴底跟随守卫、拖动处理和“回到最新”。
- `:595` 已有错误/停止内联行与重试；但状态仍是组件临时状态，见 F7。
- `:541` 已有 assistant 回答复制；用户文字可选择复制。
- `:653` 已有可点击建议并填入/聚焦输入框。
- 会话列表已有全文匹配、日期分组、排序和同名标题区分。
- runtime 按 thread/config 复用，写入串行化；删除先 evict 再删库，避免已排队写入复活已删除会话。这些基础应延续。

## 可证实的问题

### F1 · P1：把增量文本当累计文本处理，真实输出会丢字

位置：`mobile/src/agent/aguiAgent.ts:173–179`；备用流实现 `h3Agent.ts` 也存在同类算法。

`streamMode: 'messages'` 输出 token/message chunks；当前却以 `text.startsWith(prior)` 推断累计快照并截去前缀。使用安装中的 `AIMessageChunk` 经真实 `H3AgUiAgent.run()`，输入同一消息的 `ha`、`ha`、`!`，预期 `haha!`，实际 `ha!`。重复中文词、换行和标点也属于同类触发条件。

建议：显式区分 chunk 与完整 message；增量直接追加，完整快照另走 reducer。不要靠字符串前缀猜协议。增加重复 token、连续换行、内容块和多轮模型调用的契约用例。

### F2 · P1：工具参数分块没有完整接入，结束事件过早

位置：`aguiAgent.ts:22–25`、`:156–170`。

`callsOf` 只读取 `tool_calls`，没有累计 `tool_call_chunks`。真实 `AIMessageChunk` 接收分片 `{"file_` 和 `path":"/skills/test.md"}` 时，第一片解析出来的 `tool_calls.args` 是 `{}`，第二片不能单独解析；当前最终发出 `TOOL_CALL_ARGS('{}')` 后即 `TOOL_CALL_END`，完整路径没有进入 UI 历史。

这首先影响展示/持久化的工具参数，而非证明 DeepAgents 当轮实际执行了错误参数：图内部仍有自己的聚合逻辑。AG-UI 的 END 表示参数已传完，不应在第一片就发送；工具执行成功/失败则应独立建模。

建议：按模型调用、messageId、tool index/id 聚合原始参数分片；参数真正结束后发 END；工具执行状态来自真实结果事件。用当前依赖的真实消息类型做集成测试，不只用手写的完整工具对象。

### F3 · P1：下一轮回传丢失 assistant 工具调用，工具结果随之失去上下文

位置：`aguiAgent.ts:39–52`。

适配器转换了 tool result 的 `toolCallId`，但 assistant 的 AG-UI `toolCalls` 直接原样传给 LangChain。实际调用当前依赖的 `coerceMessageLikeToMessage`：带有 `toolCalls` 的 assistant 得到 `AIMessage.tool_calls = []`。

本地 DeepAgents 默认 `patchToolCallsMiddleware` 会删除没有对应调用的孤立 ToolMessage（依赖 `langsmith-BBV5JlNW.js` 中 `patchDanglingToolCalls`）。因此不能简单声称“一定报 400”；更确定的后果是下一轮模型丢失先前工具调用及结果上下文，可能重复读取技能、遗忘分析依据。

建议：建立对称的 AG-UI ↔ LangChain 消息转换，保留调用 ID、名称、完整参数及结果关联。验收“工具调用→结果→用户追问→恢复后追问”整个往返链路。

### F4 · P1：重命名写入旧的完整会话，可能覆盖后台生成结果

位置：`AgentScreen.tsx:183–192`、`:256–266`；`runtimeStore.ts:85–97`；`threadStore.ts:100–111`。

触发过程：A 正在生成 → 切到 B → A 后台完成并保存 → 在历史中重命名 A。切换后 A 的 UI 订阅已卸载，`threads[A]` 可能还是旧快照；重命名把这份快照整体 `INSERT OR REPLACE` 回数据库。

独立复核以真实 `runtimeStore.ts` 的内存执行验证：后台完成后数据库有 2 条消息，按页面重命名路径写入旧快照并 dispose 后只剩 1 条用户消息。重启后新回复丢失。

另一个同源问题：当前会话重命名后，`useMemo` 不因 snapshot 元数据变化重新执行，runtime 不知道新标题；下一次消息更新可能把标题覆盖回旧值。

建议：重命名只执行元数据 UPDATE；统一元数据与消息写入所有权/串行队列，及时同步 runtime。历史列表订阅 registry 的索引级更新，不依赖当前打开的会话上报。

### F5 · P1：删除最后一个会话后陷入无操作页面

位置：`AgentScreen.tsx:165–175`、`:206–209`。

删除最后会话后 `activeThreadId = null`，页面返回“正在准备本地助手会话…”的 `StatusView`；新建与历史入口也随 `AgentSession` 一起消失。初始化 effect 不会因列表变空重跑，因此需要重新挂载页面才能恢复。

建议：空列表是正式 UI 状态，保留新建入口或创建可编辑空会话。同时首次空库初始化的 `void threadStore.save(initial).then(...)`（`:133`）应纳入外层 await/return 错误链，否则保存失败不会进入现有 catch。

### F6 · P1：素材提及在发送后重新编号，可能引用错图

位置：`imageMentions.ts:27–38`；`PromptAssistantUi.tsx:243–255`、`:1026–1029`；`agentPresentation.ts:79–82`。

编辑器按附件 ID 保留稳定编号，历史规范化却按当前数组位置生成“图片1、图片2…”。复现：加入 a/b/c 三张图 → 删除 a → 编辑器 b/c 仍为图片2/图片3 → 发送 `@图片2` → 历史 b/c 变为图片1/图片2。提及的缩略图从 b 错配到 c；若只余 b，提及则无法正常匹配。

建议：消息持久化附件 ID、显示名和结构化 mention 关系；模型输入同时提供清晰的标签与图片对应关系；禁止展示层重新编号。验收删除、混合相册/文件来源、重启恢复和跨轮引用。

### F7 · P2：错误/停止不属于持久化轮次，恢复后失去解释与重试入口

位置：`AgentScreen.tsx:253–254`、`:287–302`；`PromptAssistantUi.tsx:377–379`、`:493–498`；`LocalCopilotKitProvider.tsx:26–40`。

`runIssue` 只存在于 keyed `AgentSession` 的 React state，切换会话即清空；重启同样没有失败/中断记录。重试会截去最后用户消息后的所有内容，旧尝试和半成品无法回看。当前 footer 也不能定位多轮历史中的具体失败。

建议：引入独立 Run/Attempt，持久化 queued/running/completed/failed/cancelled/interrupted、时间、错误摘要和重试关联；重试创建新 attempt，提供“重新生成”和未来的“恢复执行”不同语义。不要把重新发送历史描述为断点续跑。

### F8 · P2：300ms 尾部防抖不保证持续生成过程中的落盘

位置：`runtimeStore.ts:85–107`、`:111–130`。

每次 delta 都重置 300ms timer；若输出持续快于该间隔，保存会一直延迟到停顿/结束。正常 dispose 会 flush，但进程被系统杀死不会保证执行卸载。移动端可能丢失从上一次停顿以来的整个输出区间，而非仅最后 300ms。

建议：保留短防抖，但增加最大保存等待时间；在用户提交、工具结果、run 终态及进入后台时显式 flush。保存失败应保留 dirty snapshot，支持重试，不只展示 notice。此项基于定时器控制流及独立虚拟时钟验证，未做 Android 杀进程验证。

### F9 · P1：普通代码块/未完成标题内容被标为最终可生成产物

位置：`promptParser.ts:7–35`；`PromptAssistantUi.tsx:534–560`、`:735–768`。

任意匹配的 text/prompt/markdown/无语言代码块都会被识别为 high-confidence Prompt；带标题的内容在流式输出未结束时也可被提取。卡片统一写“FINAL H3 PROMPT / 可直接用于生成”，并且导出按钮没有等待轮次完成或验证字段。最小复现：解释性代码块 `not a final prompt` 被识别为最终 Prompt。

建议：优先通过结构化结果或专用产物事件交付，至少要求最终消息完成、产物类型正确、必需字段通过校验。区分“生成中”“待补素材”“可导出”；一个长 Prompt 在正文与卡片重复展示的问题可一起处理。

## 对标优秀应用：值得借鉴的能力

以下是官方公开能力与本项目的适配建议，不是对竞品实机体验的逐项测评，也不意味着应照搬完整 IDE 或云端架构。

| 维度 | 对标依据 | 当前差距与建议 | 优先级 |
| --- | --- | --- | --- |
| Agent 协议 | LangGraph 明确区分 token 流、状态、工具事件；AG-UI 区分参数结束和工具结果 | 先修 F1–F3；建立类型明确的事件 reducer 和 provider 契约测试 | P1 |
| 可恢复执行 | LangGraph checkpointer 按执行步骤保存图状态 | 当前只恢复聊天快照：没有接入图 checkpoint，stream 输入也未回填持久化 graph state。若需要持续分镜/files/todos，应持久化图状态或明确设计领域状态重建 | P2 |
| 产物管理 | Claude Artifacts 独立展示、版本切换、修改与导出 | 把 Prompt 从正文提取结果升级为带版本、来源轮次、素材绑定、工作流要求的产物；先加“最新”标记和旧版折叠 | P1→P2 |
| 可回退迭代 | Cursor checkpoints；Claude 对话分支及关联产物 | 重试保留旧 attempt；后续支持编辑用户消息并分支、Prompt diff/回退 | P2→P3 |
| 澄清交互 | Cursor Agent 支持结构化提问并在等待时继续独立工作 | 当前只有自由文本。可增加画幅/镜头/风格/素材缺口的澄清卡，给出默认值和可修改项 | P2 |
| Session 工作流 | Cursor 会话历史及独立上下文；持久化框架区分 thread/run | 先修 F4/F5/F7；再补输入草稿恢复、最近打开会话、运行/未读标记、归档/导出 | P1→P2 |

官方来源（2026-09-06 查阅）：

- [LangGraph streaming](https://docs.langchain.com/oss/javascript/langgraph/streaming)：messages 为 token/message chunks，另有状态及工具事件；本轮也核对了安装中的实现，避免只按最新网页推断本地行为。
- [AG-UI events](https://docs.ag-ui.com/concepts/events)：文本、工具参数、工具结果与状态事件的语义。
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)：step checkpoints、故障恢复与 thread 的关系。
- [Claude Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)：独立产物、版本选择、导出与编辑历史分支。
- [Cursor Agent overview](https://cursor.com/docs/agent/overview)：澄清提问、工具能力、检查点与恢复。
- [Cursor chat overview](https://docs.cursor.com/chat/overview)：独立对话上下文、历史与导出。该旧入口内容用于能力参考，不将其快捷键或布局当作当前移动端规范。

## Timeline 与移动交互建议

1. **运行状态真实且可读。** 当前折叠文案仍是“正在分析…”，footer 是“正在生成 Prompt…”，用户不知道正在读技能还是写结果。将内部 `read_file` 等映射为“读取 H3 写作规范”等活动描述，展示当前阶段与已用时间；无真实进度分母时不要做百分比。
2. **失败来自状态，不来自关键词。** `agentPresentation.ts:100–103` 用 `/error|fail|失败/` 判断工具失败；实际读取包含“handle API error gracefully”的正常文本会显示失败，错误出现在第 160 字之后又可能漏判。使用结果状态/错误事件，保留技术详情供展开查看；失败自动展开。
3. **按用户轮次组织。** 每轮包含活动轨迹、最终回复、产物和终态。添加时间/耗时锚点，避免所有历史 Markdown 都使用全局 `isRunning`；消息真正结束时应及时 END，而不是所有文本延迟到 RUN_FINISHED 前一并结束。
4. **允许准备下一轮。** 当前 `Composer` 的 `editable={!isRunning}` 锁住输入。可以保持可编辑草稿，明确“停止”“发送后续”“排队”策略；优先做可编辑和会话草稿保存，再考虑运行中 steering。
5. **历史附件可预览。** composer 有预览 Modal，发送后的图片和 @token 没有点击预览；复用预览组件，并在 F6 修复后确保指向同一素材。
6. **长对话性能有结构性改进空间。** 每个 delta 全量 normalize、解析 Prompt、拼全文 signature；历史计数又调用 normalize，数据库 list 读取所有完整会话。应把 session 索引与 transcript 分开、历史分页、按 message revision 更新，保持未变化 row 的对象稳定；不是简单套一个依赖可变数组引用的 useMemo。
7. **图片不要内嵌在所有聊天快照中。** 当前 base64 与 messages JSON 一起持久化/加载/克隆，相册允许单张 20MB，9 张原图会放大内存压力。采用文件/CAS 引用与缩略图，发送时按模型要求处理图片。这里是结构风险，尚无帧率或内存实测结论。
8. **导出是一个完整交接。** `AgentScreen.tsx:226–227` 固定 `attachmentIds: []`，只有文本进入创建页。补充来源 thread/message/artifactVersion、素材绑定与参数预览，提供缺图提示、导出中和失败重试；这属于当前产品缺口，不声称已有 Agent 直提交能力。

## 推荐落地顺序与验收

### 第一批：数据和协议正确

F1/F2/F3 流与消息往返；F4 元数据更新隔离；F5 空会话出口；F6 素材身份；F9 产物完成门槛。

验收重点：重复 chunk 不丢字；工具参数跨片完整；两轮对话保留工具上下文；后台完成后重命名不丢回复；删除最后会话能新建；删图后 @引用不漂移；解释/半成品不能作为最终 Prompt 导出。

### 第二批：恢复与可观察性

Run/Attempt 持久化、最大落盘间隔、失败重试保存、真实工具终态、当前活动、输入草稿及后台会话索引更新。

验收重点：网络失败→切换→返回仍有原失败和重试入口；停止保留部分输出；持续流式期间周期落盘；后台/杀进程恢复能区分完成、失败和意外中断。Android 行为须补实机验证。

### 第三批：创作产物闭环

Prompt 版本/差异/回退、素材带入创建页、参数预览、结构化澄清，最后再做项目化、跨会话资产复用与更长程自动执行。

### 质量衡量

建议建立覆盖文生视频、图生视频、多图引用、多轮修改、依赖缺失工具的技能、取消/重试/恢复的固定用例集。观察可生成 Prompt 合格率、素材引用正确率、无依据声称已生成的发生率、首个可见反馈/最终结果耗时、工具轮数和 token 用量、恢复成功率。先收集基线再定目标；不要仅用“输出了代码块”或单元测试通过判断 Agent 质量。

DeepAgents 当前默认已有 summarization middleware，不能把“完全没有压缩”当作发现；本项目缺的是跨轮持久化/恢复的一致性、可见策略和针对未知 compatible model 的能力评估。

## 验证记录

- `npm test -- --runInBand src/agent`：18 个套件、93 项通过。错误用例会输出预期的 provider failed console.error，测试自身通过。
- `npm run typecheck`：通过。
- 无网络最小复现：真实 AIMessageChunk 的重复文本丢失、分片工具参数变 `{}`、assistant toolCalls 转换丢失、普通代码块误识别、正常工具内容误判失败、删除附件后的显示名漂移。
- 独立 session 复核：真实 runtimeStore 内存执行复现旧快照覆盖已生成消息及标题回退；虚拟时钟检查持续流防抖。
- 未验证：真实 LLM/provider 端到端、实际视频生成、Android 布局/触控/键盘/帧率/杀进程恢复。现有测试通过不消除以上已复现缺陷。
