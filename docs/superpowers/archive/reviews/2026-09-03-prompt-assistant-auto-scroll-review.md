# Prompt 助手页面自动滚动打断用户上滑问题审查

> 审查时间：2026-09-03
> 审查对象：`mobile/src/agent/PromptAssistantUi.tsx` 的 `ConversationTimeline` 组件自动滚动逻辑。
> 现象：当 timeline 较长且已生成"prompt 导入框"（`PromptResultCard`）时，用户向上滑动想回到顶部，滑到一半即触发"生成时自动拉到最底部"的逻辑，被动画拉回底部，上滑被打断。
> 审查方法：通读 `ConversationTimeline` 源码；对 `mobile/` 全目录 grep `onScroll` / `isAtBottom` / `stickToBottom` / `userScrolling` / `maintainVisibleContentPosition` 等贴底检测与滚动监听关键词；核对 `@copilotkit/react-native` 库内聊天组件的滚动逻辑是否参与渲染。

## 1. 总体结论

问题根因明确：**自动滚动是完全无条件的、且对用户当前滚动位置零感知**。`ConversationTimeline` 中三个触发点（消息签名 effect、`onContentSizeChange`、`onLayout`）都直接调用 `scrollToEnd({ animated: true })`，没有任何"用户是否贴底"的判断。用户上滑本身反而会通过 FlatList 窗口化渲染喂给触发器，生成期间每个流式 delta 也会高频触发反向滚动动画。

## 2. 代码证据

自动滚动全部集中在 `ConversationTimeline`（`PromptAssistantUi.tsx:392-483`），共 3 个触发点 + 1 个滚动函数：

| # | 触发点 | 位置 | 说明 |
|---|---|---|---|
| 1 | 消息签名 effect | `PromptAssistantUi.tsx:412-414` | 依赖 `timelineSignature`（:402-408，每条消息 `id:text:工具步骤状态` 拼接而成）。流式生成期间**每个 delta token、每次工具状态翻转**都会改变签名 → 重新执行 `scrollToEnd`；`isRunning` 切换（开始/结束）也各触发一次 |
| 2 | `onContentSizeChange` | `PromptAssistantUi.tsx:423` | 内容尺寸一变即滚到底。触发源包括：Markdown 随流式重排、`RunningIndicator` footer 挂载/卸载（:428，随 `isRunning` 切换）、`PromptResultCard`（"生成好的 prompt 导入框"）挂载增高、`ToolTimeline` 展开等 |
| 3 | `onLayout` | `PromptAssistantUi.tsx:424` | FlatList 自身 frame 变化即触发。键盘弹起/收起（Android `keyboardDidShow` 监听 :101-113 + `keyboardPadding` :114-125）、顶部 notice 横幅出现/消失（:322-327）、composer 增高等 |

滚动函数本体（`PromptAssistantUi.tsx:409-411`）：

```tsx
const scrollToLatest = useCallback(() => {
  listRef.current?.scrollToEnd({ animated: true });
}, []);
```

三个触发点全部无条件执行，且带 `animated: true`——滚动动画会与用户手势/惯性滚动产生反向对抗。

## 3. "向上滑动被打断"的两条触发路径

1. **流式签名链（生成期间，最高频）**：上滑的同时流式输出仍在继续，每个 token 改变 `timelineSignature` → effect（:412-414）触发 → 反向 `scrollToEnd` 动画（典型频率几百毫秒一次），直接打断手势与惯性滚动。
2. **内容尺寸链（用户自己喂给触发器，最隐蔽）**：上滑时 FlatList 窗口化渲染会重新挂载更多 row → contentSize 变化 → `onContentSizeChange`（:423）→ `scrollToEnd`。即**用户的滚动动作本身就会触发自动滚动**。`PromptResultCard` 挂载增高（改变 contentSize）同理。

另有布局链（键盘、横幅、composer 高度变化期间 `onLayout` 连发）作为补充触发源。

## 4. 缺失的能力（grep 全量确认）

- 该 FlatList（:416-424）**没有传 `onScroll`**，也无 `scrollEventThrottle`、`onMomentumScrollBegin/End` 等任何滚动事件监听。
- **没有任何贴底检测**：无 `scrollTop + clientHeight >= scrollHeight - threshold` 类判断，无 `isAtBottom` / `stickToBottom` / `userScrolling` 状态（`mobile/src` 全目录 grep 均无命中）。
- 未使用 RN 原生 `maintainVisibleContentPosition`（全仓库 grep 无命中）。
- 排除干扰项：`@copilotkit/react-native` 库内聊天组件虽有同样的自动滚动，但本项目 `AgentScreen.tsx:1` 导入的是根包 headless 版 `CopilotChat`（不渲染库内 FlatList），库内滚动逻辑为死代码。页面唯一自动滚动即应用自己的 `ConversationTimeline`。

## 5. 测试锁定说明

`mobile/src/agent/PromptAssistantUi.test.tsx:347-356`（"auto-scrolls when streamed output changes size"）明确断言 `onContentSizeChange` / `onLayout` 存在并触发滚动——该行为是有意实现且有测试锁定的。修复时需同步更新该测试（改为断言"贴底时滚动、用户离开底部时不打断"）。

## 6. 修复建议（未改动代码）

标准做法二选一（推荐前者，改动小且可控）：

1. **贴底守卫**：给 FlatList 加 `onScroll`（`scrollEventThrottle` 16ms）计算贴底状态（`offsetY + layoutHeight >= contentHeight - threshold`），配合 `onScrollBeginDrag` / `onMomentumScrollEnd` 维护 `stickToBottom` 标志；三个触发点仅在 `stickToBottom` 时执行。用户上滑即置 false，直到手动滑回底部或点击"回到最新"才恢复。
2. **原生保持视口**：改用 FlatList 的 `maintainVisibleContentPosition`，由 RN 原生在内容头部变化时保持用户视口（本列表非 `inverted`，需验证该属性在非倒置列表上的平台表现）。

无论哪种方案，都需同步改造 `PromptAssistantUi.test.tsx:347-356` 的既有断言。
