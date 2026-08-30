# Prompt Composer Keyboard and Image Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Prompt Assistant composer stay visible above the Android keyboard, move image/send controls below the multiline input, and support cursor-aware `@` references to uploaded images without changing the existing attachment submission contract.

**Architecture:** Keep `PromptAssistantUi` as the owner of draft text, cursor selection, mention metadata, and sheet visibility. Add a pure `imageMentions` helper for insertion/range reconciliation so behavior is unit-testable. Keep provider/gallery attachments as the source of truth for sending; the mention sheet derives selectable rows from ready image attachments and only stores local presentation metadata.

**Tech Stack:** React Native 0.86, Expo Router 57, TypeScript, Jest with `react-test-renderer`, existing `Modal`, `TextInput`, `ScrollView`, and safe-area primitives.

---

## 1. Add tested mention insertion and reconciliation helpers

**Files:**
- Create `mobile/src/agent/imageMentions.ts`.
- Create `mobile/src/agent/imageMentions.test.ts`.

- [ ] **RED — write pure-function tests first.** Add tests for `insertImageMention(text, selection, attachment)` that cover insertion at the beginning, middle, and end of a draft; replacement of a non-empty selection; a token label formatted as `@` plus the attachment display name followed by one separating space; and a returned cursor immediately after the inserted token.
- [ ] **RED — cover range bookkeeping.** Test that insertion shifts every later `ImageMention.start/end`, leaves earlier ranges unchanged, and allows the same attachment to be referenced twice. Test `reconcileImageMentions` drops records whose attachment ID no longer exists or whose range no longer matches its label in the edited text.
- [ ] **GREEN — implement the helper.** Export:
  ```ts
  export type ImageMention = {
    attachmentId: string;
    label: string;
    start: number;
    end: number;
  };
  export type MentionAttachment = { id: string; filename?: string };
  export function insertImageMention(
    text: string,
    selection: { start: number; end: number },
    attachment: MentionAttachment,
    mentions: ImageMention[],
  ): { text: string; mention: ImageMention; mentions: ImageMention[]; selection: { start: number; end: number } };
  export function reconcileImageMentions(
    text: string,
    mentions: ImageMention[],
    attachmentIds: Set<string>,
  ): ImageMention[];
  ```
  Derive a readable name by removing the final filename extension and falling back to `图片`; insert `@${name} `, replace the captured selection, and shift overlapping/later ranges conservatively. Reconciliation must never throw on malformed ranges.
- [ ] Run `cd mobile; npm test -- --runInBand src/agent/imageMentions.test.ts`; confirm the initial run is red before implementation and green afterward. Commit as `test: cover prompt image mention ranges` and then `feat: add prompt image mention helpers`.

## 2. Remove the Android double keyboard lift

**Files:**
- Modify `mobile/src/agent/PromptAssistantUi.tsx`.
- Modify `mobile/src/agent/PromptAssistantUi.test.tsx`.

- [ ] **RED — update keyboard regression tests.** Replace the old screen-coordinate padding assertions with a test that renders `PromptAssistantUi` under Android and asserts the root padding bottom is only `Math.max(insets.bottom, 8)` (with mocked bottom inset `0`, expect `8`), and retains `KeyboardAvoidingView.behavior === undefined`. Add an iOS render assertion that `behavior === 'padding'` and `keyboardVerticalOffset === 0`.
- [ ] **GREEN — simplify layout ownership.** Remove the Android `Keyboard` listeners, `keyboardScreenY` state, `useWindowDimensions` height dependency used only for keyboard math, and `getKeyboardAvoidancePadding`. Set root `paddingBottom: Math.max(insets.bottom, 8)`; keep the existing iOS `KeyboardAvoidingView` padding behavior and Android `adjustResize` reliance. Preserve width-based responsive sidebar behavior by retaining the width dimension value.
- [ ] Run the focused UI test file and `cd mobile; npm run typecheck`; commit as `fix: rely on resized viewport for android composer`.

## 3. Recompose the composer into input plus bottom toolbar

**Files:**
- Modify `mobile/src/agent/PromptAssistantUi.tsx`.
- Modify `mobile/src/agent/PromptAssistantUi.test.tsx`.

- [ ] **RED — assert the new accessible structure.** Extend `Composer` tests to find the multiline input, then assert `添加图片附件`, `引用图片附件`, and `发送消息` are sibling toolbar controls rendered after the input. Assert the send control remains disabled for an empty draft with no ready attachments and while any attachment is uploading.
- [ ] **GREEN — change `Composer` props and markup.** Add `onOpenMentionPicker`, `inputRef`, `selection`, and `onSelectionChange` props. Render `AttachmentStrip`, then a dedicated multiline input area, then a toolbar row with add-image, `@`, and trailing send/stop controls. Keep existing picker behavior, max length, submit behavior, and attachment removal. Give the `@` control `accessibilityLabel="引用图片附件"`; keep controls tappable while the keyboard is open. Update styles so the input occupies the upper area and toolbar is visually below it without changing the existing maximum input height.
- [ ] Add tests for toolbar ordering using the rendered host tree and for selection callbacks forwarding the native `{ start, end }` range. Run the focused Jest file and typecheck; commit as `feat: place composer actions below prompt input`.

## 4. Add the uploaded-image mention bottom sheet and cursor insertion

**Files:**
- Modify `mobile/src/agent/PromptAssistantUi.tsx`.
- Modify `mobile/src/agent/PromptAssistantUi.test.tsx`.

- [ ] **RED — test sheet states and selection flow.** Render `PromptAssistantUi` with ready and uploading attachments. Verify the sheet is initially hidden, opens from `引用图片附件`, lists only ready images with thumbnails and filename labels, shows the `先上传图片附件` empty state when none are ready, and exposes an add-image action in that state. Verify backdrop/close and `onRequestClose` dismiss without changing text.
- [ ] **RED — test insertion and focus.** Mock a `TextInput` ref, set a non-zero selection through `onSelectionChange`, select a listed image, and assert the draft contains the visual `@附件名` token at that selection, the sheet closes, and `focus()` is called. Select the same image twice to prove repeated references work. Remove an attachment and assert its mention metadata is removed.
- [ ] **GREEN — implement the sheet.** Add a local `mentionSheetOpen`, `inputSelection`, `mentions`, and `TextInput` ref in `PromptAssistantUi`. Derive candidates from `attachments` plus `galleryAttachments` where `status === 'ready'`; never expose uploading rows. Add an animated, transparent `Modal` with bottom-aligned rounded sheet, handle, dimmed backdrop, close button, `FlatList` rows, thumbnail, filename, and accessible selection labels. Selecting a candidate must verify it still exists, call `insertImageMention`, update draft/mentions/selection, close the sheet, and refocus the input. Empty state’s add-image action reuses `handleOpenPicker` and leaves the sheet dismissible.
- [ ] Reconcile mention ranges on ordinary text edits and clear records when `onRemoveAttachment` removes their ID. Keep mention labels in submitted prompt text; do not alter provider APIs. Commit as `feat: add uploaded image mention sheet`.

## 5. Preserve all-ready-attachment sending and cover end-to-end composer behavior

**Files:**
- Modify `mobile/src/agent/PromptAssistantUi.test.tsx`.
- Modify `mobile/src/agent/PromptAssistantUi.tsx` only where integration fixes are needed.

- [ ] Add an integration test with one provider-ready attachment and one gallery-ready attachment, reference only one with `@`, press send, and assert the optimistic user row contains both images, `agent.setPendingAttachments` receives the gallery image through the existing local-upload bridge, and `submitMessage` receives the unchanged prompt text. This proves the provider-owned image is not dropped while preserving the current provider API contract.
- [ ] Add a regression test that changing text after a mention preserves valid metadata and that sending includes the visual mention text unchanged.
- [ ] Run `cd mobile; npm test -- --runInBand src/agent/PromptAssistantUi.test.tsx src/agent/imageMentions.test.ts`; confirm all focused tests pass. Commit as `test: cover prompt composer mention flow`.

## 6. Verify the release-quality Android behavior

**Files:** No source changes expected; use the implementation files above.

- [ ] Run `cd mobile; npm run typecheck` and `npm test -- --runInBand`; expect TypeScript success and the complete Jest suite to pass with no route-test regressions.
- [ ] Run `cd mobile; npx expo export --platform android --output-dir C:\Users\Administrator\AppData\Local\Temp\autodl-h3-composer-export-check`; expect a successful Android bundle export.
- [ ] If an adb target is connected, install/launch the current debug build and manually verify: keyboard opens without lifting the composer excessively, input remains visible, toolbar is below input, picker upload appears in the strip, `@` sheet slides from the bottom, uploading rows are unavailable, selecting an image inserts at the cursor, and send submits all ready attachments. Capture a screenshot or log the observed device result.
- [ ] Review `git diff --check`, inspect the final rendered layout, and record any emulator limitation explicitly before declaring completion.
