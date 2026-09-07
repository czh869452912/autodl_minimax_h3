# Prompt 助手页面刷新设计

## 目标

把 Prompt 助手从“第三方聊天组件外包的页面”升级为手机优先、清爽、自适应的创作工作区。核心路径是：输入创意 → 上传参考图片 → 经过少量追问 → 得到可复制的 H3 Prompt，并可将 Prompt 草稿导出到现有生成页。第一阶段不自动提交任务，也不把对话附件绑定到生成任务。

## 已确认的产品决策

- 主要优化 Android 手机端，同时支持平板和横屏自适应。
- 视觉方向：参考小云雀的暖白留白、黑色主文字、低对比灰层级、大圆角输入面板；不照搬首页内容布局。
- Prompt 结果卡片提供“复制 Prompt”和“导出 Prompt 到生成”两个操作。
- “导出 Prompt 到生成”只把文本带回生成页的 Prompt 区，不自动提交任务；预留 `attachmentIds` 字段但第一阶段为空。
- 附件以输入框上方横向缩略图条呈现，支持预览、移除、上传中和失败状态。
- 时间线默认折叠为一行状态摘要，点击后查看步骤；不默认展开冗长 JSON。
- 历史记录使用手机底部 Sheet；达到宽屏断点后切换为左侧栏。

## 页面结构

```text
AgentScreen
└── PromptAssistantShell (safe-area + responsive constraints)
    ├── ConversationHeader
    │   ├── HistoryTrigger
    │   ├── CurrentThreadTitle
    │   └── NewThreadButton
    ├── ConversationTimeline (唯一纵向滚动区)
    │   ├── EmptyState + suggestion chips
    │   ├── UserMessage
    │   ├── AssistantMessage (Markdown + fallback copy)
    │   ├── ToolTimeline (collapsed by default)
    │   └── PromptResultCard
    ├── ComposerDock (natural layout, keyboard/safe-area aware)
    │   ├── AttachmentStrip (horizontal scroll)
    │   └── ComposerRow (add, input, send/cancel)
    └── HistorySheet / HistorySidebar (responsive variant)
```

`ConversationTimeline` 是页面唯一的聊天滚动容器。Composer 不再通过绝对定位叠加到聊天内容上，而是作为壳层底部自然布局的一部分；附件条占据真实高度，输入框根据文本行数增长但设置上限。这样不同分辨率、字体缩放和键盘高度不会依赖固定 `bottom` 偏移。

手机宽度下使用单列，内容区域内部设置可读的 `maxWidth` 并居中；宽屏达到 720dp 时，历史记录变为左侧栏，聊天正文仍保持窄阅读宽度。断点是布局策略而不是固定尺寸，所有卡片、按钮和缩略图使用 flex、百分比、最小/最大约束。

## 视觉系统

Prompt 页面局部使用暖白背景（例如 `#FAFAF7`）、近黑文字、灰色分隔线和少量黑色强调；不复用全局深色设置页的靛紫主按钮。状态色只用于成功、警告和失败提示。圆角、留白和层级优先于阴影，避免层层嵌套卡片。

- Header：紧凑、低对比，当前标题单行截断；新对话为轻量图标按钮。
- 用户消息：浅灰背景的紧凑圆角块，靠右对齐但不占满宽度。
- 助手消息：无厚重气泡，直接使用 Markdown 排版；代码块和列表保持清晰的行高与内边距。
- 结果卡片：白底/细边框、标题和 Prompt 正文分层；操作栏固定在卡片底部，复制为次级按钮，导出为黑色主按钮。
- Composer：大圆角白色面板，附件条在输入行上方；发送按钮在不可发送时降级为低对比，不遮挡文本。

## 数据流与组件职责

### Runtime 与会话

继续使用 `H3AgUiAgent`、`LocalCopilotKitProvider` 和 SQLite `LocalThreadStore`。展示层通过 headless `CopilotChat` 上下文消费 `messages`、`isRunning`、`submitMessage` 和附件方法，不再使用第三方预制的完整聊天 UI。会话切换时先恢复快照，再挂载对应 Agent；消息变化继续串行写入本地存储。

`LocalThreadSnapshot` 增加可选 `customTitle`，SQLite 表通过幂等的可空 `custom_title` 列升级保存该值；已有会话无需重写。标题为空时继续从第一条用户消息生成。历史搜索覆盖自定义标题、自动标题和用户消息文本。附件数量从已发送消息内容汇总得到，仅用于历史列表摘要。

### 消息规范化

在渲染前把 Agent 消息映射为展示模型：

- `user`：文本和已发送附件预览。
- `assistant`：Markdown 正文、运行状态、复制操作。
- `tool` / `activity`：按稳定 tool id 聚合为 `ToolTimelineStep`。
- 其他未知条目：不阻塞消息流，以紧凑的可读 fallback 展示或忽略不可渲染元数据。

工具步骤不直接展示完整参数和结果 JSON。运行中和完成后都默认显示“正在分析…”或“已完成 N 个步骤”；只有用户点击后才展开步骤名、顺序、进行中/完成/失败状态和截断摘要。

### Prompt 解析与结果卡片

解析器只对 assistant 文本做纯函数处理，优先级如下：

1. 标题匹配 `H3 Prompt`、`最终 Prompt` 等约定标题后的正文。
2. fenced code block 中的主要文本内容。
3. 明确的 `prompt:` 字段。

解析结果包含 `promptText`、`sourceMessageId` 和 `confidence`。高置信度结果渲染 `PromptResultCard`；无法识别时保留普通 Markdown，并提供“复制整段”兜底。解析器不改写原文，避免误删模型解释。

“复制 Prompt”通过 `expo-clipboard` 复制 `promptText`，按钮显示短暂成功态。“导出 Prompt 到生成”写入本地短生命周期草稿：

```ts
type PromptDraft = {
  id: string;
  prompt: string;
  attachmentIds: string[]; // first phase: []
  createdAt: number;
};
```

随后跳转 `/(tabs)/create` 并携带草稿 id。生成页读取草稿后填入现有 `CreateForm` 的 Prompt 状态；草稿不存在时回退为空输入并显示非阻塞提示。第一阶段不携带图片、不改变 `submitTask` 参数，也不自动提交。

### 附件

`AttachmentStrip` 复用 `useAttachments` 的上传、移除和消费能力，accept 仍限制为图片。每项包含缩略图、文件名/状态、预览入口和移除入口：

- `uploading`：显示进度或 spinner，发送按钮禁用。
- `ready`：显示缩略图，可点击预览。
- `failed`：保留错误短文案，提供重试和移除。
- picker 取消：清理 pending callback，不新增附件。

附件条使用水平 `ScrollView`，不会覆盖 Composer 或消息；附件错误紧贴对应缩略图显示。附件消费与文本提交由同一个 headless `submitMessage` 调用完成。

## 历史管理

手机端 `HistorySheet` 使用最高 80% 可用高度的底部抽屉，顶部包含搜索框、新对话按钮和关闭按钮。列表按“今天 / 近 7 天 / 更早”分组；每项显示标题、最近更新时间、消息数和附件数。当前项用细边框或小标记强调，不使用高饱和整块背景。

每项支持点击切换；更多菜单支持重命名和删除，删除保留二次确认。搜索为空时显示清晰空态和清除入口。宽屏把同一数据和操作渲染为 `HistorySidebar`，不复制另一套状态机。

## 错误与边界

- 缺少或无效 LLM 配置：保留页面级配置提示，不挂载聊天 UI。
- 模型请求失败：在本轮 assistant 消息下显示错误和重试操作，不遮挡 Composer。
- 附件失败：状态留在附件条，可重试/移除，其他附件和输入继续可用。
- 复制失败：在结果卡片显示轻量错误态，不弹全屏 Alert。
- 草稿导出失败：卡片内显示失败并保留 Prompt 文本。
- SQLite 读写失败：使用现有页面级错误回调，避免静默丢失。
- 长文本、超长文件名和不可序列化 tool content：截断展示但保留可复制原文，渲染不得抛异常。

## 测试与验收

### 单元/组件测试

- Prompt 解析器覆盖标题、代码块、字段和无法识别回退。
- Prompt 草稿存取、过期和缺失回退。
- 会话标题、搜索、分组和附件数量计算。
- 工具消息聚合、稳定 id、进行中/完成/失败状态。
- 附件取消、上传失败、重试、移除和发送禁用条件。
- 复制和导出按钮调用正确文本/路由参数。

### 手工验收

1. Android 窄屏、常见大屏和横屏：Composer 始终在可见区域，键盘和底部导航不遮挡。
2. 输入多行文本、添加多张图片、上传中和失败时，时间线不会跳动或出现第二个滚动条。
3. 流式回答过程中时间线摘要稳定；展开后步骤顺序正确，完成后默认折叠。
4. 识别到 H3 Prompt 时结果卡片出现，复制内容精确；导出后生成页 Prompt 自动填入且不自动提交。
5. 历史 Sheet 可搜索、切换、新建、重命名、删除；宽屏侧栏与手机 Sheet 使用同一数据结果。

## 第一阶段明确不做

- 不自动创建 AutoDL 任务。
- 不把对话中的图片自动绑定到生成页素材列表。
- 不引入新的远程同步或账号级历史。
- 不 fork 或修改 `@copilotkit/react-native` 依赖源码。
