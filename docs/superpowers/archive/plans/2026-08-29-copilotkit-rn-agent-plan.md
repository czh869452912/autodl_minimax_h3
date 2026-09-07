# CopilotKit React Native Agent UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom assistant-ui Native screen with CopilotKit's rendered React Native chat, backed by a server-hosted DeepAgents agent exposed through AG-UI.

**Architecture:** The Android app will contain only the native product shell and CopilotKit's rendered chat surface. A standalone TypeScript Node service will host Copilot Runtime, proxy authenticated AG-UI streams, and connect them to a DeepAgents/LangGraph graph that loads the official H3 skill directory and executes tools server-side.

**Tech Stack:** Expo 57, React Native 0.86, `@copilotkit/react-native`, `@copilotkit/runtime`, AG-UI SSE, `deepagents`, `@langchain/langgraph`, `@langchain/openai`, TypeScript, Jest, Android emulator/ADB.

**Spec:** `docs/superpowers/specs/2026-08-29-copilotkit-rn-agent-design.md`

## Global Constraints

- The RN chat surface must come from `@copilotkit/react-native/components`; do not recreate generic message, composer, timeline, or tool-call UI.
- All model credentials, DeepAgents execution, H3 skill files, tools, and checkpoints live on the server.
- The client communicates with the server using AG-UI over HTTPS/SSE; Android emulator development uses `10.0.2.2` for a host-local server.
- New-install baseline only: remove old client-side assistant runtime and skill bundle imports; no migration layer is required.
- Any run error must render as a visible CopilotKit error state and must never leave an empty assistant message.
- Use TDD for behavior changes: write and run a failing test before production implementation.

---

### Task 1: Create the server workspace and AG-UI contract

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/config.ts`
- Create: `server/src/http.ts`
- Create: `server/src/http.test.ts`
- Modify: `README.md`

**Interfaces:**
- `loadServerConfig(env?: NodeJS.ProcessEnv): ServerConfig` returns `{ port, host, model, endpoint, apiKey, authSecret, skillsRoot }` and throws a named configuration error when required production values are absent.
- `createApp(config: ServerConfig): http.Server` returns a Node HTTP server exposing `GET /healthz` and reserving `/api/copilotkit` for the runtime handler.

- [ ] **Step 1: Write the failing test**

```ts
it('reports a healthy server without exposing secrets', async () => {
  const server = createApp(loadServerConfig({
    PORT: '8200', HOST: '127.0.0.1', LLM_MODEL: 'openai:gpt-5-mini',
    LLM_API_KEY: 'test-key', LLM_BASE_URL: 'https://llm.example.test/v1',
    AUTH_SECRET: 'test-secret', H3_SKILLS_ROOT: './skills',
  }));
  const address = await listenForTest(server);
  const response = await fetch(`http://${address}/healthz`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', agent: 'h3-prompt-assistant' });
  await close(server);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server; npm test -- --runInBand src/http.test.ts`

Expected: FAIL because `server/src/http.ts` and the test helpers do not exist.

- [ ] **Step 3: Write minimal implementation**

Add the server package scripts (`dev`, `typecheck`, `test`, `start`), strict TypeScript config, environment parsing, `/healthz`, JSON content type, and a test-only listen/close helper. Do not start the Copilot runtime until Task 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server; npm test -- --runInBand src/http.test.ts; npm run typecheck`

Expected: PASS with no secret values in the health response.

- [ ] **Step 5: Commit**

```bash
git add server README.md
git commit -m "feat: scaffold AG-UI server workspace"
```

### Task 2: Move official H3 skills and DeepAgents into the server

**Files:**
- Create: `server/skills/` by copying the official multi-file H3 skill directory from the repository reference source.
- Create: `server/src/skills.ts`
- Create: `server/src/agent.ts`
- Create: `server/src/skills.test.ts`
- Create: `server/src/agent.test.ts`
- Modify: `server/src/config.ts`

**Interfaces:**
- `loadOfficialSkills(root: string): Promise<Record<string, string>>` returns every `SKILL.md`, `SKILL.cn.md`, `meta.yaml`, and referenced file under the skills root with POSIX-style skill paths.
- `createH3Agent(config: ServerConfig): Promise<CompiledStateGraph>` creates one DeepAgents graph using the configured LangChain model, server-side skills, H3 system policy, and a checkpointer.

- [ ] **Step 1: Write the failing tests**

```ts
it('loads the complete official skill tree from disk', async () => {
  const files = await loadOfficialSkills(path.resolve(__dirname, '../skills'));
  expect(Object.keys(files)).toEqual(expect.arrayContaining([
    '/skills/h3-prompt-writing/SKILL.md',
    '/skills/h3-prompt-writing/references/base-en.txt',
  ]));
  expect(Object.keys(files).length).toBeGreaterThan(20);
});

it('creates an H3 agent with server-side skill access', async () => {
  const graph = await createH3Agent(testConfig());
  expect(graph).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server; npm test -- --runInBand src/skills.test.ts src/agent.test.ts`

Expected: FAIL because the server skill loader and graph factory do not exist.

- [ ] **Step 3: Write minimal implementation**

Copy the complete official skill files into `server/skills`, implement recursive loading with path traversal protection, construct the LangChain OpenAI-compatible model from `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`, and call `createDeepAgent` with the skill root and H3 policy. Use a server checkpointer compatible with the selected DeepAgents/LangGraph version; keep the checkpointer behind the graph factory so it can be replaced by Postgres later without changing the API.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server; npm test -- --runInBand src/skills.test.ts src/agent.test.ts; npm run typecheck`

Expected: PASS and no client bundle contains `server/skills`.

- [ ] **Step 5: Commit**

```bash
git add server/src server/skills
git commit -m "feat: host H3 skills in DeepAgents server"
```

### Task 3: Expose DeepAgents through Copilot Runtime and AG-UI

**Files:**
- Create: `server/src/runtime.ts`
- Modify: `server/src/http.ts`
- Create: `server/src/runtime.test.ts`
- Modify: `server/src/config.ts`

**Interfaces:**
- `createCopilotRuntime(config: ServerConfig, graph: CompiledStateGraph): CopilotRuntime` registers agent id `h3-prompt-assistant`.
- `createApp(config, runtime): http.Server` serves `GET`/`POST /api/copilotkit/*`, `/healthz`, and rejects unauthenticated agent requests with JSON 401.

- [ ] **Step 1: Write the failing tests**

```ts
it('advertises the H3 agent through the runtime info endpoint', async () => {
  const server = createApp(testConfig(), await createTestRuntime());
  const response = await fetch(`${await start(server)}/api/copilotkit/info`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(expect.objectContaining({
    agents: expect.arrayContaining([expect.objectContaining({ name: 'h3-prompt-assistant' })]),
  }));
});

it('does not accept an agent run without the app auth token', async () => {
  const response = await fetch(`${base}/api/copilotkit/agent/h3-prompt-assistant/run`, { method: 'POST' });
  expect(response.status).toBe(401);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server; npm test -- --runInBand src/runtime.test.ts`

Expected: FAIL because the Copilot Runtime handler is not registered.

- [ ] **Step 3: Write minimal implementation**

Use `CopilotRuntime` and `createCopilotNodeListener`/the current Node handler exported by the installed CopilotKit version. Register the graph behind `h3-prompt-assistant`, pass an authenticated user id into the runtime, enable CORS only for the configured development origin, and preserve AG-UI SSE response headers. Add `/info`, `/run`, `/connect`, and `/stop` behavior through the official handler rather than custom event parsing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server; npm test -- --runInBand src/http.test.ts src/runtime.test.ts; npm run typecheck`

Expected: PASS; a test run returns an AG-UI SSE stream containing run lifecycle and text/tool events from the fake graph.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat: expose H3 DeepAgent over AG-UI"
```

### Task 4: Replace the RN custom assistant with CopilotKit rendered chat

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/(tabs)/agent.tsx`
- Replace: `mobile/src/agent/AgentScreen.tsx`
- Create: `mobile/src/agent/copilotConfig.ts`
- Create: `mobile/src/agent/copilotConfig.test.ts`
- Modify: `mobile/metro.config.js`
- Modify: `mobile/app.json`

**Interfaces:**
- `getCopilotRuntimeUrl(platform: PlatformName, env?: ProcessEnv): string` returns the emulator, physical-device, or production URL.
- `AgentScreen` renders `CopilotKitProvider` and the rendered `CopilotChat` from `@copilotkit/react-native/components`; it must not import `@assistant-ui/react-native` or the old `runtime.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it('uses the host alias for an Android emulator', () => {
  expect(getCopilotRuntimeUrl('android-emulator', { COPILOTKIT_PORT: '8200' }))
    .toBe('http://10.0.2.2:8200/api/copilotkit');
});

it('uses HTTPS runtime in production', () => {
  expect(getCopilotRuntimeUrl('production', { COPILOTKIT_RUNTIME_URL: 'https://agent.example.com/api/copilotkit' }))
    .toBe('https://agent.example.com/api/copilotkit');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile; npm test -- --runInBand src/agent/copilotConfig.test.ts`

Expected: FAIL because CopilotKit RN is not installed and the URL helper does not exist.

- [ ] **Step 3: Write minimal implementation**

Install the current compatible `@copilotkit/react-native`, `@copilotkit/runtime` client dependencies and secure RNG/polyfill dependencies. Import `react-native-get-random-values` and CopilotKit RN polyfills before any CopilotKit module. Wrap the tab root with `CopilotKitProvider`; render `CopilotChat` from `/components` inside the existing AutoDL header/tab shell; configure `agentId="h3-prompt-assistant"`, labels, attachments, and visible error/loading states. Keep only a small named renderer for H3-specific task cards if the server emits such a tool.

- [ ] **Step 4: Run tests and bundle to verify it passes**

Run: `cd mobile; npm test -- --runInBand src/agent/copilotConfig.test.ts; npm run typecheck; npx expo export --platform android --clear`

Expected: PASS; Metro resolves `/components`, `@gorhom/bottom-sheet`, reanimated, gesture-handler, markdown, and all polyfills without unresolved-module errors.

- [ ] **Step 5: Commit**

```bash
git add mobile
git commit -m "feat: use CopilotKit rendered chat on Android"
```

### Task 5: Remove client-side agent execution and wire business tools

**Files:**
- Delete: `mobile/src/agent/runtime.ts`
- Delete: `mobile/src/agent/h3Agent.ts`
- Delete: `mobile/src/agent/modelAdapter.ts`
- Delete: `mobile/src/agent/assistantAdapter.ts`
- Delete: `mobile/src/agent/skillBundle.ts`
- Delete: `mobile/src/agentSkills.generated.ts`
- Delete: `mobile/src/agent/agentTypes.ts`
- Delete: `mobile/src/agent/harness.test.ts`
- Replace: `mobile/src/agent/runtime.test.ts` with CopilotKit integration contract tests
- Create: `mobile/src/agent/toolRenderers.tsx`
- Modify: `mobile/src/settings/storage.ts`
- Modify: `mobile/app/(tabs)/settings.tsx`

**Interfaces:**
- `registerH3ToolRenderers()` registers only named, business-specific renderers and returns no generic message UI.
- `getAgentHeaders()` returns the app auth header without exposing LLM credentials.

- [ ] **Step 1: Write the failing tests**

```ts
it('does not store or send an LLM API key from the mobile client', () => {
  expect(getAgentHeaders({ sessionToken: 'session' })).toEqual({ Authorization: 'Bearer session' });
  expect(JSON.stringify(getAgentHeaders({ sessionToken: 'session' }))).not.toContain('apiKey');
});

it('has no production import of the old local agent runtime', () => {
  expect(readSource('app/(tabs)/agent.tsx')).not.toContain('src/agent/runtime');
  expect(readSource('src/agent/AgentScreen.tsx')).not.toContain('@assistant-ui/react-native');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile; npm test -- --runInBand src/agent/runtime.test.ts`

Expected: FAIL because the old runtime and LLM settings are still referenced.

- [ ] **Step 3: Write minimal implementation**

Remove local model/skill imports and old tests, change settings to save only the server URL and app/session token, and provide named CopilotKit renderers for H3 task creation/progress only. Ensure attachment upload uses CopilotKit's attachment path and that errors are rendered through its standard chat surface.

- [ ] **Step 4: Run tests to verify it passes**

Run: `cd mobile; npm test -- --runInBand; npm run typecheck; npx expo export --platform android --clear`

Expected: PASS; `rg "deepagents|@assistant-ui|agentSkills.generated|LLM API Key" mobile/src mobile/app` returns no production imports.

- [ ] **Step 5: Commit**

```bash
git add mobile
git commit -m "refactor: remove client-side agent harness"
```

### Task 6: Verify server/client integration and Android behavior

**Files:**
- Create: `server/.env.example`
- Create: `server/README.md`
- Modify: `README.md`
- Modify: `mobile/app.json`
- Create: `docs/verification/copilotkit-rn.md`

- [ ] **Step 1: Write the failing smoke checks**

Add a server smoke script that starts the runtime with a deterministic fake model and asserts `/healthz`, `/info`, authenticated `/run`, an SSE `TEXT_MESSAGE_*` sequence, and a tool start/result sequence. Add a mobile static check that the production graph has exactly one CopilotKit provider and imports rendered `CopilotChat` from `/components`.

- [ ] **Step 2: Run checks to verify the integration is not yet proven**

Run: `cd server; npm run smoke`; `cd ../mobile; npm run typecheck; npx expo export --platform android --clear`

Expected before final wiring: the smoke test or Android bundle reports the missing endpoint/renderer, providing the failure that the next step fixes.

- [ ] **Step 3: Implement the smoke path and emulator configuration**

Document `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `AUTH_SECRET`, `H3_SKILLS_ROOT`, `COPILOTKIT_RUNTIME_URL`, Android `10.0.2.2`, and production HTTPS. Configure Android cleartext only for the development build if needed; production must use HTTPS.

- [ ] **Step 4: Run the complete verification**

Run:

```powershell
cd server
npm ci
npm test -- --runInBand
npm run typecheck
npm run smoke

cd ..\mobile
npm ci --legacy-peer-deps
npm test -- --runInBand
npm run typecheck
npx expo export --platform android --clear
cd android
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell am force-stop com.example.autodlh3
adb shell monkey -p com.example.autodlh3 1
adb shell input tap 300 190
adb shell input text "Write a 5 second vertical H3 prompt"
adb shell input tap 900 1880
adb exec-out screencap -p > build\copilotkit-agent.png
adb logcat -d -s ReactNativeJS:E AndroidRuntime:E
```

Expected: the APK opens the CopilotKit rendered chat, streams a visible response, shows tool lifecycle UI for a tool-enabled prompt, and produces no crash/empty assistant bubble.

- [ ] **Step 5: Commit verification artifacts**

```bash
git add server/.env.example server/README.md README.md mobile/app.json docs/verification/copilotkit-rn.md
git commit -m "test: verify CopilotKit RN agent integration"
```

## Plan Self-Review

- The design requirement for a complete rendered RN chat is covered by Task 4.
- Server-side skills, DeepAgents, AG-UI, authentication, and persistence boundaries are covered by Tasks 1–3.
- Removal of the old client runtime and skill bundle is explicit in Task 5.
- Android emulator reachability, SSE, Metro, Gradle, and visible tool/error behavior are covered by Task 6.
- No task depends on a placeholder API name without requiring a typecheck against the installed CopilotKit version; the runtime handler import is selected during Task 3 by the package's actual exports.
