# 全量 UX 交互界面排查（2026-09-14）

> 后续复核与修复记录见 [UX 交互审查复核与解决评估](2026-09-14-ux-interaction-reassessment.md)。本文保留原始发现；其中部分判断、优先级和解决建议已在复核中修正，不能直接视为全部已确认缺陷。

对全部 5 个 tab（生成 / Prompt 助手 / 任务队列 / 结果 / 设置）及全局 UI 做了一轮交互设计排查。方法：并行审查各界面源码与测试，从触控目标、加载/禁用反馈、错误呈现、键盘处理、手势冲突、状态丢失、空状态、可发现性、无障碍、深色模式等维度逐项核对。本文只记录问题与改进方向，未修改任何代码。

审查范围：

- 生成：`app/(tabs)/create.tsx`、`src/create/*`、`src/workflows/renderer/*`
- Prompt 助手：`app/(tabs)/agent.tsx`、`src/agent/*`
- 任务队列：`app/(tabs)/tasks.tsx`、`src/tasks/*`
- 结果与播放：`app/(tabs)/gallery.tsx`、`app/video/[id].tsx`、`src/media/*`
- 设置与全局：`app/(tabs)/settings.tsx`、`app/_layout.tsx`、`src/settings/*`、`src/ui/*`、`src/storage/*`

所有文件路径均相对 `mobile/`。

---

## 一、跨界面系统性问题

| # | 问题 | 主要表现 |
|---|------|----------|
| S1 | 操作→反馈断链 | 设置页开关即时变色但要滚到底点保存才落库；视频详情页导出后按钮永久停在“保存中…”；任务页无取消能力 |
| S2 | 静默数据丢失 | 提交中输入被丢弃但仍显示光标；粘贴超长静默截断；带 prompt 参数进入无条件覆盖手写内容；删除的作品被后台 reconciliation 复活 |
| S3 | 错误呈现三条标准 | 同页混用 11px 内联小字 / 阻断式 Alert / 原始英文错误串（`SQLITE_BUSY`、`RUNNING`、`DOWNLOADING 45%`）；错误横幅不可关闭、永不消失 |
| S4 | 键盘处理不一致 | Agent/Settings 有 KeyboardAvoidingView，Create 长表单完全没有；多数列表滑动不收键盘 |
| S5 | 触控目标/可读性 | 多处按钮 30–40pt（低于 44pt）；历史“删除”是全屏最小点击目标且为破坏性操作；大量 11px 关键状态文字；`textSubtle` 对比度 ~3.9:1 低于 WCAG AA |
| S6 | 深色模式未适配 | 全静态浅色主题，无 `useColorScheme`，`app.json` 无 `userInterfaceStyle`；原生 Alert 跟随系统变深，与应用内浅色混搭割裂 |
| S7 | 空/加载/失败三态不分 | 加载失败显示“暂无任务/暂无视频作品”（对用户撒谎）；无骨架屏、无重试入口、无 CTA |

## 二、优先修复建议（Top 5）

1. **停止按钮语义错误**（Agent）——“已停止生成”提示与实际行为不符，信任伤害最直接。
2. **导出/下载状态反馈断链**（视频详情）——订阅 `taskProjectionEvents` 即可修复。
3. **设置未保存保护 + sticky 保存栏**——静默丢数据。
4. **任务取消能力 + 下载中文文案/进度条**——队列管理核心闭环。
5. **删除被复活 + 提交后表单不重置**——破坏“操作不可逆”预期。

---

## 三、生成（Create）

### 高

- **H1 提交/切换期间输入被静默丢弃（伪可编辑状态）** — `src/create/CreateForm.tsx:395-396` + `src/workflows/renderer/renderers.tsx`（全文无 disabled 传递）。提交中（含 formSaveTail、素材上传、队列请求，可达数秒）和切换工作流期间 `onChange` 直接 return，但所有 TextInput 仍显示光标、仍可聚焦。用户敲的字符不出现、无“参数锁定中”提示，看起来像输入丢失/键盘故障。建议：disabled 状态传入 WorkflowForm（FieldRenderContext 增加 disabled，渲染层设 editable + 视觉置灰），或提交期间显示锁定遮罩。
- **H2 工作流加载失败/无工作流时无重试入口** — `CreateForm.tsx:371-374, 471`。失败后整页只剩一行 11px 灰色 subtitle「工作流加载失败」，提交按钮静默变灰；唯一恢复手段是切走再切回 tab 等 `catalogRevision` 事件。错误态、加载态、空目录态共用同一行小字。建议：提供显式重试按钮，区分加载中 / 失败 / 空目录三态，失败时指引去设置页同步。
- **H3 提交成功后表单不重置，易产生重复任务** — `CreateForm.tsx:319-364, 353-355`；`src/create/submissionGate.ts` 仅防并发。成功后 prompt、素材、参数全部保留，gate 释放后再点即原样再排队一个相同任务；成功 Alert 只有「查看任务」一个动作。建议：成功后清空表单（或提供「再来一条」显式动作）；Alert 同时给出「查看任务」与「留在此页」。
- **H4 校验失败：Alert 遮挡行内错误，不滚动、不聚焦出错字段** — `CreateForm.tsx:338-341, 366-483`。弹「参数设置不合法」总结 Alert 同时设置 fieldErrors，但 ScrollView 无 scrollTo 逻辑，关掉弹窗后用户要在长表单里自行寻找 11px 红字。建议：去掉总结性 Alert（多错误时仅提示数量），自动滚动并 focus 到第一个出错字段。

### 中

- **M1 切换工作流无进行中反馈** — `CreateForm.tsx:299-316`；`WorkflowSelector.tsx:21`。switching 期间只有 trigger opacity 0.5，无 spinner/文案；切换要等 formSaveTail 完成，慢时页面毫无动静。
- **M2 内联下拉菜单把整页内容顶下来，点外部不关闭** — `WorkflowSelector.tsx:25-41`。菜单是文档流内 ScrollView（maxHeight 240），展开时把下方整个表单下推约 240px；无 backdrop，点击菜单外不收起。建议改 Modal / 浮层 + 点击外部关闭（可复用 `src/ui/DraggableSheet.tsx`）。
- **M3 媒体校验整批作废 + 多选静默截断** — `src/create/MediaPicker.ts:17-19`。超配额时 `assets.slice(0, remaining)` 静默丢弃；任一文件超 50MB 或格式不符则 throw，整批选择全部作废，只弹一个不指明文件的 Alert。建议过滤不合格文件并提示「已跳过 N 个（原因）」，合格的正常加入。
- **M4 图片引用标签自相矛盾（@image0 vs @0）** — `src/create/AttachmentPreview.tsx:15`。分组标题写「@image0 - @image{n-1}」，缩略图角标却显示 `@0`、`@1`；音频统一为 `@audio0`。建议角标统一 `@image0` 格式。
- **M5 「丢弃交接草稿」等破坏性操作无确认** — `CreateForm.tsx:386-389`；`AttachmentPreview.tsx:10, 15`。丢弃草稿不可恢复，点击立即执行、无二次确认；删除素材无撤销。建议草稿丢弃加确认；删除提供轻量撤销（toast undo）。
- **M6 键盘处理缺失** — `CreateForm.tsx:366-370`。只有 `keyboardShouldPersistTaps="handled"`，无 KeyboardAvoidingView、无 on-drag 收起。同项目 settings.tsx:44、PromptAssistantUi.tsx:319/458 均有键盘避让。iOS 上键盘打开时底部提交按钮不可达。建议补 `keyboardDismissMode="on-drag"`，iOS 评估 KeyboardAvoidingView。
- **M7 带 prompt 参数进入时无条件覆盖正在编辑的提示词** — `app/(tabs)/create.tsx:5-13`；`CreateForm.tsx:191-197`。每次 initialPrompt 非空直接 setPrompt 覆盖，无确认；草稿应用有 editRevision 守卫，裸 prompt 接管没有。手写一半 → 助手点「发送到生成」→ 原内容消失，且手动编辑内容不落盘。建议覆盖前确认（替换/追加/取消），或把被覆盖内容存为可撤销草稿。
- **M8 无障碍：错误文案过小且未与输入框关联** — `renderers.tsx:12-14, 50, 124`；`CreateForm.tsx:466`。错误文字 11px；ErrorText 无 `accessibilityRole="alert"`/LiveRegion（对比 handoffError 在 CreateForm.tsx:379 有）；renderEnum:79 radio 未包 radiogroup。建议错误字号 ≥12-13、加 LiveRegion。
- **M9 字段校验错误不随修复动作清除** — `CreateForm.tsx:447-463, 466`。onChange 会清已修复字段错误（:398），但素材区增/删不触碰 fieldErrors：因「参考图不足」提交失败后补上图，红色错误仍挂着，直到下次提交。
- **M10 深色模式完全未适配** — `src/ui/theme.ts:1-32` 全静态浅色；全局无 `useColorScheme`/`Appearance`；`app.json` 无 `userInterfaceStyle`。建议暂不支持则先显式锁定 `userInterfaceStyle: "light"`。
- **M11 提交/加载只有文字无 spinner** — `CreateForm.tsx:373, 378, 477`。「提交中…」等均为纯文本，提交可能上传最多 50MB 素材，数秒无动画难以区分「进行中」与「卡死」。
- **M12 「重新应用/丢弃草稿」按钮长得像普通文字** — `CreateForm.tsx:380-390`。两个 48px 高的 Pressable 内容只是 11px 灰色 help 文字，无边框无底色，可发现性差。建议改描边小按钮，字号 13+。

### 低

- **L1** 字符计数按 UTF-16 码元统计（emoji 计数不准）；schema 有 maxLength 时仅展示计数，TextInput 未设 maxLength，可无限输入直到提交才报错 — `renderers.tsx:40-49`。
- **L2** 整数步进器：清空后按「＋」从 1 起步而非 minimum（`Number('') === 0` 使 fallback 失效）；键盘输入不实时钳制 — `renderers.tsx:55-59`。
- **L3** 「使用随机值」实际是清空字段，语义与行为不符 — `WorkflowParameterFields.tsx:29`。
- **L4** 枚举 chip 无选中态高亮、无 `accessibilityState={{selected}}`（对比 renderers.tsx:79 有完整选中态）— `WorkflowParameterFields.tsx:23-27`。
- **L5** a11y label 恒用默认文案，忽略 schema.title，读屏与视觉不一致 — `WorkflowParameterFields.tsx:17`。
- **L6** 大量死样式残留（label/promptBox/counter/chips 等，`step` 42x44 与 renderers 的 48x48 矛盾）误导维护 — `CreateForm.tsx:497-586`。
- **L7** 音频行挂载即无条件创建 `useAudioPlayer`；播放前无加载态、点击无反馈、无进度 — `AttachmentPreview.tsx:7-11`。
- **L8** 图片缩略图不可放大预览；48x48 红色删除方块遮挡约一半缩略图边缘 — `AttachmentPreview.tsx:15`。
- **L9** 数量达上限时按钮直接变灰，需自行发现 11px「图 9/9」角标才知道要先删除 — `CreateForm.tsx:421-423`。
- **L10** WorkflowForm 每次渲染重建 renderer 注册表 Map，长表单逐字输入有无谓开销 — `WorkflowForm.tsx:15`。
- **L11** 交接成功提示文案技术化（threadId/messageId/versionId）且常驻表单顶部 — `CreateForm.tsx:234-236`。

---

## 四、Prompt 助手（Agent）

### 高

- **H1 输入框 maxLength=4000 静默截断粘贴内容** — `src/agent/PromptAssistantUi.tsx:1094`。Prompt 写作应用粘贴长素材是高频操作，静默丢字 = 无感知数据丢失，用户可能基于残缺文本生成并浪费额度。建议：显示 `x/4000` 计数（接近上限变色）；粘贴超限弹提示；或提高上限软校验。
- **H2 「发送中」阶段停止按钮语义错误，会误报“已停止生成”** — `PromptAssistantUi.tsx:407`（`isRunning={isRunning || submitting}`）、`403-406`、`1130-1147`。submitting 期间按钮已变「停止生成」，点击调用 `agent.abortRun?.()`（无运行可中止，空操作）却设置 `runIssue = '已停止生成'`，随后 `AgentScreen.tsx:405` 的 runAgent() 照常启动。用户明确取消并收到确认，生成实际继续。建议区分三态：idle / submitting（不可点停止）/ running（可停止）。
- **H3 长对话流式期间全量重投影 + 逐秒重渲染** — `PromptAssistantUi.tsx:153-155、178-179、229-241、494-501、565-576`；`RunTimelineRow.tsx:15-19、30`。流式每 token 触发 `projectRunTimeline` 全量行重投影、`historyImageNames` 遍历全部行、`enrichRunTools` O(n) 重算；ConversationTimeline 未 memo；RunTimelineRow running 时每秒 setNow 重渲染整个展开子树。长对话低端 Android 上打字机 + 心跳叠加会掉帧。建议：投影层增量/按 revision 缓存；now 用单一 ticker context 或局部更新；ConversationTimeline 加 memo 并稳定回调；长列表考虑 FlashList。

### 中

- **M1 错误横幅不可关闭、永不消失（双通道可能重复）** — `AgentScreen.tsx:35-43、372-377`（persistenceIssue/notice 置位后无清除路径）；`LocalCopilotKitProvider.tsx:47-50`；`PromptAssistantUi.tsx:361-366、561`。顶部 notice 与底部 runIssue 是两条独立错误通道，同一失败可能同时触发两处；notice 一旦出现持续整个会话。建议统一错误渠道去重、横幅可关闭、持久化问题在下次 flush 成功后自动清除、一次性信息限时消失。
- **M2 展开「执行过程」静默关闭自动跟随，无“有新内容”提示** — `PromptAssistantUi.tsx:515、538-540、566`；`RunTimelineRow.tsx:23、60`。onInspect 直接 setFollow(false)，流式新内容持续出现在视口外；另外 onScrollBeginDrag 无条件 Keyboard.dismiss()，向上翻阅时输入草稿键盘被强制收起。建议 expand 时 bottomDistance ≤ 阈值则保持 follow；「回到最新」加未读角标；键盘收起仅在滑动距离较大时触发。
- **M3 发送失败后的「重试」按钮与实际能力不符** — `PromptAssistantUi.tsx:197、561、690-724`；`AgentScreen.tsx:407-424`。提交阶段失败走 runIssue → RunIssueRow 显示「重试」，但调用 `agent.prepareRetry()` 对“从未创建的 run”只会抛「没有可重试的用户消息」。建议 RunIssue 区分 `kind: 'submit'`，按钮改「重新发送」直接回放 handleSubmit。
- **M4 后台/跨会话运行完成无任何通知** — `AgentScreen.tsx:272-279`（subscribeSummary 只更新列表）；`HistoryList.tsx:82`。run 后台完成后历史列表无未读标记、无 toast、无角标（`h3ReadAt` 已写入但未消费）。生成以分钟计，用户切走是常态，只能反复手动轮询。
- **M5 无障碍标签内嵌原始 ID** — `PromptAssistantUi.tsx:839`（`复制回答 ${id}`）、`619`；`HistoryList.tsx:84、87`；`RunTimelineRow.tsx:23、35`。读屏用户听到 “复制回答 msg-a1b2…”、“删除会话 h3-17268…”。建议改用消息摘要、会话标题、序号等人类可读信息。
- **M6 一批触控目标低于 44pt** — `PromptAssistantStyles.ts:207`（复制按钮 minHeight 30）、`:224`（toolSummary 34）、`:111`（runIssueAction 32）；`HistoryList.tsx:84-89`（••• 与删除图标无最小尺寸）。历史行内“删除”是破坏性操作却是最小点击目标之一。建议统一补 hitSlop 或 min 44pt；删除可改滑动手势 + 确认。
- **M7 附件上传中完全阻塞发送，无进度、无取消** — `PromptAssistantUi.tsx:1074-1077`（uploading 直接 disable 发送）、`1013-1016`（占位仅 9px “上传中”文字）。弱网下大图上传数十秒，用户被完全锁死且看不到进展。建议允许发送不含未就绪附件的消息（或明确提示哪些未就绪）；占位加 spinner + 进度；提供取消。
- **M8 图片预览无缩放、无滑动关闭、无过渡动画** — `PromptAssistantUi.tsx:1036-1045`（`animationType="none"`，仅右上角关闭）。建议接入 ImageViewing 类组件（pinch-zoom、双击、下滑关闭）+ fade 过渡。
- **M9 长文本编辑能力不足；Enter 提交是死代码** — `PromptAssistantUi.tsx:1085-1104`；`PromptAssistantStyles.ts:333-339、349-358`。输入区 maxHeight 120（约 4 行），4000 字 Prompt 无全屏编辑入口；`onSubmitEditing` 在 multiline 下不触发（未设 blurOnSubmit/returnKeyType），死代码暗示“回车发送”意图但实际永远只插换行。建议提供全屏编辑；明确策略并移除死的 onSubmitEditing。
- **M10 历史记录操作模型混乱** — `HistoryList.tsx:84-89`（••• 仅打开重命名却标“管理会话”；删除为独立常驻小图标）、`104-134`（重命名弹窗：空名静默关闭、无 maxLength、回车不提交、点遮罩不关闭）。建议 ••• 改 ActionSheet 聚合操作；重命名补校验与交互。
- **M11 会话切换/删除/流式中断后状态反馈薄弱** — `AgentScreen.tsx:127-139`（每次 focus 清空 workflow，切回出现“正在加载工作流…”闪烁）；`HistoryList.tsx:87`（删除确认未提示将中止进行中生成，`AgentScreen.tsx:236` evictThread 会杀掉 run）；`AgentScreen.tsx:287-291`（兜底错误视图裸显 threadId、无 ScrollView）。建议删除确认区分“该会话正在生成，删除将中止”；兜底视图套 ScrollView 并用 sessionDisplayTitle。

### 低

- **L1** 「回到最新」用 download 图标且无新内容计数 — `PromptAssistantUi.tsx:578-599`。
- **L2** 历史元信息时间仅 `HH:mm`，更早分组无法判断是哪天 — `HistoryList.tsx:82`。
- **L3** 搜索无结果无占位、无清除按钮、无加载指示 — `HistoryList.tsx:43-59`。
- **L4** 用 Alert 当图片来源选择器，Android 上按钮纵排不符平台习惯 — `PromptAssistantUi.tsx:221-228`。
- **L5** 部分 Pressable 缺 accessibilityRole，箭头用 `⌄`/`›` 字符绘制 — `ToolTimeline.tsx:10-15`；`PromptAssistantUi.tsx:884`。
- **L6** PromptVersionPanel 状态文案渲染在 footer 之后可能被裁剪；“加载更早版本”新 chip 出现在横向列表最左侧屏幕外 — `PromptVersionPanel.tsx:154-155、136`。
- **L7** 版本无时间戳、不可删除，多版本后无法辨认对应哪次对话 — `PromptVersionPanel.tsx:137`。
- **L8** 运行错误文本裸 Text，无颜色/布局，与 runIssue 卡片风格割裂 — `RunTimelineRow.tsx:33`。
- **L9** 空态灵感卡硬编码 slice(0,2)/slice(2) 依赖 manifest 恰好 4 项；卡片色 `#465957/#877564` 绕过主题 — `PromptAssistantUi.tsx:758-800`。
- **L10** 「导出到生成」按钮实际是打开版本面板多一步确认，文案与行为不匹配 — `PromptAssistantUi.tsx:370-375`。

---

## 五、任务队列（Tasks）

### 高

- **H1 排队/执行中任务完全没有「取消」交互** — `src/tasks/taskCommandService.ts:27-32`、`app/(tabs)/tasks.tsx`、`TaskCardRow.tsx:11`。TaskStatus 定义了 CANCELLED（types.ts:1）但 service 只暴露 refresh/download/redownload/export，无取消命令；卡片对 QUEUED/RUNNING 除计时外无可操作项。视频生成耗时长且可能计费，误提交只能干等或杀 App。建议增加 `requestCancel(taskId)` + 卡片取消入口（带确认），至少先支持排队态取消；下载/导出同理。
- **H2 下载进行中直接显示英文枚举，无进度条、无取消** — `TaskCardRow.tsx:11`。`ENQUEUED`、`DOWNLOADING 45%` 等原始枚举直接渲染；进度只是 12px 文字无进度条；下载中按钮外观不变仅禁用；`downloadProgress === 0` 时不显示（falsy 判断）。建议建立中文文案映射（排队中/下载中/已下载/下载失败）、进度条 + ActivityIndicator、按钮支持取消。
- **H3 刷新指示器被后台轮询「劫持」，头部状态文字每秒闪变** — `app/(tabs)/tasks.tsx:58、49-50`；`taskListSession.ts:55-63、73、128`。`read.pending` 覆盖所有读操作成因，活动任务时每秒轮询都置 pending true/false：RefreshControl 无用户操作地自动旋转，头部「正在刷新… ↔ 已更新 12:33:41」每秒切换。用户无法区分“我在刷新”和“系统在轮询”。建议区分三态：manual 才驱动 RefreshControl；后台轮询用常驻小圆点/「自动同步中」表达；`lastCheckedAt` 文案节流 ≥30s。
- **H4 从任务列表点开未完成任务 → 详情页状态误导 + 返回文案错误** — `app/(tabs)/tasks.tsx:36` → `app/video/[id].tsx:87-89`。① 详情页左上角永远写「返回画廊」，从任务队列进入时上下文错误；② meta 显示原始英文 `task.status`；③ QUEUED/RUNNING/IDLE 一律显示「下载中」（明确错误）；④ 失败原因（syncError/downloadError）在详情页完全缺失。建议详情页按任务状态分支渲染，复用 formatTaskStatus，返回按钮按来源显示。

### 中

- **M1 手动刷新同时触发强制维护，失败连弹两个 Alert** — `tasks.tsx:20-23`；`syncPolicy.ts:16-31`。一次下拉刷新同时执行 session.refresh('manual') 和 `requestRefresh({maintenance:'force-next-slice'})`（绕过 5 分钟冷却），两者失败分别弹「刷新失败」和「后台刷新请求失败」。建议合并为一次入口；维护失败静默降级为 stale 徽标。
- **M2 分页加载无进行中/到底反馈，失败用弹窗且无重试** — `tasks.tsx:59`；`taskListSession.ts:173-184`。onEndReached 无 ListFooterComponent；失败直接 `Alert.alert('加载失败', String(error))`。建议 Footer 三态（加载中/失败可点重试/已到底）。
- **M3 空状态过于简陋且会「撒谎」** — `tasks.tsx:60`。首次加载失败（phase='stale'、items 为空）同样显示「暂无任务」，错误只在头部 11px 红字；无 CTA。建议区分加载中（骨架）/失败（重试）/真无任务（CTA 跳生成页）三态。
- **M4 卡片可点击区域太小、无可供性** — `TaskCardRow.tsx:11`。仅 prompt 文本可点进详情，其余大面积无响应，无 chevron/「详情」暗示。建议整卡可点（操作按钮阻止冒泡）。
- **M5 「持续监控」开关无激活态视觉反馈** — `tasks.tsx:54`。styles 中 `monitoring: { borderColor: COLORS.primaryActive }` 已定义但从未使用；toggleMonitoring 无 busy 守卫，快速双击 start/stop 交错。建议激活时应用 monitoring 样式 + 实心铃铛，加 pending 防抖。
- **M6 错误呈现策略不一致，直接吐原始错误串** — `tasks.tsx:21,22,30,35,59,52`；`TaskCardRow.tsx:11`（item.syncError 原样渲染）。被动失败是 11px 内联，主动操作失败是阻断 Alert；`移除失败` 连 instanceof Error 判断都没有。建议统一错误分级，对外文案全部映射中文可操作信息。
- **M7 状态颜色语义混乱 + 进行中无动态指示** — `TaskCardRow.tsx:11`；`presentation.ts:3-11`。颜色只区分 SUCCESS/FAILED/RUNNING，QUEUED/PARTIAL_SUCCESS/CANCELLED/UNKNOWN 全落 warning 黄；RUNNING 无 spinner 只有每秒跳动数字。建议每状态独立颜色/图标；RUNNING 加 ActivityIndicator。
- **M8 每卡每秒定时器 + 排队时长口径失真** — `TaskCardRow.tsx:12-22`；`presentation.ts:34-53`。每活动卡独立 setInterval(1s) 重渲染整卡；`queued = now - createdAt` 把 App 被杀、离线、服务端未受理时间全算进「排队」，用户看到「排队 2小时13分」引发焦虑与重复刷新。建议 timer 上提列表级共享；超阈值改中性文案（「排队较久，最后同步 HH:MM」）。

### 低

- **L1** 无意义的任务 UUID 以主色 11px 占据卡片视觉首位，不可点 — `TaskCardRow.tsx:11`。
- **L2** 时间全部绝对时间到秒，扫视效率低；建议列表用相对时间 — `presentation.ts:17-22`。
- **L3** 状态/错误 11px；`textSubtle #67746d` 在 `#f5f7f6` 上约 3.9:1 低于 WCAG AA — `TaskCardRow.tsx:25`；`theme.ts:8`。
- **L4** 无筛选/分组，失败项被历史成功任务淹没 — `tasks.tsx:57-60`。
- **L5** 删除仅靠卡片角落 12px 小字按钮，无滑动删除（确认弹窗本身做得对）— `TaskCardRow.tsx:11`。
- **L6** 无骨架屏，冷启动只有一行文字随后列表突兀弹入 — `tasks.tsx:60`。

---

## 六、结果（Gallery）与播放

### 高

- **H1 导出/重新下载后界面状态永久冻结，无任何进度订阅或轮询** — `app/video/[id].tsx:62-73、74-84`；`src/tasks/taskCommandService.ts:15-26`。requestExport/requestRedownload 只是把命令入队，页面仅 reloadTaskAndAsset() 刷一次，此刻 exportState 几乎必然还是 QUEUED，因此「已保存」/失败 Alert 实际是永不触发的死代码；按钮停在「保存中…」永久 disabled，导出失败用户永远看不到。详情页无 useFocusEffect、未订阅 taskProjectionEvents。建议订阅事件或轮询驱动 UI；成功/失败用非阻塞 toast；导出中可离开页面后台继续。
- **H2 画廊搜索无防抖且 load 无竞态保护，慢响应覆盖新结果** — `app/(tabs)/gallery.tsx:19-23`。query 是 load 的依赖，useFocusEffect 在回调身份变化时重跑 → 每敲一个字触发 setLoading + 全量分页查询 + enrich（含 extractPoster 原生调用、多次 DB upsert）；load 无序号/AbortController，输入 "cat" 三个请求并发，最旧慢响应最后 resolve 会把列表覆盖回旧结果。建议 query 300ms 防抖；load 内用自增 sequence 丢弃过期响应。
- **H3 删除的作品会被后台 reconciliation “复活”** — `gallery.tsx:25`；`src/media/repository.ts:78`；`src/media/reconciliation.ts:75-87、133-139`。删除只删 media_assets 行 + 本地文件，对应 task 及 artifact 记录仍在；后台 reconcileMediaState 会 `INSERT OR IGNORE` 重建资产（甚至有 recovered-primary-video 兜底）→ 删除的作品稍后无声重现（本地文件已删，状态变「准备中」）。建议引入 deletedAt/tombstone 并在 reconciliation 跳过；确认弹窗说明后果。

### 中

- **M4 播放器没有静音控制** — `unified_video_view.xml:10`；`UnifiedVideoView.kt:38`；`VideoPlayer.tsx:119-131`。控制器只有播放/暂停、进度条、全屏。建议加 mute 按钮（`COMMAND_SET_VOLUME` 已在 MpvPlayer.kt:679-688 支持集内）。
- **M5 详情页不显示下载进度** — `video/[id].tsx:89`。task.downloadProgress 存在且任务页有展示，详情页只有静态「准备中」。建议显示 xx% 或细进度条，标注「可离开页面，下载后台继续」。
- **M6 下载失败（无本地文件）时缺「重新下载」入口** — `video/[id].tsx:74-90`；`VideoPlayer.tsx:126-128`。重新下载只在「本地文件存在且被 probe 证实损坏」时出现；DOWNLOAD_FAILED 且本地无文件时 source 回退远程 URL，URL 过期则播放失败页只有「重试播放/外部播放器」，是死路。
- **M7 远程播放失败错误文案不可行动、无自动重试** — `VideoPlayer.tsx:124-129`。文案「视频播放失败，原件未被判定为损坏」不区分断网/URL 过期/服务器错误；「重试播放」立即重放，网络未恢复注定再失败。建议区分 sourceUnavailable 与 decodeFailed，监听网络恢复自动重试一次。
- **M8 状态过滤器覆盖不全 + enrich 把失败资产永久标成「准备中」** — `gallery.tsx:15、20`；`src/media/types.ts:2`。queued 状态不属于任何过滤器（「准备中」只匹配 downloading）；enrich 将「本地缺失但仍有 sourceUrl」一律改写为 queued，包括永久下载失败的任务 → 永远显示「准备中」，「失败」过滤器几乎匹配不到。建议 filter 增加 queued 或映射 queued+downloading；enrich 结合 downloadState。
- **M9 多选模式交互不完整** — `gallery.tsx:24-27`。长按进入无任何提示；无全选/取消/退出；筛选切换后 selected 不校验，可能保留当前列表看不见的选中项，删除按钮「删除 N」含不可见项。建议进入多选切顶部操作栏；筛选变化清理失效选中；首次长按 toast 提示。
- **M10 竖版视频缩略图被 16:9 硬裁切** — `GalleryCard.tsx:22`。产品明确支持竖版（测试数据 `768p竖`），竖版封面裁成横条主体可能被裁没。建议读 asset.width/height 决定占位比例。
- **M11 完全没有分享功能** — `video/[id].tsx:86-92`；`types.ts:6`（MediaDelivery.target 已定义 'share'/'cloud' 但无 UI）。AI 生成视频的核心诉求之一是分享，当前唯一路径是保存到相册再退出应用分享。建议详情页加「分享」按钮（Share.share + 文件 URI）。
- **M12 详情页 meta 行显示原始英文枚举** — `video/[id].tsx:89`。建议复用任务页 formatTaskStatus。
- **M13 load/loadMore 无错误处理，失败静默显示「暂无视频作品」** — `gallery.tsx:21-22`（try/finally 无 catch）。DB 异常时 promise 变 unhandled rejection，UI 落到「暂无视频作品」误导用户数据没了；无 RefreshControl 弥补。
- **M14 从其他页面返回详情不刷新** — `video/[id].tsx:39-42`。数据只在 mount/id 变化时拉一次，从详情跳任务页触发下载再返回全是旧状态。建议与画廊一致加 useFocusEffect（与 H1 一并解决）。

### 低

- **L15** 无海报占位文案误导：既无 sourceUrl 也无 localPath（实际不可播放）显示「视频就绪」— `GalleryCard.tsx:12`。
- **L16** 空态/加载态简陋：搜索无结果、筛选无结果、真无作品同一句「暂无视频作品」，无 CTA、Footer 无 spinner、无骨架屏 — `gallery.tsx:27`。
- **L17** 复制 Prompt 用 Alert 打断 + 剪贴板回读失败误报「复制失败」— `video/[id].tsx:50-60`。
- **L18** 播放器错误/状态对 TalkBack 不可见：错误覆盖层无 accessibilityLiveRegion、native view 无 accessibility 透传 — `VideoPlayer.tsx:124-130`；`unifiedPlayback.tsx:20-22`。
- **L19** 全屏时 React 侧海报/加载/错误层不可见（playerView 移入独立 Dialog 窗口），首帧前进全屏是纯黑 — `UnifiedVideoView.kt:119-137`。
- **L20** 双击卡片 push 两个详情页（openAsset 无节流）— `gallery.tsx:26`。
- **L21** 页面标题「作品画廊 Gallery」与 tab 名「结果」不一致 — `_layout.tsx:25` vs `gallery.tsx:27`。
- **L22** 海报生成对远程 http URL 也执行 extractPoster（隐性网络下载解码）；被丢弃的旧 posterPath 磁盘文件成孤儿 — `gallery.tsx:20`。
- **L23** 生命周期良好（宿主 pause、耳机拔出自动暂停、keepScreenOn 均正确）；两点提醒：详情页视频在 ScrollView 内，视频上垂直滑动不滚动页面；正常播放时无「外部播放器」入口（仅失败态有）。
- **L24** filters 用 accessibilityRole="radio" 但无 radiogroup 容器；装饰字符 `‹` 会被读屏念出；onLongPress 未注册 accessibility action，多选对读屏用户不可达 — `gallery.tsx:27`；`video/[id].tsx:87`；`GalleryCard.tsx:11`。

---

## 七、设置（Settings）与全局 UI

### 高

- **H1 设置改动无“未保存”保护，视觉状态与持久状态脱节** — `app/(tabs)/settings.tsx:44-70、36`。Switch、解码模式、思考强度点击后 UI 立即变化，但要等滚到底点“保存设置”才写入；中途切 tab 或退出应用改动静默丢失，无 dirty 检测或拦截提示。建议改为即时保存（失败回滚），或保留显式保存但加未保存横幅 + 切 tab 拦截确认。
- **H2 保存按钮固定在长表单最底部，高级面板展开后基本不可达** — `settings.tsx:69`；styles.content paddingBottom: 150。LLM 卡片已很长，展开“高级设置”后新增 5 字段，改完顶部 Token 再找保存按钮需长距离滚动。建议改 sticky 保存栏（可带“未保存更改”高亮态），键盘弹出时随 KeyboardAvoidingView 上移。
- **H3 旧版数据“清除并进入”一键直达，无备份机会、无二次确认** — `app/_layout.tsx:30-38`。检测到 legacy 数据后弹 Alert，点击“清除并进入”（destructive）立即 resetAppDatabase；无导出/备份选项且不可恢复，而代码里已有 `listFullDatabaseBackups`（_layout.tsx:14）能力。对比恢复页（DatabaseRecoveryScreen）都有二次确认，这里反而一步到位。建议 destructive 点击后再确认（含删除数据量统计），或先询问“备份再清除 / 直接清除 / 退出”。

### 中

- **M4 网络配置错误反馈只在保存时全局弹出，不定位字段** — `settings.tsx:36`；`src/settings/validation.ts:24-40`。所有校验在保存后以一条 `Alert.alert('保存失败', message)` 抛出；无内联红字、无字段高亮、不滚动定位。页面已有 scrollResponderScrollNativeHandleToKeyboard 机制（settings.tsx:18-24）但只用于键盘遮挡。建议保存前逐字段校验并内联显示 + 滚动定位。
- **M5 Token / API Key 密文输入无“显示明文”切换** — `settings.tsx:46-47、72`。两类值均 secureTextEntry，无眼睛按钮、无一键粘贴/清空；密文状态无法核对是否复制完整。
- **M6 工作流同步的错误样式与普通提示无法区分** — `WorkflowSyncPanel.tsx:33-34`、styles.note。`同步失败，已安装工作流仍可使用`、partial 错误明细、成功结果全部复用 textMuted 13px，未用 COLORS.danger，也无 accessibilityLiveRegion（成功那行反而有）。建议错误用 danger 色 + 图标 + LiveRegion；同步失败给“重试”强引导。
- **M7 恢复备份只能选“最新”一个，备份列表不可见** — `DatabaseRecoveryScreen.tsx:16、63-73`。backupNames 整个列表传入但 UI 只取 backupNames[0]；用户不知道还有哪些备份、何时创建；最新备份可能就是损坏前的错误状态。建议列出全部备份（名称+时间）供选择。
- **M8 恢复成功后直接退出应用，文案与行为不符** — `DatabaseRecoveryScreen.tsx:67-69`；`_layout.tsx:66-69`。确认弹窗说“随后应用将重新载入”，实际 `BackHandler.exitApp()` 冷退出；恢复中只有按钮文字变“正在恢复…”无进度指示；“清除应用数据”和“退出应用”按钮仍可点（恢复中途可被清库）。建议文案改“恢复完成后需重新打开应用”，恢复中 ActivityIndicator + 禁用全部按钮。
- **M9 设置页缺少数据管理/危险操作分区** — `settings.tsx` 整体 IA。清数据、恢复备份、诊断只存在于启动故障路径，正常运行时用户无入口主动备份或清理（H3 的根因之一）。建议设置页尾部增加“数据”卡片：立即备份、恢复备份、清除数据（均带确认）。
- **M10 多处触摸目标低于 44pt** — `settings.tsx` styles：externalLink minHeight 40、advancedToggle minHeight 40；`WorkflowSyncPanel.tsx` styles：button padding 12（实测约 42-43）。建议统一 minHeight 44（可用 hitSlop 透明扩展）。
- **M11 输入框与未选中选项边框对比度过低** — `settings.tsx` styles：input.borderColor / effortOption.borderColor 用 COLORS.border；`theme.ts:5`（#d7deda）。对比度约 1.2:1，远低于 WCAG 1.4.11 非文本 3:1；未选中 radio 几乎只靠这层边框表明“可点击”。建议边框加深一档或选中态加对勾/主色 2px 描边。
- **M12 DraggableSheet 手势与滚动联动不足** — `DraggableSheet.tsx:103-126、139`；`draggableBottomSheet.ts:21-25`。a) 从 expanded 下滑无论多快，resolveBottomSheetRelease 最多回到 collapsed（只在 collapsed 态判 closed），关闭必须两段式；b) 拖拽热区只有 48px 把手，header 和内容区不可拖；c) 内容 ScrollView 与 sheet 无手势协调，collapsed 时无法通过内容下拉展开/关闭。建议热区扩展至整个 header；expanded 态高速下滑判 closed；内容滚到顶部后继续下拉联动。

### 低

- **L13** 无深色模式，恢复页自成一套深色主题（#020617/#1e293b/#fbbf24 硬编码），两屏切换视觉断裂 — `theme.ts:1-20`；`DatabaseRecoveryScreen.tsx:87-94`。
- **L14** Switch thumbColor 恒为深色近黑，关闭/开启仅靠 track 区分；保存位置 help 文案重复 — `settings.tsx:66`。
- **L15** WorkflowSyncPanel 卡片规格与设置页其他卡片不一致（标题 18/600 vs 16/800；间距 28px 不一致）— `WorkflowSyncPanel.tsx:27-29`。
- **L16** AppHeader 为死代码（全应用无引用）；brand logo 的 accessibilityLabel=“返回生成页”暴露隐藏行为给读屏用户，视觉上无任何提示 — `AppHeader.tsx:9`。
- **L17** 每次保存成功都弹 Alert 打断，文案含平台专有词（Android Keystore）— `settings.tsx:36`。建议改 toast/按钮短暂变“已保存✓”。
- **L18** Tab 栏 label fontSize 11 无 numberOfLines，“Prompt助手”小屏可能折行；选中态仅靠颜色，图标无 filled 切换 — `AppTabs.tsx:35`；`theme.ts:38`。
- **L19** 设置页滚动不收键盘（未设 keyboardDismissMode="on-drag"）— `settings.tsx:44`。
- **L20** legacy 提示期间 Stack 渲染 null，屏幕只剩 Alert 悬浮在纯背景上，建议渲染品牌启动页占位 — `_layout.tsx:77`。
- **L21** 背板隐形关闭按钮对读屏常驻可聚焦（absoluteFill Pressable 盖住整个背板），建议加 importantForAccessibility="no-hide-descendants" — `DraggableSheet.tsx:136`。

---

## 八、正面确认（做得不错的地方）

- 切 tab 状态保留（Tabs 默认挂载）、`keyboardShouldPersistTaps`、提交防重入门闩（submissionGate）、editRevision 防草稿覆盖手改。
- Selector 的 a11y（radiogroup/radio/accessibilityValue）、handoff 错误的 `accessibilityRole="alert"` + 重试路径、按钮触控目标普遍 ≥48px。
- Agent 竞态防护、a11y liveRegion、断点续跑、分页防抖；视频生命周期与原生播放集成（宿主 pause、耳机焦点、全屏切换、重试去重）质量高，测试覆盖扎实。
- 任务删除确认弹窗规范（destructive 样式、说明保留范围）。
- 设置页分组（Token / LLM / 存储 / 解码 / 工作流）与渐进披露（高级面板默认收起）、radiogroup/adjustable 把手/tab 语义 a11y 标注。

## 九、优先级速查

| 优先级 | 问题 | 界面 |
|--------|------|------|
| P0 | 停止按钮误报“已停止生成” | Agent |
| P0 | 导出/下载状态反馈断链（死代码 Alert） | 视频详情 |
| P0 | 设置未保存静默丢失 | 设置 |
| P0 | 旧版数据一键清库无备份 | 全局启动 |
| P1 | 删除作品被后台复活 | 画廊 |
| P1 | 提交成功后表单不重置 → 重复任务 | 生成 |
| P1 | 任务无取消能力 + 下载英文枚举无进度 | 任务队列 |
| P1 | 粘贴 4000 字静默截断 | Agent |
| P2 | 轮询劫持下拉刷新圈 | 任务队列 |
| P2 | 画廊搜索无防抖竞态 | 画廊 |
| P2 | 详情页英文枚举/「一律下载中」/返回文案错误 | 视频详情 |
| P2 | 提交中静默丢输入（伪可编辑状态） | 生成 |
