# Prompt Assistant Chat Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Prompt Assistant a full-height assistant-ui chat with working Android file transfer and stable streamed agent/tool messages.

**Architecture:** Keep the local assistant-ui runtime and thread store, but replace custom composer/file input handling with assistant-ui's attachment primitive. Add an Android WebView file chooser callback for standard HTML file inputs, while preserving the existing media bridge for the video creation screen. Normalize cumulative agent snapshots to suffix deltas before yielding them to assistant-ui.

**Tech Stack:** React 19, `@assistant-ui/react` 0.15, Vite, Vitest, Android WebView, Java.

---

### Task 1: Make agent stream events true deltas

**Files:**
- Modify: `frontend/src/agent/h3Agent.ts`
- Modify: `frontend/src/agent/assistantAdapter.ts`
- Test: `frontend/src/agent/h3Agent.test.ts`
- Test: `frontend/src/agent/assistantAdapter.test.ts`

- [ ] **Step 1: Write the failing stream test**

Add a test fixture where the agent emits cumulative text snapshots (`"read"`, then `"read official"`) and assert the public event stream emits `"read"`, then only `" official"`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run `npm test -- --run src/agent/h3Agent.test.ts` from `frontend`. Expected: the new assertion fails because `streamDeepAgent` currently forwards each snapshot as a full `delta`.

- [ ] **Step 3: Implement suffix normalization**

Track the last emitted text per stable message identity inside `streamDeepAgent`. When a new text snapshot starts with the previous snapshot, yield only the suffix; when it does not, yield the full text as a new segment. Preserve stable tool-call IDs and do not emit tool messages as text.

- [ ] **Step 4: Run focused tests**

Run `npm test -- --run src/agent/h3Agent.test.ts src/agent/assistantAdapter.test.ts`. Expected: all focused tests pass.

- [ ] **Step 5: Commit the stream fix**

Run `git add frontend/src/agent/h3Agent.ts frontend/src/agent/h3Agent.test.ts frontend/src/agent/assistantAdapter.ts frontend/src/agent/assistantAdapter.test.ts && git commit -m "fix: emit assistant stream deltas"`.

### Task 2: Use assistant-ui attachment primitives and preserve native compatibility

**Files:**
- Modify: `frontend/src/components/H3PromptResult.tsx`
- Modify: `frontend/src/components/nativeMediaPayload.ts`
- Test: `frontend/src/components/nativeMediaPayload.test.ts`

- [ ] **Step 1: Write the attachment primitive regression test**

Extend the payload test with Android's `{ mime, dataUri }` shape and the legacy `{ mimeType, uri }` shape; assert both normalize to the same `{ name, mimeType, uri }` object.

- [ ] **Step 2: Run the focused payload test**

Run `npm test -- --run src/components/nativeMediaPayload.test.ts`. Expected: the new legacy-compatibility assertion passes or exposes any missing fallback before UI edits.

- [ ] **Step 3: Replace the custom browser file input path**

Use `<ComposerPrimitive.AddAttachment multiple>` for the browser/WebView path and keep `<ComposerPrimitive.Attachments>` with `AttachmentPrimitive.Root`, `Name`, and `Remove`. Retain `window.onMediaPicked` only as a compatibility fallback for older APKs, calling the shared payload parser before `aui.composer.addAttachment`.

- [ ] **Step 4: Run type and component tests**

Run `npm run lint` and `npm test -- --run src/components/nativeMediaPayload.test.ts`. Expected: no TypeScript errors and all payload tests pass.

- [ ] **Step 5: Commit the attachment UI change**

Run `git add frontend/src/components/H3PromptResult.tsx frontend/src/components/nativeMediaPayload.ts frontend/src/components/nativeMediaPayload.test.ts && git commit -m "fix: use assistant-ui attachment primitives"`.

### Task 3: Support standard WebView file transfer on Android

**Files:**
- Modify: `app/src/main/java/com/example/autodlh3/MainActivity.java`

- [ ] **Step 1: Add a WebView chooser regression checklist**

Document the required callback behavior in code comments next to the chooser fields: launch `ACTION_OPEN_DOCUMENT`, preserve accepted MIME filters, support multiple selection, and return `null` on cancellation.

- [ ] **Step 2: Implement `onShowFileChooser`**

Add a `ValueCallback<Uri[]>` field and a separate request code. Configure `WebChromeClient.onShowFileChooser` to cancel an existing callback, read `FileChooserParams` accept types/multiple flag, launch the document picker, and store the callback.

- [ ] **Step 3: Complete the chooser in `onActivityResult`**

Handle the separate request code before the existing native media path. Convert the result to a `Uri[]` (or `null` on cancel), invoke the stored callback, and clear it in all paths.

- [ ] **Step 4: Compile the Android app**

Run `$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat :app:compileDebugJavaWithJavac`. Expected: Java compilation succeeds.

- [ ] **Step 5: Commit the WebView transfer fix**

Run `git add app/src/main/java/com/example/autodlh3/MainActivity.java && git commit -m "fix: support WebView attachment file chooser"`.

### Task 4: Make the Prompt Assistant a full-height chat surface

**Files:**
- Modify: `frontend/src/components/AgentScreen.tsx`
- Modify: `frontend/src/components/H3PromptResult.tsx`
- Modify: `frontend/src/components/BottomNav.tsx` if safe-area spacing is needed

- [ ] **Step 1: Write the layout smoke assertions**

Add stable test IDs or semantic labels for the chat viewport and composer, then assert the rendered page has no Prompt Assistant heading/description and contains one composer region. Keep assertions focused on behavior, not Tailwind class strings.

- [ ] **Step 2: Remove the outer title/card layout**

Make `AgentScreen` render `H3PromptResult` directly in a full-height container. Give the chat a viewport-relative height using `100dvh`, subtracting the desktop header and mobile bottom navigation, and add bottom safe-area padding.

- [ ] **Step 3: Compact the thread toolbar and composer**

Keep history/new-thread controls in a compact top toolbar, remove the large rounded card boundary, and place the composer at the bottom of the flex column. Use the assistant-ui AddAttachment, Attachments, Input, Send, and Cancel primitives as the only composer controls.

- [ ] **Step 4: Separate message roles and running activity**

Use `ThreadPrimitive.Messages` role-specific rendering so user content is rendered once on the right and assistant content/tool parts are rendered on the left. Render the running state with assistant-ui parts/tool fallback instead of mutating the user bubble.

- [ ] **Step 5: Run frontend checks**

Run `npm test`, `npm run lint`, and `npm run build`. Expected: all tests pass, TypeScript exits 0, and Vite produces a bundle.

### Task 5: Verify packaged behavior and visual layout

**Files:**
- Generated: `app/src/main/assets/web/index.html` and ignored frontend/app asset bundles

- [ ] **Step 1: Run the Android debug build**

Run `$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat :app:assembleDebug`. Expected: `BUILD SUCCESSFUL` and a debug APK under `app/build/outputs/apk/debug/`.

- [ ] **Step 2: Run browser smoke checks**

Start `npm run dev -- --host 0.0.0.0` and inspect the local page at mobile and desktop widths. Verify the composer is above the bottom navigation, the viewport scrolls independently, the user message stays separate from the assistant stream, and an attachment preview appears after file selection.

- [ ] **Step 3: Review the final diff**

Run `git diff --check` and `git status --short`. Confirm only the approved spec, plan, frontend, Android, and generated asset pointer changes remain.
