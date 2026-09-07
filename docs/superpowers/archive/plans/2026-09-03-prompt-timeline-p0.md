# Prompt Timeline P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Prompt Timeline preserve the reader's viewport and provide complete P0 recovery actions: back to latest, inline failure/abort with retry, assistant copy, and actionable empty-state suggestions.

**Architecture:** Move bottom-follow decisions into a small pure scroll-state module and let `ConversationTimeline` scroll only while follow mode is active. Keep run issues in the thread-keyed `AgentSession` above persisted model messages; retry invokes the CopilotKit core on the existing last user message so it does not append a duplicate bubble.

**Tech Stack:** TypeScript 6.0, React 19, React Native FlatList 0.86, CopilotKit React Native/Core 1.69, Expo Clipboard 57, Jest 29, react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-09-03-post-merge-stabilization-design.md`

---

## Execution Rules

- Implement after the Prompt data-correctness plan because this plan relies on generation-safe runtimes and normalized history rows.
- Complete Tasks 1-5 in order, using RED -> GREEN -> focused regression -> commit.
- Never persist `runIssue` as a model message and never pass it to the LLM.
- A retry reruns the existing conversation state; it must not call `submitMessage(lastText)` or append another user message.
- Empty-state suggestions fill and focus the composer only; they do not start a paid/external model request.

## File Map

| Path | Responsibility |
|---|---|
| `mobile/src/agent/timelineScroll.ts` | New pure bottom-distance/follow-state transitions |
| `mobile/src/agent/PromptAssistantUi.tsx` | Timeline follow UI, per-thread run issue, retry/copy/suggestion actions |
| `mobile/src/agent/AgentScreen.tsx` | Distinguish runtime persistence notice from agent run failure and expose retry |
| `mobile/src/agent/LocalCopilotKitProvider.tsx` | Reuse the same local core for an existing-message rerun |
| `mobile/src/agent/PromptAssistantUi.test.tsx` | Component regressions for all Timeline P0 behavior |

## Task 1: Model bottom-aware scrolling as pure state

**Files:**

- Create: `mobile/src/agent/timelineScroll.ts`
- Create: `mobile/src/agent/timelineScroll.test.ts`

- [ ] **Step 1: Write RED scroll-state tests**

Use actual React Native scroll metric names:

```typescript
import { bottomDistance, nextFollowState } from './timelineScroll';

const metrics = (y: number, viewport = 500, content = 1000) => ({
  contentOffset: { y },
  layoutMeasurement: { height: viewport },
  contentSize: { height: content },
});

test('treats positions within 48 px as bottom', () => {
  expect(bottomDistance(metrics(452))).toBe(48);
  expect(nextFollowState(true, { type: 'scroll', metrics: metrics(452) })).toBe(true);
});

test('user drag disables follow until metrics return to bottom', () => {
  expect(nextFollowState(true, { type: 'drag-start' })).toBe(false);
  expect(nextFollowState(false, { type: 'scroll', metrics: metrics(100) })).toBe(false);
  expect(nextFollowState(false, { type: 'scroll-end', metrics: metrics(500) })).toBe(true);
});

test('explicit back-to-latest restores follow', () => {
  expect(nextFollowState(false, { type: 'back-to-latest' })).toBe(true);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/agent/timelineScroll.test.ts
```

Expected: FAIL because `timelineScroll.ts` does not exist.

- [ ] **Step 3: Implement the pure transition module**

Create exact contracts that do not import React:

```typescript
export type TimelineMetrics = {
  contentOffset: { y: number };
  layoutMeasurement: { height: number };
  contentSize: { height: number };
};

export type FollowEvent =
  | { type: 'drag-start' }
  | { type: 'scroll' | 'scroll-end'; metrics: TimelineMetrics }
  | { type: 'back-to-latest' };

export const FOLLOW_BOTTOM_THRESHOLD = 48;

export function bottomDistance(metrics: TimelineMetrics): number {
  return Math.max(
    metrics.contentSize.height - metrics.layoutMeasurement.height - metrics.contentOffset.y,
    0,
  );
}

export function nextFollowState(current: boolean, event: FollowEvent): boolean {
  if (event.type === 'drag-start') return false;
  if (event.type === 'back-to-latest') return true;
  return bottomDistance(event.metrics) <= FOLLOW_BOTTOM_THRESHOLD;
}
```

- [ ] **Step 4: Run the test and commit**

Run:

```powershell
npm test -- --runInBand src/agent/timelineScroll.test.ts
git diff --check
git add src/agent/timelineScroll.ts src/agent/timelineScroll.test.ts
git commit -m "test: define prompt timeline follow state"
```

Expected: the suite PASSes with boundary assertions at 47, 48, and 49 pixels.

## Task 2: Guard Timeline auto-scroll and add back-to-latest

**Files:**

- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`

- [ ] **Step 1: Replace the weak auto-scroll test with RED behavior tests**

Mock a `FlatList` ref exposing `scrollToEnd`, then cover both states:

```typescript
const timelineRows = (text: string) => normalizeMessages([
  { id: 'assistant-1', role: 'assistant', content: text },
]);
const metricsEvent = (y: number, viewport: number, content: number) => ({
  contentOffset: { y }, layoutMeasurement: { height: viewport }, contentSize: { height: content },
});
const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => undefined);
const renderTimeline = (timelineRowsValue: ReturnType<typeof normalizeMessages>, isRunning: boolean) => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <ConversationTimeline rows={timelineRowsValue} isRunning={isRunning} onExportPrompt={() => Promise.resolve()} />,
    );
  });
  return tree;
};

it('does not follow streamed size changes after the user drags away from bottom', () => {
  const tree = renderTimeline(timelineRows('first'), true);
  const list = tree.root.findByType(FlatList);
  act(() => list.props.onScrollBeginDrag());
  act(() => list.props.onScroll({ nativeEvent: metricsEvent(100, 500, 1200) }));
  scrollToEnd.mockClear();
  act(() => list.props.onContentSizeChange(320, 1400));
  expect(scrollToEnd).not.toHaveBeenCalled();
  expect(tree.root.findByProps({ accessibilityLabel: '回到最新消息' })).toBeTruthy();
});

it('returns to latest and resumes follow mode', () => {
  const tree = renderTimeline(timelineRows('first'), true);
  const list = tree.root.findByType(FlatList);
  act(() => list.props.onScrollBeginDrag());
  act(() => list.props.onScroll({ nativeEvent: metricsEvent(100, 500, 1200) }));
  act(() => tree.root.findByProps({ accessibilityLabel: '回到最新消息' }).props.onPress());
  expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
  scrollToEnd.mockClear();
  act(() => list.props.onContentSizeChange(320, 1400));
  expect(scrollToEnd).toHaveBeenCalled();
});
```

Restore `FlatList.prototype.scrollToEnd` in `afterEach` so the spy cannot leak into unrelated UI tests.

Also assert `onLayout` and a changed assistant `timelineSignature` do not scroll while detached.

- [ ] **Step 2: Run the UI suite and confirm RED**

Run:

```powershell
npm test -- --runInBand src/agent/PromptAssistantUi.test.tsx
```

Expected: FAIL because all signature, content-size, and layout changes unconditionally call `scrollToEnd` and no back-to-latest control exists.

- [ ] **Step 3: Gate every automatic scroll source**

In `ConversationTimeline`, add:

```typescript
const [followingLatest, setFollowingLatest] = useState(true);
const followingLatestRef = useRef(true);
const setFollow = useCallback((value: boolean) => {
  followingLatestRef.current = value;
  setFollowingLatest(value);
}, []);
const scrollIfFollowing = useCallback((animated = true) => {
  if (followingLatestRef.current) listRef.current?.scrollToEnd({ animated });
}, []);
```

Wire `onScrollBeginDrag`, throttled `onScroll`, `onMomentumScrollEnd`, and `onScrollEndDrag` through `nextFollowState`. Gate the signature effect, `onContentSizeChange`, and `onLayout` through `scrollIfFollowing`. Set `scrollEventThrottle={16}`.

Render this control as a sibling overlay of the `FlatList`, not as a list row:

```tsx
{!followingLatest ? (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="回到最新消息"
    onPress={() => {
      setFollow(true);
      listRef.current?.scrollToEnd({ animated: true });
    }}
    style={styles.backToLatest}
  >
    <AppIcon name="arrow_downward" size={16} color={LIGHT_PROMPT_COLORS.ink} />
    <Text style={styles.backToLatestText}>回到最新</Text>
  </Pressable>
) : null}
```

Wrap the list and overlay in a `View` with `flex: 1`; preserve current `timeline` and `timelineContent` styles.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npm test -- --runInBand src/agent/timelineScroll.test.ts src/agent/PromptAssistantUi.test.tsx
git diff --check
git add src/agent/PromptAssistantUi.tsx src/agent/PromptAssistantUi.test.tsx
git commit -m "fix: preserve prompt timeline viewport"
```

Expected: both suites PASS; content/layout changes never move a detached viewport.

## Task 3: Show per-thread run issues and retry without duplicating input

**Files:**

- Modify: `mobile/src/agent/AgentScreen.tsx`
- Modify: `mobile/src/agent/LocalCopilotKitProvider.tsx`
- Modify: `mobile/src/agent/LocalCopilotKitProvider.test.ts`
- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`

- [ ] **Step 1: Add RED tests for failure, abort, isolation, and retry**

Add a local-core helper test:

```typescript
it('reruns an existing agent without appending a user message', async () => {
  const agent = { agentId: 'h3-prompt-assistant', messages: [{ id: 'u1', role: 'user', content: 'same' }] };
  const core = createLocalCopilotKitCore(agent as never) as never as { runAgent: jest.Mock };
  await rerunLocalAgent(agent as never);
  expect(core.runAgent).toHaveBeenCalledWith({ agent });
  expect(agent.messages).toHaveLength(1);
});
```

Update the existing `CopilotKitCoreReact` Jest constructor mock to return `{ config, runAgent: jest.fn(async () => undefined) }`; the RED failure must be the missing `rerunLocalAgent` export, not an incomplete test double.

Export the shared UI-only issue type from `PromptAssistantUi.tsx`, then add component tests:

```typescript
export type RunIssue = { kind: 'error' | 'aborted'; message: string };

const basePromptProps = {
  threads: [{ threadId: 't1', messages: [], state: {}, createdAt: 1, updatedAt: 1 }],
  activeThreadId: 't1',
  onSelect: () => undefined,
  onNew: () => undefined,
  onDelete: () => undefined,
  onRename: () => undefined,
  onExportPrompt: () => Promise.resolve(),
};

function PromptIssueHarness({
  initialIssue = null,
  onRetry = async () => undefined,
}: {
  initialIssue?: RunIssue | null;
  onRetry?: () => Promise<void>;
}) {
  const [runIssue, setRunIssue] = React.useState<RunIssue | null>(initialIssue);
  return (
    <PromptAssistantUi
      {...basePromptProps}
      runIssue={runIssue}
      onRunIssueChange={setRunIssue}
      onRetry={onRetry}
    />
  );
}

function renderPromptUi(initialIssue: RunIssue | null = null, onRetry = async () => undefined) {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<PromptIssueHarness initialIssue={initialIssue} onRetry={onRetry} />); });
  return tree;
}

function renderedText(tree: ReturnType<typeof create>): string[] {
  return tree.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
}

it('renders an inline retry for the last failed round', async () => {
  const onRetry = jest.fn(async () => undefined);
  const tree = renderPromptUi({ kind: 'error', message: '网络失败' }, onRetry);
  expect(tree.root.findByProps({ accessibilityLabel: '重试上一轮' })).toBeTruthy();
  await act(async () => tree.root.findByProps({ accessibilityLabel: '重试上一轮' }).props.onPress());
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(mockChatContext.submitMessage).not.toHaveBeenCalled();
});

it('renders an aborted inline issue after stop', () => {
  mockChatContext = { ...mockChatContext, isRunning: true, agent: { abortRun: jest.fn() } };
  const tree = renderPromptUi();
  act(() => tree.root.findByProps({ accessibilityLabel: '停止生成' }).props.onPress());
  expect(tree.root.findByProps({ accessibilityLabel: '重试上一轮' })).toBeTruthy();
  expect(renderedText(tree)).toContain('已停止生成');
});

it('resets issue state when the thread-keyed session changes', () => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<PromptIssueHarness key="thread-1" initialIssue={{ kind: 'error', message: '旧错误' }} />);
  });
  expect(renderedText(tree)).toContain('旧错误');
  act(() => {
    tree.update(<PromptIssueHarness key="thread-2" />);
  });
  expect(renderedText(tree)).not.toContain('旧错误');
});
```

The key-change test mirrors the existing `AgentSession key={activeSnapshot.threadId}` boundary and proves UI issue state cannot cross threads.

- [ ] **Step 2: Run provider/UI tests and confirm RED**

Run:

```powershell
npm test -- --runInBand src/agent/LocalCopilotKitProvider.test.ts src/agent/PromptAssistantUi.test.tsx
```

Expected: FAIL because run errors are collapsed into the top notice and there is no existing-message rerun boundary.

- [ ] **Step 3: Add a narrow existing-message rerun helper**

In `LocalCopilotKitProvider.tsx` export:

```typescript
export async function rerunLocalAgent(agent: AbstractAgent): Promise<void> {
  await createLocalCopilotKitCore(agent).runAgent({ agent });
}
```

In `AgentSession`, import `RunIssue` from `PromptAssistantUi.tsx`, keep persistence errors in `notice`, and route provider `onError` into `runIssue`:

```typescript
const [runIssue, setRunIssue] = useState<RunIssue | null>(null);

<LocalCopilotKitProvider
  agent={agent}
  onError={(reason) => setRunIssue({ kind: 'error', message: reason.message })}
>
  <CopilotChat ...>
    <PromptAssistantUi
      {...uiProps}
      notice={notice}
      runIssue={runIssue}
      onRunIssueChange={setRunIssue}
      onRetry={async () => {
        setRunIssue(null);
        await rerunLocalAgent(agent);
      }}
    />
  </CopilotChat>
</LocalCopilotKitProvider>
```

Because `AgentSession` is keyed by `snapshot.threadId`, issue state is isolated per mounted thread and is never persisted. Extend the `PromptAssistantUi` props with `runIssue?: RunIssue | null`, `onRunIssueChange?: (issue: RunIssue | null) => void`, and `onRetry?: () => Promise<void>`; default the callbacks to no-ops so existing primitive tests stay concise.

- [ ] **Step 4: Render and manage the inline issue**

Remove `stopNotice`. Call `onRunIssueChange(null)` at the start of a new submit. On stop, call `agent.abortRun?.()` and then `onRunIssueChange({ kind: 'aborted', message: '已停止生成' })`. Keep a local `retrying` boolean only for disabling the retry button while `onRetry` is in flight.

Pass issue state into `ConversationTimeline` and render after the last message:

```tsx
function RunIssueRow({ issue, retrying, onRetry }: {
  issue: RunIssue;
  retrying: boolean;
  onRetry: () => Promise<void>;
}) {
  return (
    <View accessibilityRole="alert" style={styles.runIssue}>
      <Text style={styles.runIssueText}>{issue.message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重试上一轮"
        disabled={retrying}
        onPress={() => void onRetry()}
      >
        <Text style={styles.runIssueAction}>{retrying ? '正在重试…' : '重试'}</Text>
      </Pressable>
    </View>
  );
}
```

Do not call `submitMessage` from `onRetry`; the existing last user message already includes its attachment content in `agent.messages`.

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/agent/LocalCopilotKitProvider.test.ts src/agent/PromptAssistantUi.test.tsx src/agent/runtimeStore.test.ts src/agent/aguiAgent.test.ts
git diff --check
git add src/agent/AgentScreen.tsx src/agent/LocalCopilotKitProvider.tsx src/agent/LocalCopilotKitProvider.test.ts src/agent/PromptAssistantUi.tsx src/agent/PromptAssistantUi.test.tsx
git commit -m "fix: add inline prompt run recovery"
```

Expected: all four suites PASS; the user-message count and IDs are unchanged after retry.

## Task 4: Add assistant copy and actionable suggestions

**Files:**

- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`

- [ ] **Step 1: Add RED action tests**

```typescript
it('copies only the selected assistant body', async () => {
  const rows = normalizeMessages([
    { id: 'a1', role: 'assistant', content: '第一条' },
    { id: 'a2', role: 'assistant', content: '第二条' },
  ]);
  const tree = renderTimeline(rows, false);
  await act(async () => tree.root.findByProps({ accessibilityLabel: '复制回答 a2' }).props.onPress());
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('第二条');
});

it('fills and focuses the composer without submitting a suggestion', async () => {
  const focus = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<PromptAssistantUi {...basePromptProps} />, {
      createNodeMock: (element) => element.type === TextInput ? { focus } : {},
    });
  });
  act(() => tree.root.findByProps({ accessibilityLabel: '使用建议 一镜到底的城市夜跑' }).props.onPress());
  expect(tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.value).toBe('一镜到底的城市夜跑');
  expect(focus).toHaveBeenCalledTimes(1);
  expect(mockChatContext.submitMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the UI suite and confirm RED**

Run:

```powershell
npm test -- --runInBand src/agent/PromptAssistantUi.test.tsx
```

Expected: FAIL because assistant rows have no copy action and suggestions are plain `Text` nodes.

- [ ] **Step 3: Implement row copy and suggestion fill**

For non-empty assistant text, render a row action:

```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel={`复制回答 ${item.id}`}
  onPress={() => void Clipboard.setStringAsync(item.text)}
  style={styles.assistantCopy}
>
  <AppIcon name="content_copy" size={14} color={LIGHT_PROMPT_COLORS.muted} />
  <Text style={styles.assistantCopyText}>复制</Text>
</Pressable>
```

Change `EmptyTimeline` to receive `onSelectSuggestion`, map constants without quote characters, and render `Pressable` chips. In the parent:

```typescript
const applySuggestion = useCallback((value: string) => {
  setDraft(value);
  setInputSelection({ start: value.length, end: value.length });
  requestAnimationFrame(() => inputRef.current?.focus());
}, []);
```

Pass the callback through `ConversationTimeline` to `EmptyTimeline`. Do not invoke `handleSubmit`.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npm test -- --runInBand src/agent/PromptAssistantUi.test.tsx src/agent/agentPresentation.test.ts
git diff --check
git add src/agent/PromptAssistantUi.tsx src/agent/PromptAssistantUi.test.tsx
git commit -m "fix: complete prompt timeline actions"
```

Expected: both suites PASS; clipboard receives only assistant body text and tapping a suggestion produces no model call.

## Task 5: Run Timeline P0 acceptance and final regression

**Files:**

- Modify: `docs/superpowers/verification/2026-09-03-post-merge-stabilization.md`

- [ ] **Step 1: Run the automated Timeline slice**

Run:

```powershell
cd mobile
npm test -- --runInBand src/agent/timelineScroll.test.ts src/agent/PromptAssistantUi.test.tsx src/agent/LocalCopilotKitProvider.test.ts src/agent/agentPresentation.test.ts src/agent/runtimeStore.test.ts src/agent/aguiAgent.test.ts
npm run typecheck
npm test -- --runInBand
git diff --check
```

Expected: every command exits 0; no open-handle warning and no test relies only on the presence of callback props.

- [ ] **Step 2: Record emulator interaction evidence**

Append timestamped results for:

1. Start a long streaming response while at bottom; Timeline follows new content.
2. Drag upward until an older message is centered; streamed deltas, tool rows, keyboard show/hide, and layout changes leave that message stationary.
3. Tap `回到最新`; the list reaches the end and resumes following.
4. Trigger a provider error; an inline issue appears after the last round and retry does not duplicate the user bubble or its attachments.
5. Stop a running response; an inline stopped row appears and can retry the same round.
6. Copy an assistant response; clipboard content contains its body only.
7. Tap each empty-state suggestion; composer is focused and populated, and generation begins only after tapping Send.

- [ ] **Step 3: Commit final verification evidence**

Run:

```powershell
git add ../docs/superpowers/verification/2026-09-03-post-merge-stabilization.md
git commit -m "test: verify prompt timeline p0"
git status --short
```

Expected: the verification commit succeeds and the working tree is clean.
