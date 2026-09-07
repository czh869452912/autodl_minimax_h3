# Prompt Data Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Prompt assistant attachments, history ordering/counts, and runtime ownership deterministic so UI identity never collides and stale runtimes cannot overwrite an active conversation.

**Architecture:** Allocate attachment identity through one collision-resistant, occupied-set-aware helper used by both native picker mapping and composer merge. Centralize session sorting/title/count presentation as pure helpers, and change the runtime registry to one generation-owned entry per thread with explicit async disposal and eviction.

**Tech Stack:** TypeScript 6.0, React 19, React Native 0.86, CopilotKit React Native 1.69, Jest 29, react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-09-03-post-merge-stabilization-design.md`

---

## Execution Rules

- Implement after the durable-media plan or in a separate worktree based on the same reviewed commit.
- Complete Tasks 1-4 in order, using RED -> GREEN -> focused regression -> commit.
- Do not change persisted thread schema or rewrite stored custom titles.
- Do not depend on `Date.now()` alone for either IDs or fallback filenames.
- Runtime disposal must revoke write authority before awaiting abort, flush, or unsubscribe work.

## File Map

| Path | Responsibility |
|---|---|
| `mobile/src/agent/assistantImagePicker.ts` | Unique assistant attachment allocation and picker conversion |
| `mobile/src/native/imagePicker.ts` | Unique fallback filenames for native multi-select assets |
| `mobile/src/agent/PromptAssistantUi.tsx` | Collision-safe merge and history presentation consumption |
| `mobile/src/agent/agentPresentation.ts` | Stable history sort, display title, and normalized message count |
| `mobile/src/agent/AgentScreen.tsx` | Canonical sorted thread state and runtime eviction on lifecycle events |
| `mobile/src/agent/runtimeStore.ts` | One write-authoritative runtime generation per thread |

## Task 1: Make attachment IDs and fallback names unique

**Files:**

- Modify: `mobile/src/agent/assistantImagePicker.ts`
- Modify: `mobile/src/agent/assistantImagePicker.test.ts`
- Modify: `mobile/src/native/imagePicker.ts`
- Modify: `mobile/src/native/imagePicker.test.ts`
- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`

- [ ] **Step 1: Add RED tests for same-millisecond selection and cross-source collision**

Add multi-select cases with a fixed clock and deliberately colliding injected IDs:

```typescript
it('allocates unique IDs when every candidate ID collides', async () => {
  const attachments = await pickAssistantImages('gallery', 3, {
    pickGallery: async () => [
      { uri: 'file:///1.jpg', name: '1.jpg', mimeType: 'image/jpeg', size: 1 },
      { uri: 'file:///2.jpg', name: '2.jpg', mimeType: 'image/jpeg', size: 1 },
      { uri: 'file:///3.jpg', name: '3.jpg', mimeType: 'image/jpeg', size: 1 },
    ],
    pickFiles: async () => [],
    read: async (file) => ({ type: 'data', value: file.uri, mimeType: file.mimeType }),
    createId: () => 'same-id',
  });
  expect(attachments.map((item) => item.id)).toEqual(['same-id', 'same-id-2', 'same-id-3']);
  expect(new Set(attachments.map((item) => item.id))).toHaveSize(3);
});
```

In `native/imagePicker.test.ts`, omit all `fileName` values and assert three distinct names ending in `.jpg`. In `PromptAssistantUi.test.tsx`, return a gallery attachment whose ID equals an existing provider attachment, remove the gallery chip, and assert the provider attachment and its mention remain.

- [ ] **Step 2: Run the three focused suites and confirm RED**

Run:

```powershell
cd mobile
npm test -- --runInBand src/agent/assistantImagePicker.test.ts src/native/imagePicker.test.ts src/agent/PromptAssistantUi.test.tsx
```

Expected: FAIL because `createId()` and the native fallback both use an unqualified millisecond value and the composer concatenates arrays without collision repair.

- [ ] **Step 3: Implement occupied-set-aware allocation**

Add this pure allocator in `assistantImagePicker.ts`:

```typescript
export function allocateUniqueAttachmentId(candidate: string, occupied: Set<string>): string {
  const base = candidate.trim() || 'assistant-image';
  let value = base;
  let suffix = 2;
  while (occupied.has(value)) value = `${base}-${suffix++}`;
  occupied.add(value);
  return value;
}

let attachmentSequence = 0;
function defaultAttachmentId(): string {
  attachmentSequence += 1;
  return `assistant-image-${Date.now().toString(36)}-${attachmentSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
```

Allocate all IDs synchronously before starting `Promise.all`, using one `occupied` set for the returned batch. Export a `mergeUniqueAssistantAttachments(current, incoming, occupiedIds)` helper that reallocates incoming collisions without mutating existing IDs. Use it inside the functional `setGalleryAttachments` update with IDs from CopilotKit provider attachments.

In `native/imagePicker.ts`, create one batch token per launch and include the array index:

```typescript
const batch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
return assets.map((asset, index) => ({
  uri: asset.uri,
  name: asset.fileName?.trim() || `image-${batch}-${index + 1}.jpg`,
  mimeType: asset.mimeType ?? 'image/jpeg',
  size: asset.fileSize ?? 0,
}));
```

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/agent/assistantImagePicker.test.ts src/native/imagePicker.test.ts src/agent/PromptAssistantUi.test.tsx src/agent/imageMentions.test.ts
git diff --check
git add src/agent/assistantImagePicker.ts src/agent/assistantImagePicker.test.ts src/native/imagePicker.ts src/native/imagePicker.test.ts src/agent/PromptAssistantUi.tsx src/agent/PromptAssistantUi.test.tsx
git commit -m "fix: guarantee prompt attachment identity"
```

Expected: all four suites PASS; deletion and mention selection affect exactly one attachment.

## Task 2: Centralize history ordering, count, and disambiguation

**Files:**

- Modify: `mobile/src/agent/agentPresentation.ts`
- Modify: `mobile/src/agent/agentPresentation.test.ts`
- Modify: `mobile/src/agent/AgentScreen.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`

- [ ] **Step 1: Add RED pure-helper tests**

Add two snapshots with identical derived titles and raw tool messages:

```typescript
const snapshotWith = (threadId: string, firstText: string, createdAt: number): LocalThreadSnapshot => ({
  threadId,
  messages: [{ id: `${threadId}-user`, role: 'user', content: firstText }] as never,
  state: {},
  createdAt,
  updatedAt: createdAt,
});

it('sorts every group by activity and thread id', () => {
  const sameTimeA = { ...snapshot(now), threadId: 'a' };
  const sameTimeB = { ...snapshot(now), threadId: 'b' };
  const older = { ...snapshot(now - 1), threadId: 'z' };
  expect(groupSessions([older, sameTimeB, sameTimeA], now)[0].snapshots.map((item) => item.threadId))
    .toEqual(['a', 'b', 'z']);
});

it('counts normalized timeline rows rather than raw tool records', () => {
  const thread = {
    ...snapshot(now),
    messages: [
      { id: 'u', role: 'user', content: '猫' },
      { id: 'a', role: 'assistant', content: '完成', toolCalls: [{ id: 'tc', function: { name: 'skill' } }] },
      { id: 'tool', role: 'tool', toolCallId: 'tc', content: 'done' },
    ] as never,
  };
  expect(sessionMessageCount(thread)).toBe(2);
});

it('disambiguates only duplicate derived titles', () => {
  const threads = [snapshotWith('a', '相同标题', 1000), snapshotWith('b', '相同标题', 2000)];
  expect(sessionDisplayTitle(threads[0], threads)).toMatch(/^相同标题 · /);
  expect(sessionDisplayTitle(threads[0], threads)).not.toBe(sessionDisplayTitle(threads[1], threads));
  expect(sessionDisplayTitle({ ...threads[0], customTitle: '我的命名' }, threads)).toBe('我的命名');
});
```

Add a component assertion that the history row shows `2 条消息`, not the raw array length `3`.

- [ ] **Step 2: Run presentation/UI tests and confirm RED**

Run:

```powershell
npm test -- --runInBand src/agent/agentPresentation.test.ts src/agent/PromptAssistantUi.test.tsx
```

Expected: FAIL because grouping preserves input order, count uses `messages.length`, and duplicate derived titles have no qualifier.

- [ ] **Step 3: Implement and consume pure history helpers**

Add:

```typescript
export function sortSessionSnapshots(values: readonly LocalThreadSnapshot[]): LocalThreadSnapshot[] {
  return [...values].sort((left, right) =>
    right.updatedAt - left.updatedAt || left.threadId.localeCompare(right.threadId),
  );
}

export function sessionMessageCount(snapshot: LocalThreadSnapshot): number {
  return normalizeMessages(snapshot.messages).length;
}

export function sessionDisplayTitle(
  snapshot: LocalThreadSnapshot,
  siblings: readonly LocalThreadSnapshot[],
): string {
  const title = sessionTitle(snapshot);
  if (snapshot.customTitle?.trim()) return title;
  const duplicates = siblings.filter((item) => !item.customTitle?.trim() && sessionTitle(item) === title);
  if (duplicates.length < 2) return title;
  const created = new Date(snapshot.createdAt).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  return `${title} · ${created} · ${snapshot.threadId.slice(-4)}`;
}
```

Sort snapshots at the start of `groupSessions` before bucketing. In `AgentScreen`, call `sortSessionSnapshots` after initial load, create, rename, and snapshot updates. In `HistoryList`, use `sessionDisplayTitle(thread, threads)` and `sessionMessageCount(thread)`. Keep the header title and rename input on `sessionTitle` so the non-persisted qualifier is never saved.

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/agent/agentPresentation.test.ts src/agent/PromptAssistantUi.test.tsx src/agent/threadStore.test.ts
git diff --check
git add src/agent/agentPresentation.ts src/agent/agentPresentation.test.ts src/agent/AgentScreen.tsx src/agent/PromptAssistantUi.tsx src/agent/PromptAssistantUi.test.tsx
git commit -m "fix: stabilize prompt session history"
```

Expected: all three suites PASS and stored `custom_title` values are unchanged.

## Task 3: Give each thread one authoritative runtime generation

**Files:**

- Modify: `mobile/src/agent/runtimeStore.ts`
- Modify: `mobile/src/agent/runtimeStore.test.ts`
- Modify: `mobile/src/agent/AgentScreen.tsx`
- Modify: `mobile/src/agent/aguiAgent.ts`
- Modify: `mobile/src/agent/aguiAgent.test.ts`

- [ ] **Step 1: Add RED generation and disposal tests**

Make `fakeAgent.subscribe` track unsubscription and `abortRun` calls, then add:

```typescript
it('revokes the old generation before replacing a thread config', async () => {
  const agents: ReturnType<typeof fakeAgent>[] = [];
  const registry = createPromptRuntimeRegistry(() => {
    const agent = fakeAgent();
    agents.push(agent);
    return agent as never;
  });
  const first = registry.ensure(config, snapshot('thread-1'), store);
  registry.ensure({ ...config, model: 'new-model' }, snapshot('thread-1'), store);
  agents[0].emitMessages([{ id: 'late', role: 'assistant', content: 'late' }], {});
  await first.flush();
  expect(agents[0].abortRun).toHaveBeenCalledTimes(1);
  expect(saveMock).not.toHaveBeenCalledWith(expect.objectContaining({ messages: [{ id: 'late' }] }));
});

it('flushes, unsubscribes, and removes every runtime for an evicted thread', async () => {
  const runtime = registry.ensure(config, snapshot('thread-1'), store);
  (runtime.agent as never as ReturnType<typeof fakeAgent>).emitMessages([{ id: 'm', role: 'user', content: 'saved' }], {});
  await registry.evictThread('thread-1');
  expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1' }));
  expect(runtime.disposed()).toBe(true);
  expect(registry.size()).toBe(0);
});
```

Add an agent test confirming `dispose`/`abortRun` cancels an active graph stream and clears pending attachments.

- [ ] **Step 2: Run runtime/agent tests and confirm RED**

Run:

```powershell
npm test -- --runInBand src/agent/runtimeStore.test.ts src/agent/aguiAgent.test.ts
```

Expected: FAIL because the registry is keyed by config+thread forever and exposes no disposal or eviction methods.

- [ ] **Step 3: Replace the registry map with thread-owned entries**

Use these public contracts:

```typescript
export type PromptRuntime = {
  agent: H3AgUiAgent;
  getSnapshot(): LocalThreadSnapshot;
  updateMetadata(snapshot: LocalThreadSnapshot): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
  disposed(): boolean;
  subscribe(listener: (event: RuntimeEvent) => void): () => void;
};

export type PromptRuntimeRegistry = {
  ensure(config: PromptAgentConfig, initial: LocalThreadSnapshot, store: LocalThreadStore): PromptRuntime;
  evictThread(threadId: string): Promise<void>;
  disposeAll(): Promise<void>;
  size(): number;
};
```

Store `{ configKey, generation, runtime, saveTail }` by `threadId`. When `ensure` sees a different config key, synchronously revoke the old generation before installing the new entry. Capture its already-pending snapshot, abort and unsubscribe, and enqueue that final snapshot on the thread's shared `saveTail`; initialize the new runtime with that promise as its save barrier. Every new-generation save is appended after the barrier, so the old final flush can never overwrite newer state. Every `persist`, `emit`, and timer callback must check both `active` and the captured generation before mutating snapshot, notifying listeners, or enqueuing another save.

Capture the subscription returned by `agent.subscribe` and call `unsubscribe()` during disposal. Extend `H3AgUiAgent` with a narrow `dispose()` that aborts the current controller, empties pending attachments, and clears the consume callback. `dispose()` awaits the captured final save and the pre-existing save tail, but late agent events after revocation are discarded before they can enter that tail.

- [ ] **Step 4: Wire configuration and deletion lifecycle**

In `ReadyAgent`, dispose the registry when the config-keyed component unmounts:

```typescript
useEffect(() => () => { void promptRuntimeRegistry.disposeAll(); }, []);
```

Delete a session in this order so a final flush cannot recreate the deleted row:

```typescript
await promptRuntimeRegistry.evictThread(threadId);
await threadStore.remove(threadId);
const next = sortSessionSnapshots(await threadStore.list());
```

When `AgentSession` unsubscribes from UI events, do not dispose the runtime merely because the user switched threads; inactive thread state remains resumable until configuration change, deletion, or screen teardown.

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
npm test -- --runInBand src/agent/runtimeStore.test.ts src/agent/aguiAgent.test.ts src/agent/PromptAssistantUi.test.tsx src/agent/threadStore.test.ts
npm run typecheck
git diff --check
git add src/agent/runtimeStore.ts src/agent/runtimeStore.test.ts src/agent/AgentScreen.tsx src/agent/aguiAgent.ts src/agent/aguiAgent.test.ts
git commit -m "fix: fence prompt runtime generations"
```

Expected: all tests and typecheck PASS; a late event from a replaced runtime produces neither a snapshot event nor a database save.

## Task 4: Run the Prompt data acceptance matrix

**Files:**

- Modify: `docs/superpowers/verification/2026-09-03-post-merge-stabilization.md`

- [ ] **Step 1: Run the complete automated slice**

Run:

```powershell
cd mobile
npm test -- --runInBand src/agent/assistantImagePicker.test.ts src/native/imagePicker.test.ts src/agent/imageMentions.test.ts src/agent/agentPresentation.test.ts src/agent/runtimeStore.test.ts src/agent/aguiAgent.test.ts src/agent/threadStore.test.ts src/agent/PromptAssistantUi.test.tsx
npm run typecheck
git diff --check
```

Expected: all commands exit 0 without open-handle warnings.

- [ ] **Step 2: Record emulator checks**

Append timestamped evidence for:

1. Select at least three gallery images in one action; every chip has a distinct key/display name and removing the second keeps the first and third.
2. Add one provider-picker image and one gallery image; `@图片1`/`@图片2` resolve to the correct thumbnails after removing either item.
3. Create two conversations with the same first user text; history rows are distinguishable, sorted by most recent activity, and open the correct `threadId`.
4. Run a tool-using conversation; the history count matches visible Timeline user/assistant rows and excludes hidden tool-result records.
5. Change LLM model while a response is streaming; the old stream stops and never overwrites the reopened conversation.
6. Delete a conversation during or immediately after generation; it stays deleted after navigating away and back.

- [ ] **Step 3: Commit verification evidence**

Run:

```powershell
git add ../docs/superpowers/verification/2026-09-03-post-merge-stabilization.md
git commit -m "test: verify prompt data correctness"
git status --short
```

Expected: the verification commit succeeds and the working tree is clean.
