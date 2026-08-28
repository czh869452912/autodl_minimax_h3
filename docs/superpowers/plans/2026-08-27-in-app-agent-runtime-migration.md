# In-App Agent Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Prompt Assistant agent loop, complete MiniMax H3 skill tree, model adapter, and chat state into the Android APK so no remote agent runtime is required.

**Architecture:** Vite bundles `deepagents/browser`, the full official H3 skill files, and an OpenAI-compatible `ChatOpenAI` adapter into the WebView assets. `assistant-ui` LocalRuntime calls a thin adapter that runs Deep Agents in the same WebView, streams text/tool activity, and persists visible threads locally. Android continues to provide Keystore-backed model settings and AutoDL task APIs; it does not host an agent server.

**Tech Stack:** React 19, TypeScript, Vite, `deepagents/browser`, `@langchain/openai`, `@assistant-ui/react`, LangGraph `StateBackend`, Android WebView/JSBridge, Vitest, Gradle.

---

## File Map

- `frontend/src/agent/skills/minimax-h3/`: unchanged official MiniMax H3 skill tree, including every `SKILL.md`, reference, metadata, and supporting asset.
- `frontend/scripts/generate-h3-skill-bundle.mjs`: build-time source scanner that emits the complete skill tree as browser-safe `FileData`.
- `frontend/src/agent/generated/h3Skills.ts`: generated bundle consumed by the browser runtime; never hand-edit.
- `frontend/src/agent/skillBundle.ts`: typed accessors, path normalization, and integrity metadata for the generated files.
- `frontend/src/agent/modelAdapter.ts`: OpenAI-compatible streaming model construction and transport boundary.
- `frontend/src/agent/h3Agent.ts`: Deep Agents browser harness, local `StateBackend`, system policy, and stream event normalization.
- `frontend/src/agent/h3Agent.test.ts`: mocked multi-round agent tests with real bundled skill files.
- `frontend/src/agent/assistantAdapter.ts`: `assistant-ui` `ChatModelAdapter` conversion layer.
- `frontend/src/agent/threadStore.ts`: local thread/message persistence without secrets.
- `frontend/src/components/H3PromptResult.tsx`: LocalRuntime provider, prebuilt assistant-ui chat, activity rendering, and final prompt extraction.
- `frontend/src/components/AgentScreen.tsx`: existing page shell, retained only as layout and apply callback boundary.
- `frontend/src/utils/nativeBridge.ts`: Keystore-backed LLM settings plus optional model transport capability; remove runtime URL helpers.
- `frontend/src/components/SettingsScreen.tsx`: model settings only; remove Agent Runtime URL controls.
- `frontend/src/types.ts` and `frontend/src/App.tsx`: remove `runtimeUrl` state and preserve the existing apply-to-generator callback.
- `app/src/main/java/com/example/autodlh3/MainActivity.java`: keep WebView/Keystore/task behavior; add no server startup or runtime URL logic.
- `frontend/server/**`: delete the remote CopilotKit/Express agent implementation after browser runtime tests pass.
- `frontend/package.json`, lockfiles, `frontend/README.md`, and root `README.md`: align dependencies, scripts, and deployment instructions with the APK-only runtime.

### Task 1: Vendor And Bundle The Complete Official H3 Skills

**Files:**
- Move: `frontend/server/skills/minimax-h3/` to `frontend/src/agent/skills/minimax-h3/` using the official MiniMax H3 repository contents.
- Create: `frontend/scripts/generate-h3-skill-bundle.mjs`
- Create: `frontend/src/agent/skillBundle.ts`
- Create: `frontend/src/agent/skillBundle.test.ts`
- Create: `frontend/src/agent/generated/h3Skills.ts` via the generator
- Modify: `frontend/package.json`
- Modify: `frontend/.gitignore` only if the generated bundle is intentionally tracked; the chosen approach must be documented in the script header.

- [ ] **Step 1: Write the failing integrity test**

```ts
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { officialH3Skills, officialH3SkillManifest } from "./skillBundle";

function filesUnder(root: string, prefix = ""): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    return statSync(path).isDirectory() ? filesUnder(path, relative) : [relative];
  });
}

describe("official H3 skill bundle", () => {
  it("contains every source file with unchanged bytes", () => {
    const sourceRoot = join(process.cwd(), "src", "agent", "skills", "minimax-h3");
    const sourceFiles = filesUnder(sourceRoot).sort();
    expect(Object.keys(officialH3Skills).sort()).toEqual(sourceFiles.map((f) => `/skills/${f}`));

    for (const sourceFile of sourceFiles) {
      const bytes = readFileSync(join(sourceRoot, sourceFile));
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(officialH3SkillManifest[`/skills/${sourceFile}`]).toBe(digest);
    }
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/agent/skillBundle.test.ts`

Expected: FAIL because the browser bundle and typed accessors do not exist.

- [ ] **Step 3: Refresh the vendored source from the official repository**

Copy the repository's complete `skills/` directory into `frontend/src/agent/skills/minimax-h3/` without rewriting file contents. Keep every directory and file, including non-English skill files, `meta.yaml`, `agents/`, references, and binary assets. Do not copy only the prompt skill or convert files into prompt constants.

- [ ] **Step 4: Implement the deterministic bundle generator**

`generate-h3-skill-bundle.mjs` must recursively scan the source directory, normalize paths to `/skills/<relative-posix-path>`, preserve UTF-8 text and binary bytes, infer MIME types, and emit:

```ts
export const officialH3Skills: Record<string, {
  content: string | Uint8Array;
  mimeType?: string;
  created_at: string;
  modified_at: string;
}>;
export const officialH3SkillManifest: Record<string, string>;
```

Text files may use string content; binary files must use base64-decoded `Uint8Array` construction. The generated manifest stores SHA-256 hashes of source bytes. Add `"prebuild": "node scripts/generate-h3-skill-bundle.mjs"` so both Vite and Gradle builds regenerate the bundle.

- [ ] **Step 5: Add the typed accessor**

`skillBundle.ts` exports the generated `officialH3Skills`, a read-only `officialH3SkillRoot = "/skills/"`, and `getOfficialH3SkillFiles()` that returns a fresh `Record<string, FileData>` so each run can safely add working files without mutating the source bundle.

- [ ] **Step 6: Run the focused test and verify it passes**

Run: `npm test -- src/agent/skillBundle.test.ts`

Expected: PASS, with all official source paths represented in the generated state files.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/agent/skills frontend/src/agent/skillBundle.ts frontend/src/agent/skillBundle.test.ts frontend/src/agent/generated frontend/scripts/generate-h3-skill-bundle.mjs frontend/package.json frontend/.gitignore
git commit -m "feat: bundle official H3 skills in webview"
```

### Task 2: Implement The Browser-Local Deep Agents Harness And Model Adapter

**Files:**
- Create: `frontend/src/agent/modelAdapter.ts`
- Create: `frontend/src/agent/h3Agent.ts`
- Create: `frontend/src/agent/h3Agent.test.ts`
- Create: `frontend/src/agent/agentTypes.ts`
- Modify: `frontend/package.json` and `frontend/package-lock.json`
- Remove after migration: `frontend/server/agent/deepAgent.ts` and `frontend/server/agent/deepAgent.test.ts`

- [ ] **Step 1: Define the app-facing run contract**

Create `agentTypes.ts` with the following stable types:

```ts
export type H3AgentConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

export type H3AgentInput = {
  threadId: string;
  messages: readonly unknown[];
  signal: AbortSignal;
};

export type H3AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool-start"; id: string; name: string; args: unknown }
  | { type: "tool-end"; id: string }
  | { type: "status"; message: string }
  | { type: "error"; error: Error };
```

- [ ] **Step 2: Write failing model and harness tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createH3Agent, streamH3Agent } from "./h3Agent";

describe("in-app H3 agent", () => {
  it("rejects an incomplete OpenAI-compatible configuration before a request", () => {
    expect(() => createH3Agent({ apiKey: "", endpoint: "https://example.test/v1", model: "test" }))
      .toThrow("LLM API key");
  });

  it("streams multiple model/tool rounds and exposes official skill reads", async () => {
    const events = [];
    for await (const event of streamH3Agent({
      threadId: "thread-1",
      messages: [{ role: "user", content: "写一个纸艺科普视频提示词" }],
      signal: new AbortController().signal,
    }, {
      apiKey: "test-key",
      endpoint: "https://example.test/v1",
      model: "test-model",
    }, { modelFactory: vi.fn(() => mockedToolCallingModel()) })) {
      events.push(event);
    }
    expect(events.some((event) => event.type === "tool-start" && event.name === "read_file")).toBe(true);
    expect(events.filter((event) => event.type === "text").length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run: `npm test -- src/agent/h3Agent.test.ts`

Expected: FAIL because the browser runtime modules and model factory do not exist.

- [ ] **Step 4: Implement the OpenAI-compatible model factory**

`modelAdapter.ts` must validate a non-empty API key, HTTPS-or-local development endpoint, and model name. Construct `ChatOpenAI` from `@langchain/openai` with the configured model, low temperature, API key, and `configuration.baseURL`. Keep the key in memory only. The transport abstraction is:

```ts
export type ModelFactory = (config: H3AgentConfig) => ChatOpenAI;
export function createOpenAICompatibleModel(config: H3AgentConfig): ChatOpenAI;
```

The default factory enables browser use explicitly and supports streaming/tool calls. Tests inject a factory and never make network requests.

- [ ] **Step 5: Implement `createH3Agent` with the browser entry point**

Import `createDeepAgent` and `StateBackend` from `deepagents/browser`. Create the agent with `skills: ["/skills/"]`, the official H3 policy, and a local state backend. The run invocation must pass `files: getOfficialH3SkillFiles()` and a normalized message list. The system policy must require reading complete official `SKILL.md` and references, allow multiple skill selection, forbid fixed templates, and mark unavailable Hub actions as pre-production.

Do not import `deepagents/node`, `express`, `@copilotkit/runtime`, or filesystem APIs into browser modules. Do not add application tools for each H3 skill; the agent uses the native filesystem/skill tools.

- [ ] **Step 6: Normalize Deep Agents stream events**

`streamH3Agent` must consume the Deep Agents stream in message/update mode, honor `AbortSignal`, emit tool start/end events for filesystem and task calls, emit every text delta in order, and convert provider errors or iteration-limit termination into `{ type: "error" }`. It must never emit a final result after cancellation or error.

- [ ] **Step 7: Run focused tests and verify they pass**

Run: `npm test -- src/agent/h3Agent.test.ts`

Expected: PASS with no outbound network request and with at least two autonomous rounds represented in the event sequence.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/agent/agentTypes.ts frontend/src/agent/modelAdapter.ts frontend/src/agent/h3Agent.ts frontend/src/agent/h3Agent.test.ts frontend/package.json frontend/package-lock.json
git rm frontend/server/agent/deepAgent.ts frontend/server/agent/deepAgent.test.ts
git commit -m "feat: run H3 Deep Agents inside webview"
```

### Task 3: Connect `assistant-ui` LocalRuntime And Local Thread Persistence

**Files:**
- Create: `frontend/src/agent/assistantAdapter.ts`
- Create: `frontend/src/agent/threadStore.ts`
- Create: `frontend/src/components/H3PromptResult.test.tsx`
- Modify: `frontend/src/components/H3PromptResult.tsx`
- Modify: `frontend/src/components/AgentScreen.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Write the failing UI contract test**

Mock `useLocalRuntime`, `AssistantRuntimeProvider`, and the prebuilt thread/composer components. Assert that the page has no `runtimeUrl` prop or runtime URL lookup, creates a local adapter from the current LLM settings, renders the composer without a health endpoint, and calls `onApplyPrompt` when the latest assistant message contains `integrated_multimodal_description:`.

```tsx
it("uses a local runtime and keeps the apply action", async () => {
  render(<H3PromptResult onApplyPrompt={onApplyPrompt} llmConfig={config} />);
  expect(screen.getByPlaceholderText(/描述场景/)).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: /应用到生成器/ }));
  expect(onApplyPrompt).toHaveBeenCalledWith(expect.stringContaining("integrated_multimodal_description:"));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/components/H3PromptResult.test.tsx`

Expected: FAIL because the current component imports `CopilotKitProvider`, resolves a remote runtime URL, and has no local adapter.

- [ ] **Step 3: Implement the `ChatModelAdapter` conversion**

`assistantAdapter.ts` exports `createH3ChatModelAdapter(config)`. Its `run({ messages, abortSignal, unstable_threadId })` converts assistant-ui text/image parts to LangChain messages, invokes `streamH3Agent`, and yields assistant-ui updates:

```ts
yield { content: [{ type: "text", text: event.delta }] };
yield { content: [{ type: "tool-call", toolCallId: event.id, toolName: event.name, args: event.args, result: "" }] };
```

Tool events must remain structured metadata so the prebuilt UI can render activity. Provider and agent errors must be thrown as `Error` instances for LocalRuntime's retry/error state. The adapter passes the current thread ID and never writes credentials into messages or metadata.

- [ ] **Step 4: Implement local thread storage**

`threadStore.ts` stores a versioned JSON record under a single localStorage key containing thread ID, sanitized `ThreadMessageLike[]`, updated timestamp, and extracted final prompt. Strip any request headers, API keys, and raw transport metadata. Export `loadThread()` and `saveThread()` with schema validation and a clear `StorageError` when corrupted data is encountered.

- [ ] **Step 5: Replace the provider-dependent component**

Use `useLocalRuntime(adapter, { initialMessages })` and `AssistantRuntimeProvider`. Compose the existing assistant-ui primitives or current prebuilt components for message list, composer, attachments, stop, retry, and error states. Keep the existing dark theme and copy/apply result section. Use `useThreadMessages()` to persist message changes and extract the final H3 prompt. Remove all imports from `@copilotkit/react-core/v2`, `runtimeUrl.ts`, and `nativeReadAgentRuntimeUrl`.

- [ ] **Step 6: Remove runtime URL from application state and settings contract**

Delete `runtimeUrl` from `AppSettings`, the initial state in `App.tsx`, the runtime URL helpers, and every UI control that edits an Agent Runtime address. Pass `nativeReadLlmConfig()` into `H3PromptResult` so the local adapter is ready as soon as settings load. Composer disabled state may depend on missing API key/configuration, but never on a remote health check.

- [ ] **Step 7: Run focused UI tests and verify they pass**

Run: `npm test -- src/components/H3PromptResult.test.tsx src/utils/runtimeUrl.test.ts`

Expected: the new component test passes and the obsolete runtime URL test is removed with the helper; no test performs an HTTP request.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/agent/assistantAdapter.ts frontend/src/agent/threadStore.ts frontend/src/components/H3PromptResult.tsx frontend/src/components/H3PromptResult.test.tsx frontend/src/components/AgentScreen.tsx frontend/src/App.tsx frontend/src/types.ts
git rm frontend/src/utils/runtimeUrl.ts frontend/src/utils/runtimeUrl.test.ts
git commit -m "feat: use assistant-ui local runtime"
```

### Task 4: Remove Remote Agent Runtime And Align Android Settings

**Files:**
- Modify: `frontend/src/utils/nativeBridge.ts`
- Modify: `frontend/src/components/SettingsScreen.tsx`
- Modify: `app/src/main/java/com/example/autodlh3/MainActivity.java` only where old runtime URL/config hooks are present
- Delete: `frontend/server/index.ts`, `frontend/server/config.ts`, `frontend/server/copilotkit.ts`, `frontend/server/copilotkit.test.ts`, and the remaining remote-agent test files
- Modify: `frontend/package.json`, `frontend/package-lock.json`, `frontend/bun.lock`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Write the failing dependency/bundle boundary test**

Create `frontend/src/agent/bundleBoundary.test.ts` that reads browser source files and asserts they do not contain imports from `@copilotkit`, `express`, `deepagents/node`, `server/`, or a hard-coded `/api/copilotkit` URL. Assert that `frontend/package.json` has no runtime-agent dependencies after cleanup.

- [ ] **Step 2: Run the boundary test and verify it fails**

Run: `npm test -- src/agent/bundleBoundary.test.ts`

Expected: FAIL because `H3PromptResult.tsx`, the old runtime URL helper, and package dependencies still reference the remote runtime.

- [ ] **Step 3: Simplify the native bridge contract**

Keep `saveLlmConfig`, `readLlmApiKey`, `readLlmEndpoint`, and `readLlmModel`. Delete `nativeSaveAgentRuntimeUrl`, `nativeReadAgentRuntimeUrl`, and the `agent_runtime_url` storage key. Change browser defaults to an OpenAI-compatible `/v1` endpoint and `MiniMax-M2.7`; retain Android Keystore storage for the API key. Do not add a server-start command, socket, or LAN address.

- [ ] **Step 4: Remove settings UI for remote runtime**

Delete the Agent Runtime address section and handler from `SettingsScreen.tsx`. Keep the API key, endpoint, and model fields. Explain that the endpoint is the model provider only and that the agent executes locally in the APK.

- [ ] **Step 5: Remove server-only code and dependencies**

Delete the Express/CopilotKit adapter and old server tests. Remove `@copilotkit/react-core`, `@copilotkit/runtime`, `@langchain/react`, `express`, `cors`, and `tsx` only if no remaining script imports them. Keep `@assistant-ui/react`, `deepagents`, `@langchain/openai`, LangGraph peer packages, and Vite/React dependencies required by the browser build. Remove the Vite `/api` proxy because the production assistant has no API route; keep non-agent development proxy entries only if another screen still uses them.

- [ ] **Step 6: Run the boundary test and typecheck**

Run:

```bash
npm test -- src/agent/bundleBoundary.test.ts
npm run lint
```

Expected: PASS, with no remote-agent imports in the browser source and no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src frontend/package.json frontend/package-lock.json frontend/bun.lock frontend/vite.config.ts frontend/server app/src/main/java/com/example/autodlh3/MainActivity.java
git commit -m "refactor: remove remote agent runtime dependency"
```

### Task 5: Build APK, Verify No Server Dependency, And Update Documentation

**Files:**
- Create: `app/src/androidTest/java/com/example/autodlh3/PromptAssistantAssetTest.java` or an equivalent package-inspection smoke test supported by the project.
- Modify: `app/build.gradle` only if generated skill assets need explicit build inputs.
- Modify: `frontend/README.md`
- Modify: `README.md`
- Modify: `.gitignore` only for generated build output rules.

- [ ] **Step 1: Add the build boundary test**

The test or verification script must inspect the release/debug APK as a ZIP and assert that `assets/web/index.html` exists, the generated bundle contains `h3-prompt-writing`, and no `assets/web` file contains `/api/copilotkit`, `10.0.2.2:8787`, or a LAN runtime URL.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
cd frontend
npm test
npm run lint
npm run build
```

Expected: all tests pass, TypeScript succeeds, and Vite completes with the generated complete skill bundle included in the browser assets.

- [ ] **Step 3: Build the APK from a clean frontend output**

Run from the repository root:

```bash
./gradlew assembleDebug
```

Expected: Gradle runs `prebuild`, synchronizes the current `frontend/dist`, and emits a new debug APK. Verify the APK timestamp and SHA-256 differ from any prior package when source changes are present.

- [ ] **Step 4: Run the no-server smoke test**

Install the newly built APK with no `npm run server` process running. Open Prompt Assistant, confirm the composer is enabled after an LLM API key/endpoint/model are saved, send a request, and verify that the UI displays local model text plus filesystem/skill tool activity. Turn off all LAN runtime URL settings; no request should target port 8787.

- [ ] **Step 5: Verify restart persistence and failures**

Force-stop and reopen the APK. Confirm the visible thread is restored locally. Also verify missing key, invalid endpoint, cancellation, provider error, and missing skill bundle produce explicit retryable UI states with no fabricated final prompt.

- [ ] **Step 6: Update documentation**

Document the APK-only architecture, model API settings, complete official skill bundle, local thread persistence, required Android network permission, and the fact that no Express/Node/CopilotKit/LAN runtime is needed. Remove all instructions that start `npm run server` or configure an Agent Runtime address. Keep desktop `npm run dev` only for UI development with a mocked model adapter.

- [ ] **Step 7: Run final verification and commit**

Run:

```bash
git diff --check
git status --short
./gradlew test
./gradlew assembleDebug
```

Expected: no whitespace errors, tests pass, and the APK smoke-test artifact contains the current local runtime bundle.

```bash
git add app frontend README.md .gitignore
git commit -m "feat: ship fully in-app prompt agent APK"
```

## Self-Review Against The Approved Spec

- APK-only runtime: Tasks 2, 3, and 4 move the harness and UI adapter into the browser bundle and delete the server path.
- Complete official skills: Task 1 preserves every source file, emits an integrity manifest, and injects all files into local state.
- OpenAI-compatible API: Task 2 uses a configurable `ChatOpenAI` adapter; Task 4 keeps secrets in Keystore-backed settings.
- Autonomous multi-round selection: Task 2 tests real Deep Agents filesystem/skill calls and multiple streamed rounds; no fixed skill branch table is introduced.
- Ready-made UI: Task 3 uses `assistant-ui` LocalRuntime and prebuilt primitives; only result extraction/apply behavior is custom.
- Persistence and cancellation: Tasks 2 and 3 cover abort signals, local thread storage, restart restore, and explicit failures.
- Android packaging: Task 5 verifies Gradle rebuilds the current Vite output and that the APK contains no remote agent endpoint.

