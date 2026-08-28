# Assistant-ui Mobile Thread Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Prompt assistant's mobile timeline/grid shell with assistant-ui's official responsive ThreadListSidebar composition so the Thread viewport is the only chat scroll area.

**Architecture:** Keep the existing H3 ChatModelAdapter, local assistant-ui thread-list adapter, and native media bridge. Add the official assistant-ui ThreadListSidebar registry component and compose it with SidebarProvider, SidebarInset, SidebarTrigger, and the existing official Thread. The application shell only supplies height constraints, safe-area spacing, and existing color tokens.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, `@assistant-ui/react`, assistant-ui shadcn/base registry components, Vitest.

---

## Files and Responsibilities

- Create via registry: `frontend/components/threadlist-sidebar.tsx` — official assistant-ui sidebar composition wrapping `ThreadList`.
- Create via registry: `frontend/components/ui/sidebar.tsx` and any registry dependencies — official responsive desktop Sidebar/mobile Sheet behavior.
- Modify: `frontend/src/components/H3PromptResult.tsx` — compose the official sidebar and Thread while preserving runtime and Android attachment bridge.
- Create: `frontend/src/components/H3PromptResult.test.ts` — structural regression test for the single-scroll-region layout contract.
- Modify: `frontend/package.json`, `frontend/package-lock.json` — dependencies required by the official registry component.
- Modify: `frontend/src/index.css` only if the registry command requires official sidebar token/keyframe support; do not add chat-specific message or scroll styles.

### Task 1: Add official assistant-ui sidebar registry components

**Files:**
- Create: `frontend/components/threadlist-sidebar.tsx`
- Create: `frontend/components/ui/sidebar.tsx`
- Create or modify: registry dependency files reported by the CLI
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] **Step 1: Run the official registry command**

Run from `frontend`:

```powershell
npx shadcn@latest add @assistant-ui/threadlist-sidebar
```

Expected: the command adds `threadlist-sidebar.tsx`, the official sidebar primitives/dependencies, and any missing packages without replacing the existing `thread.tsx` or `thread-list.tsx`.

- [ ] **Step 2: Confirm the registry implementation is unmodified assistant-ui code**

Run:

```powershell
rg -n "export function ThreadListSidebar|function Sidebar\(|data-mobile|Sheet" components/threadlist-sidebar.tsx components/ui/sidebar.tsx
```

Expected: `ThreadListSidebar` renders `ThreadList`, `Sidebar` supports desktop and mobile branches, and the mobile branch uses the generated Sheet behavior. Do not hand-write a replacement sidebar if the registry command succeeds.

- [ ] **Step 3: Run the existing type check before changing the page**

Run:

```powershell
npm run lint
```

Expected: PASS. If the registry added an unresolved dependency, install only the package named by the compiler and rerun the check.

### Task 2: Lock the layout contract with a failing test

**Files:**
- Create: `frontend/src/components/H3PromptResult.test.ts`

- [ ] **Step 1: Write the regression test before editing H3PromptResult**

```typescript
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "H3PromptResult.tsx"), "utf8");

describe("Prompt assistant chat layout contract", () => {
  it("uses the official responsive sidebar composition", () => {
    expect(source).toContain("SidebarProvider");
    expect(source).toContain("ThreadListSidebar");
    expect(source).toContain("SidebarInset");
    expect(source).toContain("SidebarTrigger");
  });

  it("does not create a second mobile timeline scroll region", () => {
    expect(source).not.toContain("grid-rows-[auto_minmax(0,1fr)]");
    expect(source).not.toContain("max-h-40 overflow-y-auto");
    expect(source).not.toContain("overflow-y-auto px-4 py-5");
  });
});
```

- [ ] **Step 2: Run only this test and verify the expected RED failure**

Run from `frontend`:

```powershell
npm test -- src/components/H3PromptResult.test.ts
```

Expected: FAIL because the current source has no `SidebarProvider`/`ThreadListSidebar` imports and still contains the mobile grid/timeline overflow classes. A module or syntax error is not an acceptable RED result; fix the test setup until it fails for the missing layout contract.

### Task 3: Compose the official sidebar and single Thread viewport

**Files:**
- Modify: `frontend/src/components/H3PromptResult.tsx:1-130`

- [ ] **Step 1: Replace only the outer H3Runtime layout**

Keep `NativeMediaBridge`, `createH3ChatModelAdapter`, `createH3ThreadListAdapter`, attachment adapters, and `useRemoteThreadListRuntime` unchanged. Replace the current mobile grid/aside/section block with this composition:

```tsx
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/threadlist-sidebar";

return (
  <AssistantRuntimeProvider runtime={runtime}>
    <NativeMediaBridge />
    <SidebarProvider
      className="h-full min-h-0"
      style={{ minHeight: 0 }}
    >
      <div className="flex h-full min-h-0 w-full">
        <ThreadListSidebar
          className="[&_[data-slot=sidebar-container]]:top-16 [&_[data-slot=sidebar-container]]:bottom-20 [&_[data-slot=sidebar-container]]:h-auto"
        />
        <SidebarInset className="relative h-full min-h-0 min-w-0 overflow-hidden">
          <SidebarTrigger
            className="absolute left-3 top-3 z-20 md:hidden"
            aria-label="Open thread list"
          />
          <Thread autoFocus={false} />
        </SidebarInset>
      </div>
    </SidebarProvider>
  </AssistantRuntimeProvider>
);
```

The fixed desktop sidebar offset keeps it below the existing 64px application header and above the 80px mobile navigation reserve. Mobile uses the official Sheet branch and is allowed to cover the app chrome while open, as a modal timeline. Do not add an outer `overflow-y-auto`, a second Composer, or custom message/timeline rendering.

- [ ] **Step 2: Run the focused regression test and verify GREEN**

Run:

```powershell
npm test -- src/components/H3PromptResult.test.ts
```

Expected: PASS with both layout contract tests green.

- [ ] **Step 3: Run all unit tests and the type check**

Run:

```powershell
npm test
npm run lint
```

Expected: all Vitest files pass and `tsc --noEmit` exits successfully. If an official sidebar dependency introduces a type error, fix the import/package mismatch rather than changing assistant-ui component internals.

### Task 4: Verify production build and preserve generated assets

**Files:**
- Verify only: `frontend/dist/` and `frontend/src/agent/generated/h3Skills.ts`

- [ ] **Step 1: Build the production bundle**

Run from `frontend`:

```powershell
npm run build
```

Expected: Vite completes successfully. Existing chunk-size or browser-externalization warnings may remain; no new TypeScript/module resolution errors are acceptable.

- [ ] **Step 2: Check generated-file drift**

Run from repository root:

```powershell
git status --short
git diff --check
```

Expected: only the planned sidebar/page/test/package/CSS files are changed. If the prebuild script updates `frontend/src/agent/generated/h3Skills.ts`, restore that generated file to its pre-build state only if the update is build timestamp/content churn unrelated to this task; preserve any pre-existing user modification.

### Task 5: Browser verification at desktop and mobile sizes

**Files:**
- No source changes unless a verified layout defect is found.

- [ ] **Step 1: Start the frontend dev server**

Run from `frontend`:

```powershell
npm run dev -- --port 3001
```

Open the printed local URL in the browser and navigate to Prompt 助手.

- [ ] **Step 2: Verify desktop behavior**

At a desktop viewport, confirm:

```text
left: official ThreadListSidebar is visible and independently navigable
right: official Thread fills the remaining height
scroll: only Thread viewport scrolls message history
composer: stays inside Thread's native viewport footer and never overlays text
```

- [ ] **Step 3: Verify mobile behavior**

At a 390x844-equivalent viewport, confirm:

```text
closed: no visible timeline row and no second vertical scrollbar
chat: message content reaches the bottom composer without being hidden by bottom navigation
trigger: official SidebarTrigger opens the official left Sheet
sheet: ThreadList supports new/search/switch/more actions through assistant-ui
scroll: streaming/long messages remain scrollable inside the single Thread viewport
```

- [ ] **Step 4: Run the final verification commands**

```powershell
npm test
npm run lint
npm run build
```

Expected: all tests, type check, and build pass; the dev server is stopped after visual verification.
