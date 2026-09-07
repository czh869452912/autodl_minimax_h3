# Rich Image Mentions and Draggable Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render uploaded-image references as thumbnail/name tokens, pin send to the toolbar’s trailing edge, and make history and mention drawers draggable with compact and near-full-screen snap points.

**Architecture:** Keep the existing native `TextInput` as the editable source of truth and add a pointer-transparent rich mirror that renders valid mention ranges as thumbnail/name tokens while ordinary text remains unchanged. Extract a shared `DraggableBottomSheet` with an animated translateY and pure snap-resolution helper; both history and image-mention drawers use it, with their own scrollable content inside.

**Tech Stack:** React Native 0.86, Expo Router 57, TypeScript, `Animated`, `PanResponder`, `Modal`, `TextInput`, `ScrollView`, Jest with `react-test-renderer`.

---

### Task 1: Define and test bottom-sheet snap decisions

**Files:**
- Create: `mobile/src/ui/draggableBottomSheet.ts`
- Create: `mobile/src/ui/draggableBottomSheet.test.ts`

- [ ] **Step 1: Write failing tests** for `resolveBottomSheetRelease({ current, translationY, velocityY, collapsedOffset, expandedOffset, closeOffset })` covering upward fling/drag → `expanded`, downward drag from expanded → `collapsed`, downward drag from collapsed beyond `closeOffset` → `closed`, and short release → nearest current snap.
- [ ] **Step 2: Run the focused test** with `cd mobile; npm test -- --runInBand src/ui/draggableBottomSheet.test.ts`; confirm it fails because the helper does not exist.
- [ ] **Step 3: Implement the pure helper** with explicit `SheetSnap = 'collapsed' | 'expanded' | 'closed'`, projected movement `translationY + velocityY * 0.2`, midpoint comparison, and close threshold. Clamp decisions to the named states and keep the function independent of React Native.
- [ ] **Step 4: Re-run the focused test** and confirm all snap cases pass.
- [ ] **Step 5: Commit** with `git add mobile/src/ui/draggableBottomSheet.ts mobile/src/ui/draggableBottomSheet.test.ts; git commit -m "test: define draggable sheet snap behavior"`.

### Task 2: Build the shared draggable sheet component

**Files:**
- Modify: `mobile/src/ui/draggableBottomSheet.ts`
- Create: `mobile/src/ui/draggableBottomSheet.test.tsx`

- [ ] **Step 1: Write failing component tests** that render `DraggableBottomSheet`, assert the handle has a 40 px minimum hit target, the compact and expanded heights are derived from the visible window, and the sheet exposes `onRequestClose`/backdrop dismissal.
- [ ] **Step 2: Run the component test** with `cd mobile; npm test -- --runInBand src/ui/draggableBottomSheet.test.tsx`; confirm it fails before the component exists.
- [ ] **Step 3: Implement `DraggableBottomSheet`** with props `{ visible, title, onClose, children, contentStyle? }`, a transparent `Modal`, dimmed backdrop, rounded `Animated.View`, handle-only `PanResponder`, compact offset `height * 0.55`, expanded offset `height * 0.08`, and spring animation (`bounciness: 0`). On release, call the helper; animate to the chosen offset or call `onClose` for `closed`. Keep children in a height-constrained `View` so inner `ScrollView` remains scrollable.
- [ ] **Step 4: Re-run component tests** and confirm they pass with no act warnings.
- [ ] **Step 5: Commit** with `git add mobile/src/ui/draggableBottomSheet.ts mobile/src/ui/draggableBottomSheet.test.tsx; git commit -m "feat: add shared draggable bottom sheet"`.

### Task 3: Use the shared sheet for history and image references

**Files:**
- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`

- [ ] **Step 1: Write failing integration tests** that open `引用图片附件` and `打开对话历史`, assert both render `DraggableBottomSheet`, and invoke the handle pan responder with an upward drag followed by release; assert the animated target is the expanded snap. Add a downward release case that invokes the corresponding close callback.
- [ ] **Step 2: Run the focused UI tests** and confirm the new shared-sheet assertions fail against the fixed-height `Modal` implementation.
- [ ] **Step 3: Replace the inline history `Modal` and `ImageMentionSheet` `Modal`** with `DraggableBottomSheet`. Keep the existing history list, ready-only image filtering, empty state, backdrop close, close button, and Android `onRequestClose` behavior. Remove duplicate sheet height/handle styles and pass sheet-specific content to the shared component.
- [ ] **Step 4: Run `cd mobile; npm test -- --runInBand src/agent/PromptAssistantUi.test.tsx src/ui/draggableBottomSheet.test.ts src/ui/draggableBottomSheet.test.tsx`; confirm history and mention flows pass.
- [ ] **Step 5: Commit** with `git add mobile/src/agent/PromptAssistantUi.tsx mobile/src/agent/PromptAssistantUi.test.tsx; git commit -m "feat: make history and mention drawers draggable"`.

### Task 4: Render thumbnail/name tokens in the composer

**Files:**
- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`
- Modify: `mobile/src/agent/imageMentions.ts` only if display-name/range helpers need a tested extension.
- Modify: `mobile/src/agent/imageMentions.test.ts` for any helper extension.

- [ ] **Step 1: Write failing token-render tests** for a draft containing one and two valid mentions. Assert the rendered composer tree includes each attachment image URI, extension-free display name, ordinary text segments in order, and repeated tokens. Add a deleted-attachment case that renders the original textual `@name` as ordinary text without a thumbnail.
- [ ] **Step 2: Run `cd mobile; npm test -- --runInBand src/agent/PromptAssistantUi.test.tsx`; confirm token tests fail because the composer currently renders only native text.
- [ ] **Step 3: Implement `MentionTokenLayer`** as a pointer-transparent mirror of the draft. Split text by sorted valid mention ranges; render ordinary segments with the composer’s font metrics and each mention as a compact rounded `View`/`Text` token containing a circular `Image` plus extension-free name. Position the layer over the input surface without intercepting touches; keep the underlying `TextInput` text and selection behavior unchanged. Hide the duplicated underlying mention glyphs only where the token layer covers them, and show the ordinary string when a range is invalid.
- [ ] **Step 4: Re-run token tests**, then manually inspect a multiline draft to ensure the layer uses the same padding, line height, and width as the input and does not block tapping or cursor movement.
- [ ] **Step 5: Commit** with `git add mobile/src/agent/PromptAssistantUi.tsx mobile/src/agent/PromptAssistantUi.test.tsx mobile/src/agent/imageMentions.ts mobile/src/agent/imageMentions.test.ts; git commit -m "feat: render uploaded image mention tokens"`.

### Task 5: Pin send to the trailing edge and preserve submission behavior

**Files:**
- Modify: `mobile/src/agent/PromptAssistantUi.tsx`
- Modify: `mobile/src/agent/PromptAssistantUi.test.tsx`

- [ ] **Step 1: Write a failing layout assertion** that the toolbar has a flexible spacer between leading controls and the send/stop control, and that the send control is the last toolbar child with a trailing-alignment style.
- [ ] **Step 2: Run the focused UI test** and confirm the current toolbar fails the trailing-edge assertion.
- [ ] **Step 3: Add `flex: 1` spacer** between the add/mention controls and send/stop control; preserve all disabled states, accessibility labels, and existing submit/cancel handlers.
- [ ] **Step 4: Extend the existing integration test** to mention only one image and verify the optimistic outgoing row and provider call still include every ready provider/gallery attachment.
- [ ] **Step 5: Run focused tests and typecheck** with `cd mobile; npm test -- --runInBand src/agent/PromptAssistantUi.test.tsx src/agent/imageMentions.test.ts; npm run typecheck`; commit as `fix: align composer send action to trailing edge`.

### Task 6: Full verification and device/export checks

**Files:** No further source changes expected.

- [ ] Run `cd mobile; npm test -- --runInBand`; expect all suites and tests to pass.
- [ ] Run `cd mobile; npm run typecheck`; expect exit code 0.
- [ ] Run `cd mobile; npx expo export --platform android --output-dir C:\Users\Administrator\AppData\Local\Temp\autodl-h3-rich-mentions-export-check`; expect a successful Android bundle export.
- [ ] Run `git diff --check` and `git status --short`; expect no whitespace errors and only intentional committed changes.
- [ ] If `adb` is available, install/launch and verify keyboard visibility, inline thumbnail/name tokens, rightmost send button, upward sheet drag to near-full-screen, collapse/close gestures, and scrollable sheet content. If unavailable, record that limitation explicitly.
