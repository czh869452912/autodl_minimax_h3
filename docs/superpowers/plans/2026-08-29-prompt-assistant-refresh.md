# Prompt Assistant Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Prompt Assistant as a phone-first, responsive RN workspace with reliable attachments, collapsed tool timeline, copyable H3 Prompt output, local draft export, and improved history management.

**Architecture:** Keep `H3AgUiAgent`, `LocalCopilotKitProvider`, and SQLite persistence as the runtime boundary. Replace the prebuilt visual `CopilotChat` surface with headless `CopilotChat` context plus focused local components, and keep rendering/data transforms in pure helpers so the new UI is testable without a native device.

**Tech Stack:** React Native 0.86, Expo Router 57, CopilotKit React Native 1.69 headless chat context, Expo SQLite, Expo Clipboard, Jest + jest-expo, TypeScript.

---

## File map

- Create `mobile/src/agent/promptParser.ts`: pure extraction of H3 Prompt text from assistant Markdown.
- Create `mobile/src/agent/promptParser.test.ts`: parser fixtures and fallback coverage.
- Create `mobile/src/agent/promptDraft.ts`: local short-lived draft persistence and route payload helpers.
- Create `mobile/src/agent/promptDraft.test.ts`: draft round-trip, expiration, and missing-draft behavior.
- Create `mobile/src/agent/agentPresentation.ts`: normalized message/tool timeline models and session search/grouping helpers.
- Create `mobile/src/agent/agentPresentation.test.ts`: normalization and history helper tests.
- Modify `mobile/src/agent/threadStore.ts`: add optional `customTitle`, idempotent schema upgrade, and attachment count-safe snapshots.
- Modify `mobile/src/agent/threadStore.test.ts`: migration and custom title persistence coverage.
- Create `mobile/src/agent/PromptAssistantUi.tsx`: headless CopilotChat-based responsive shell, timeline, composer, attachment strip, prompt cards, and history variants.
- Create `mobile/src/agent/PromptAssistantUi.test.tsx`: interaction-level rendering tests for copy/export, collapsed timeline, attachments, and composer disabled state.
- Modify `mobile/src/agent/AgentScreen.tsx`: retain config/session runtime orchestration while delegating visual rendering to `PromptAssistantUi`; remove fixed-position attachment overlay and old modal UI.
- Modify `mobile/src/create/CreateForm.tsx`: accept a draft id, hydrate prompt on focus, and preserve existing task submission behavior.
- Modify `mobile/app/(tabs)/create.tsx`: read optional draft id route param and pass it to `CreateForm`.
- Modify `mobile/src/ui/theme.ts`: add local light Prompt Assistant tokens without changing existing dark surfaces used by other tabs.
- Modify `mobile/src/agent/AgentScreen` or `mobile/src/agent/PromptAssistantUi`: use `useWindowDimensions` and safe-area insets for the 720dp sidebar strategy.

## Task 1: Add pure Prompt parsing and draft bridge

**Files:**
- Create: `mobile/src/agent/promptParser.ts`
- Test: `mobile/src/agent/promptParser.test.ts`
- Create: `mobile/src/agent/promptDraft.ts`
- Test: `mobile/src/agent/promptDraft.test.ts`

- [ ] **Step 1: Write failing parser tests** covering a `### H3 Prompt` heading, a fenced code block, a `prompt:` field, and an unrecognized response returning `null` without modifying source text. Use this contract:

  ```ts
  expect(parsePromptResult('### H3 Prompt\nA cat runs.', 'm1')).toEqual({
    promptText: 'A cat runs.', sourceMessageId: 'm1', confidence: 'high',
  });
  expect(parsePromptResult('```text\nA crane shot.\n```', 'm2')?.promptText).toBe('A crane shot.');
  expect(parsePromptResult('prompt: Soft sunrise.', 'm3')?.promptText).toBe('Soft sunrise.');
  expect(parsePromptResult('I need one more detail.', 'm4')).toBeNull();
  ```
- [ ] **Step 2: Run the focused parser test** with `npm test -- --runInBand src/agent/promptParser.test.ts`; verify the new module/tests fail because the parser is absent.
- [ ] **Step 3: Implement `parsePromptResult(content, messageId)`** with the exact public shape below. Keep regex constants private and trim only wrapper whitespace.

  ```ts
  export type PromptParseResult = {
    promptText: string;
    sourceMessageId: string;
    confidence: 'high' | 'medium';
  };

  export function parsePromptResult(content: string, messageId: string): PromptParseResult | null;
  ```

- [ ] **Step 4: Add failing SQLite draft tests** for save/read, one-hour expiration, consume-delete, and unknown id. Instantiate the store with the test database used by other repository tests:

  ```ts
  const store = createPromptDraftStore(db, () => now);
  const saved = await store.save({ prompt: 'A crane shot.', attachmentIds: [] });
  await expect(store.read(saved.id)).resolves.toMatchObject({ prompt: 'A crane shot.' });
  await expect(store.consume(saved.id)).resolves.toMatchObject({ id: saved.id });
  await expect(store.read(saved.id)).resolves.toBeNull();
  ```

- [ ] **Step 5: Implement `promptDraft.ts`** as a definite SQLite repository, not an in-memory alternative. Create `prompt_drafts(id, prompt, attachment_ids_json, created_at)`, delete rows older than one hour before reads, and expose:

  ```ts
  export type PromptDraft = { id: string; prompt: string; attachmentIds: string[]; createdAt: number };
  export function createPromptDraftStore(db: SQLiteDatabase, now?: () => number): {
    save(input: Pick<PromptDraft, 'prompt' | 'attachmentIds'>): Promise<PromptDraft>;
    read(id: string): Promise<PromptDraft | null>;
    consume(id: string): Promise<PromptDraft | null>;
  };
  ```

  Export a module-level `createPromptDraftStore` factory plus `savePromptDraft`/`consumePromptDraft` wrappers only where a screen needs a shared database instance; keep the factory as the test seam.
- [ ] **Step 6: Run both focused test files** and verify PASS.
- [ ] **Step 7: Commit** with `git add mobile/src/agent/promptParser* mobile/src/agent/promptDraft* && git commit -m "feat: add prompt extraction and draft bridge"`.

## Task 2: Normalize messages and upgrade local thread metadata

**Files:**
- Create: `mobile/src/agent/agentPresentation.ts`
- Test: `mobile/src/agent/agentPresentation.test.ts`
- Modify: `mobile/src/agent/threadStore.ts`
- Test: `mobile/src/agent/threadStore.test.ts`

- [ ] **Step 1: Write failing presentation tests** for user/assistant/tool/activity normalization, stable tool id aggregation, collapsed summary text, title search, and today/7-day/older grouping. Pin these examples:

  ```ts
  expect(toolTimelineSummary([{ id: 't1', name: 'skill', status: 'running' }])).toBe('正在分析…');
  expect(toolTimelineSummary([{ id: 't1', name: 'skill', status: 'complete' }])).toBe('已完成 1 个步骤');
  expect(matchesSessionQuery(snapshot, '屋顶')).toBe(true);
  expect(groupSessions(snapshots, now).map((group) => group.label)).toEqual(['今天', '近 7 天', '更早']);
  ```

- [ ] **Step 2: Implement pure presentation helpers** with these exported boundaries; serialize only safe display summaries capped at 160 characters:

  ```ts
  export type ToolTimelineStep = { id: string; name: string; status: 'running' | 'complete' | 'failed'; summary?: string };
  export type PresentationMessage =
    | { id: string; kind: 'user'; text: string; attachments: Array<{ uri: string; filename?: string }> }
    | { id: string; kind: 'assistant'; text: string; prompt: PromptParseResult | null; tools: ToolTimelineStep[] };
  export function normalizeMessages(messages: readonly unknown[]): PresentationMessage[];
  export function toolTimelineSummary(steps: readonly ToolTimelineStep[]): string;
  export function sessionTitle(snapshot: LocalThreadSnapshot): string;
  export function matchesSessionQuery(snapshot: LocalThreadSnapshot, query: string): boolean;
  export function groupSessions(snapshots: readonly LocalThreadSnapshot[], now: number): SessionGroup[];
  ```

- [ ] **Step 3: Extend `LocalThreadSnapshot` with `customTitle?: string`** and add an idempotent migration. Read `PRAGMA table_info(agent_threads)` and only run the statement when `custom_title` is absent:

  ```ts
  db.execSync('ALTER TABLE agent_threads ADD COLUMN custom_title TEXT');
  ```
- [ ] **Step 4: Update save/load/list mapping** to persist `customTitle` while retaining automatic first-user-message title fallback and existing credential sanitization.
- [ ] **Step 5: Add migration and custom-title tests** alongside existing store tests; prove old schema rows load with `customTitle: undefined` and new titles survive a round trip.
- [ ] **Step 6: Run `npm test -- --runInBand src/agent/agentPresentation.test.ts src/agent/threadStore.test.ts`** and verify PASS.
- [ ] **Step 7: Commit** with `git add mobile/src/agent/agentPresentation* mobile/src/agent/threadStore* && git commit -m "feat: normalize assistant timeline and thread metadata"`.

## Task 3: Build the responsive headless assistant UI

**Files:**
- Create: `mobile/src/agent/PromptAssistantUi.tsx`
- Test: `mobile/src/agent/PromptAssistantUi.test.tsx`
- Modify: `mobile/src/ui/theme.ts`

- [ ] **Step 1: Write component tests** around an injected view model instead of a real network runtime. Assert the collapsed summary, send disabled state, and result actions with stable accessibility labels:

  ```ts
  expect(getByLabelText('发送消息').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(getByLabelText('展开处理过程'));
  expect(getByText('skill')).toBeTruthy();
  fireEvent.press(getByText('复制 Prompt'));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('A crane shot.');
  ```

- [ ] **Step 2: Implement `PromptAssistantUi` shell** using `useWindowDimensions`, `useSafeAreaInsets`, and flex layout. Use one boolean and one data source for both history variants:

  ```ts
  const wide = width >= 720;
  return wide
    ? <View style={styles.wide}><HistorySidebar {...historyProps} /><ConversationPane {...chatProps} /></View>
    : <View style={styles.phone}><ConversationPane {...chatProps} /><HistorySheet {...historyProps} /></View>;
  ```
- [ ] **Step 3: Implement `ConversationTimeline`** with a single `FlatList`, normalized user/assistant/tool rows, auto-scroll on content changes, and bottom inset derived from measured Composer height rather than fixed offsets.
- [ ] **Step 4: Implement `AssistantMessage` and `ToolTimeline`** using the existing `react-native-streamdown`/Copilot Markdown primitive where available; use collapsed summaries by default and a local expanded id set.
- [ ] **Step 5: Implement `PromptResultCard`** with `expo-clipboard` copy feedback and the concrete export signature below; render “复制 Prompt” and “导出 Prompt 到生成” actions with light tokens.

  ```ts
  type PromptResultCardProps = {
    result: PromptParseResult;
    onExport: (prompt: string) => Promise<void>;
  };
  ```
- [ ] **Step 6: Implement `AttachmentStrip`** with horizontal scrolling, thumbnail preview modal, upload/error states, retry/removal actions, and no absolute positioning over the composer. Keep the filename and message supplied to `attachments.onUploadFailed` in local UI state because `useAttachments` removes failed placeholders; “重试” reopens the picker and clears that failure row, while “移除” only clears it.
- [ ] **Step 7: Implement `Composer`** with multiline input, add attachment action, send/cancel state, keyboard-aware natural layout, and suggestions for the empty state.
- [ ] **Step 8: Implement `HistorySheet/Sidebar`** with search, grouped sessions, new-thread, rename, delete confirmation, and active-thread styling.
- [ ] **Step 9: Run focused UI tests** with `npm test -- --runInBand src/agent/PromptAssistantUi.test.tsx`; verify PASS and correct any RN test-environment assumptions.
- [ ] **Step 10: Commit** with `git add mobile/src/agent/PromptAssistantUi* mobile/src/ui/theme.ts && git commit -m "feat: add responsive prompt assistant workspace"`.

## Task 4: Integrate the new UI with runtime and history orchestration

**Files:**
- Modify: `mobile/src/agent/AgentScreen.tsx`
- Test: `mobile/src/agent/AgentScreen.test.tsx` (create if no existing screen test)

- [ ] **Step 1: Add an integration test** asserting a configured agent mounts `PromptAssistantUi` with the active snapshot, session changes update the selected id, and snapshot writes remain serialized. Mock only `readSettings`, `createH3Agent`, and SQLite; keep session callbacks real.
- [ ] **Step 2: Keep config validation and `ReadyAgent` session loading** in `AgentScreen`, but replace the old visual component with the headless boundary:

  ```tsx
  <CopilotChat agentId={agent.agentId} attachments={attachmentConfig}>
    <PromptAssistantUi {...screenProps} />
  </CopilotChat>
  ```

  Remove the old modal, `SessionBar`, fixed `AttachmentBridge`, and all `bottom: 196/206/256` styles.
- [ ] **Step 3: Wire `useAttachments` through headless context** so text and ready attachments are submitted by the same runtime call; make upload-in-progress block sending and picker cancellation a no-op.
- [ ] **Step 4: Wire rename/delete/search callbacks** to the thread store and preserve the existing destructive confirmation behavior.
- [ ] **Step 5: Run `npm test -- --runInBand src/agent/AgentScreen.test.tsx src/agent/PromptAssistantUi.test.tsx`** and verify PASS.
- [ ] **Step 6: Commit** with `git add mobile/src/agent/AgentScreen.tsx mobile/src/agent/AgentScreen.test.tsx && git commit -m "refactor: integrate responsive assistant screen"`.

## Task 5: Connect Prompt export to the generation form

**Files:**
- Modify: `mobile/app/(tabs)/create.tsx`
- Modify: `mobile/src/create/CreateForm.tsx`
- Modify: `mobile/src/agent/promptDraft.ts`
- Test: `mobile/src/create/createForm.test.ts`

- [ ] **Step 1: Add failing tests** for draft hydration, missing draft fallback, and preserving manually edited prompt after initial hydration. Extract and test a small controller helper if mounting Expo Router makes the test brittle.
- [ ] **Step 2: Add `draftId` to the create route params** and pass it to `CreateForm` without changing task payload construction:

  ```tsx
  const { draftId } = useLocalSearchParams<{ draftId?: string | string[] }>();
  return <CreateForm draftId={Array.isArray(draftId) ? draftId[0] : draftId} />;
  ```
- [ ] **Step 3: Hydrate `CreateForm` prompt** from `consumePromptDraft(draftId)` on mount/focus, showing a non-blocking inline notice when the id is missing or expired.
- [ ] **Step 4: Wire `PromptResultCard.onExport`** to save the draft and navigate with a short id instead of Prompt text:

  ```ts
  const draft = await promptDraftStore.save({ prompt, attachmentIds: [] });
  router.navigate({ pathname: '/(tabs)/create', params: { draftId: draft.id } });
  ```
- [ ] **Step 5: Run `npm test -- --runInBand src/create/createForm.test.ts src/agent/promptDraft.test.ts`** and verify PASS.
- [ ] **Step 6: Commit** with `git add mobile/app/(tabs)/create.tsx mobile/src/create/CreateForm.tsx mobile/src/create/createForm.test.ts mobile/src/agent/promptDraft.ts && git commit -m "feat: export prompt drafts to generator"`.

## Task 6: Full verification and polish

**Files:**
- Modify only files identified by test/lint output.

- [ ] **Step 1: Run `npm run typecheck`** from `mobile`; fix all TypeScript errors, especially CopilotKit context and route-param types.
- [ ] **Step 2: Run `npm test -- --runInBand`** from `mobile`; fix regressions without weakening existing tests.
- [ ] **Step 3: Run `git diff --check`** and inspect the complete diff for accidental fixed pixel offsets, duplicated scroll containers, dark-theme leakage, or credential persistence.
- [ ] **Step 4: Build the Android debug APK** with `cd mobile/android; ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a`; record success or the exact environment blocker.
- [ ] **Step 5: Perform manual device checks** at narrow portrait, large portrait, and landscape widths: keyboard/composer boundary, attachment strip, tool collapse, copy/export, history Sheet/sidebar, and safe-area spacing.
- [ ] **Step 6: Commit final polish only if verification required code changes.** Stage each verified source/test path explicitly, exclude the pre-existing `mobile/android/gradle.properties` edit unless this task intentionally changed it, then run `git commit -m "chore: verify prompt assistant refresh"`. If Steps 1–5 required no changes, do not create an empty commit.

## Coverage check against spec

- Layout and responsive behavior: Task 3.
- Headless runtime and single scroll area: Tasks 3–4.
- Attachment states and cancellation: Tasks 3–4.
- Collapsed tool timeline: Tasks 2–3.
- Prompt parser, copy card, and export draft: Tasks 1, 3, and 5.
- History search/grouping/rename/delete and custom title: Tasks 2–4.
- Error placement and safe serialization: Tasks 2–4.
- Unit, component, typecheck, Android build, and manual verification: Task 6.

## Plan self-review

- No unresolved placeholders remain; the only explicit first-phase limitation is that `attachmentIds` stays empty by product decision.
- Names are consistent across tasks: `PromptResultCard.onExport` calls the draft store's `save` method (or its screen-level `savePromptDraft` wrapper), and create consumes the same draft through the store's `consume` method (or `consumePromptDraft` wrapper).
- Existing `submitTask` payload and dark-themed non-agent tabs remain out of scope.
