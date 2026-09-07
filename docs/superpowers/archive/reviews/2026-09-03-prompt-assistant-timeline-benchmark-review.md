# Prompt 助手 Timeline 展示对标评估

> 评估时间：2026-09-03
> 评估对象：`mobile/src/agent/PromptAssistantUi.tsx` 的 `ConversationTimeline` / `ToolTimeline` / `RunningIndicator` / `PromptResultCard` / `UserMessageText` 及 `agentPresentation.ts` 的消息规范化逻辑。
> 评估方法：通读 timeline 全链路源码（消息规范化 → 列表渲染 → 流式文本 → 工具时间线 → 产物卡）；对照业界主流 agent 交互展示方案（ChatGPT / Claude / Gemini 移动端、CopilotKit、Vercel AI SDK chatbot、Manus / Devin 任务时间线、artifact 类产品）逐项比对。
> 关联记录：`2026-09-03-prompt-assistant-auto-scroll-review.md`（自动滚动打断）、`2026-09-03-prompt-assistant-image-mention-naming-review.md`（图片命名重复）。

## 1. 现状盘点（已具备的能力）

| 能力 | 位置 | 评价 |
|---|---|---|
| 乐观插入用户消息 + 落库去重 | `PromptAssistantUi.tsx:130-153` | 符合业界做法 |
| 流式 Markdown 渲染（含 streamingAnimation） | `PromptAssistantUi.tsx:463-469` | 底层是 streamdown/enriched-markdown，基础具备 |
| 工具时间线可折叠，展开态含步骤名/状态/摘要 | `PromptAssistantUi.tsx:518-559` | 有 a11y label，结构正确 |
| 结构化产物卡（FINAL H3 PROMPT）+ 复制/导出 | `PromptAssistantUi.tsx:561-616` | 超出多数聊天模板的产物意识 |
| 用户消息 @提及 token 内联缩略图渲染 | `PromptAssistantUi.tsx:854-889` | 细节领先 |
| 会话历史按 今天/近 7 天/更早 分组 | `agentPresentation.ts:185-204` | 正确 |

## 2. 改进点清单（按优先级）

### P0 — 体验硬伤，低成本高收益

**1. 自动滚动打断上滑（已有专项 review，此处只列结论）**
三个触发点无条件 `scrollToEnd`。业界标准是"贴底才跟随 + 上滑出现『回到最新』浮动按钮 + `maintainVisibleContentPosition` 保视口"。修复方案见 auto-scroll review 第 6 节。

**2. 失败/中断反馈内联化，缺失重试入口**
现状：错误只出现在顶部 notice 横幅（`PromptAssistantUi.tsx:322-327`），停止生成仅显示"已停止生成"（:342），时间线本身不留痕；用户消息已发出但无 assistant 回复时，没有任何重试入口，只能重新手打。
业界做法：错误/中断以**消息内错误气泡**呈现（含错误摘要 + 重试按钮），ChatGPT 与 CopilotKit 均如此；中断后的半成品回复保留并可重试。
建议：`RUN_ERROR`/abort 时在时间线追加错误行组件；对最后一条 user 消息提供"重试"。

**3. 消息级操作缺失（复制 / 重试 / 编辑）**
现状：只有 `PromptResultCard` 有复制；assistant 中间过程文本、user 消息均无任何操作，无长按菜单。
业界做法：移动端标配长按弹出操作表（复制、重试最后一轮、编辑 user 消息并重新生成分叉）；桌面端 hover 工具条。
建议：先做最小集——assistant 消息复制（含工具摘要外全文）、最后一轮 user 消息"重新生成"。

**4. 空状态建议不可点击**
现状：`EmptyTimeline` 的两条建议是纯 `Text`（`PromptAssistantUi.tsx:501-504`），无 Pressable、无 onPress。
业界做法：suggestion chips 点击即填入 composer 或直接发送（所有主流产品均如此）。
建议：改为 Pressable，点击 `setDraft(suggestion)` 并聚焦输入框。改动最小、收益直接。

### P1 — 可读性与信息密度

**5. ToolTimeline 折叠态信息量不足**
现状：摘要仅"正在分析… / 处理失败 · N 个步骤 / 已完成 N 个步骤"（`agentPresentation.ts:153-160`），运行中**不显示当前活动名**——而 `step.name` 明明可得。
业界做法：折叠态实时显示当前活动（Claude："Reading files…"；ChatGPT："Searching the web…"；Manus 显示当前步骤名）；失败态自动展开；步骤附耗时。
建议：`toolTimelineSummary` 接收 steps，running 时输出 `正在${runningStep.name}…`；失败自动 `setExpanded(true)`；步骤行追加耗时（可从 TOOL_CALL_START/END 的时间差取，暂无则略）。

**6. 状态指示全静态，无动效**
现状：全文无 `Animated`/reanimated 使用；`runningDot`（:1089）与 `stepDot` 是纯色 View，"进行中"与"完成"只靠文字区分。
业界做法：running 步骤用旋转 spinner，完成用 check 图标，失败用 x 图标（CopilotKit/Manus 时间线均如此）；图标比色点+文字的扫视效率高一个量级。
建议：`AppIcon` 已在依赖内（check_circle/error/close 等图标可用），running 加一个 reanimated 旋转环。

**7. 历史消息附件不可预览**
现状：发送后的图片仅 `<Image>`（:437-443），点击无响应；@提及 token（`user-image-mention`，:881）也不可点。
业界做法：附件缩略图点击全屏预览（ChatGPT/Claude 标配）；@token 点击跳转对应附件预览。
建议：composer 的 `AttachmentStrip` 已有全屏预览 Modal（:727-744），抽成共享组件复用到时间线。

**8. 流式期间的重复计算与布局跳动**
现状：`timelineSignature` 每次渲染对全部消息做 O(n) 字符串拼接（:402-408），流式期间每个 delta 都执行；`CopilotMarkdown` 整条消息全量重渲染；`PromptResultCard` 挂载增高会再次触发滚动问题（见 auto-scroll review）。
业界做法：streamdown 类方案的目标即"块级增量渲染 + 尾部光标 + 稳定布局"。
建议：签名计算 `useMemo`；长 prompt 卡片默认折叠（限高 + 展开），既省渲染又减少 contentSize 突变。

**9. 无时间锚点**
现状：消息无时间戳、无日期分隔线；出问题时无法定位"哪一轮"。
业界做法：日期分隔线（今天/昨天）+ 消息级相对时间或耗时。
建议：至少给 assistant 回复附"耗时 Ns"（run 起止已知），成本低于完整时间轴改造。

### P2 — 进阶方向

**10. PromptResultCard 版本化**：多轮迭代后每张卡独立散落，无"最新版本"标记与对比。业界 artifact 模式：卡片可折叠、多版本切换、diff 视图。至少先加"最新"徽标 + 旧卡折叠。
**11. 用户消息编辑与分叉**：threadStore 已支持多会话，但无消息级分叉。ChatGPT/Claude 的 edit-and-regenerate 是高价值功能，工程量大，列为长期。
**12. 可访问性补全**：时间线消息行无 `accessibilityRole`/label（composer 已做得较好）；长文建议支持动态字体缩放。
**13. 进度指示语义重复**：footer `RunningIndicator`"正在生成 Prompt…"与折叠态摘要"正在分析…"并存（:428 + :528）。业界只保留一处活动指示，或让 footer 指示器直接复用当前活动名。

## 3. 优先级矩阵小结

| 优先级 | 项 | 预估成本 | 依赖 |
|---|---|---|---|
| P0 | 建议 chips 可点 | 极低 | 无 |
| P0 | 错误内联 + 重试 | 低 | aguiAgent 错误事件已有 |
| P0 | 消息级复制/重试 | 低-中 | 需 agent 消息定位能力 |
| P0 | 滚动守卫（见另篇 review） | 中 | 需改既有测试 |
| P1 | 折叠态当前活动名 + 失败自动展开 | 低 | 数据已有 |
| P1 | 状态图标/动效 | 低 | AppIcon + reanimated |
| P1 | 附件全屏预览复用 | 低 | 组件抽取 |
| P1 | 签名 useMemo + prompt 卡折叠 | 低-中 | 需同步改测试 |
| P2 | 版本化 / 编辑分叉 / a11y / 指示器合并 | 中-高 | — |

建议落地顺序：P0 四项先行（一次小迭代），P1 按 5→6→7→8 排期，P2 视产品方向取舍。
