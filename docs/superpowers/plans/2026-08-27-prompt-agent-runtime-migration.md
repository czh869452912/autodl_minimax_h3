# Prompt Agent Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom template LangGraph/SSE prompt assistant with Deep Agents and CopilotKit while preserving the existing Vite/Android WebView shell and H3 apply-to-generation action.

**Architecture:** The server creates one Deep Agent with the official MiniMax H3 skill tree mounted as a native skills source. CopilotKit's Express runtime exposes the agent over AG-UI, and `CopilotChat` renders messages, attachments, tool progress, stop/retry, and thread state. LangSmith Agent Server remains the production deployment target; local development uses the same Express route.

**Tech Stack:** TypeScript, React 19, Vite, Express, Deep Agents JS, CopilotKit v2, AG-UI, LangChain OpenAI-compatible model adapter, MiniMax API, Vitest.

---

### Task 1: Add runtime dependencies and vendor official H3 skills

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/server/skills/minimax-h3/` (copied from the official repository, unchanged)
- Test: `frontend/server/skills/official-skills.test.ts`

- [ ] **Step 1: Write the failing skill-tree test**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'server', 'skills', 'minimax-h3');

it('ships the official H3 prompt skill and reference guides unchanged', () => {
  const skill = join(root, 'h3-prompt-writing', 'SKILL.md');
  expect(existsSync(skill)).toBe(true);
  expect(readFileSync(skill, 'utf8')).toContain('name: h3-prompt-writing');
  expect(existsSync(join(root, 'h3-prompt-writing', 'references', 'base-en.txt'))).toBe(true);
  expect(existsSync(join(root, 'h3-prompt-writing', 'references', 'ref-en.txt'))).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- server/skills/official-skills.test.ts`
Expected: FAIL because the official skill directory is not present.

- [ ] **Step 3: Install the existing-runtime dependencies**

Run: `npm install deepagents@^1.13.1 @langchain/react@^1.0.33 @copilotkit/react-core@^1.69.2 @copilotkit/runtime@^1.69.2`

- [ ] **Step 4: Copy the official H3 skill directory without rewriting files**

Download the MiniMax-H3 repository archive, extract only `skills/` into `frontend/server/skills/minimax-h3/`, and verify that all nine skill folders and their references are present. Do not convert any `SKILL.md` into TypeScript constants.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `npm test -- server/skills/official-skills.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/server/skills/minimax-h3 frontend/server/skills/official-skills.test.ts
git commit -m "feat: add official MiniMax H3 skill tree"
```

### Task 2: Create the Deep Agents server runtime

**Files:**
- Create: `frontend/server/agent/deepAgent.ts`
- Create: `frontend/server/agent/model.ts`
- Create: `frontend/server/agent/policy.ts`
- Modify: `frontend/server/config.ts`
- Test: `frontend/server/agent/deepAgent.test.ts`

- [ ] **Step 1: Write tests for server-only model setup and native skill loading**

Test that missing credentials fail at agent creation, that the model is configured with the MiniMax base URL, and that the agent receives the official skill source path instead of an image-count manifest.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- server/agent/deepAgent.test.ts`
Expected: FAIL because the runtime module does not exist.

- [ ] **Step 3: Implement the minimal model and policy modules**

`model.ts` reads `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, and `MINIMAX_MODEL` only from `process.env`, creates a LangChain `ChatOpenAI` instance with `configuration.baseURL`, and throws a typed configuration error when the key is absent.

`policy.ts` contains the short system instruction that tells the agent to read matching official skills, combine skills when useful, preserve official output rules, and label Hub-only workflows as pre-production when the required `hub_*` tools are unavailable.

- [ ] **Step 4: Implement `createH3DeepAgent()`**

Create the agent with `createDeepAgent({ model, skills: [officialSkillsRoot], systemPrompt, checkpointer })`. Use the native skills loader and do not register `t2va`, `i2va`, `fl2va`, or `ref2va` as application tools.

- [ ] **Step 5: Run tests and verify they pass**

Run: `npm test -- server/agent/deepAgent.test.ts`
Expected: PASS with no API request made.

- [ ] **Step 6: Commit**

```bash
git add frontend/server/agent frontend/server/config.ts frontend/server/agent/deepAgent.test.ts
git commit -m "feat: add Deep Agents H3 runtime"
```

### Task 3: Mount CopilotKit runtime in Express

**Files:**
- Modify: `frontend/server/index.ts`
- Create: `frontend/server/copilotkit.ts`
- Test: `frontend/server/copilotkit.test.ts`

- [ ] **Step 1: Write a failing route test**

Assert that the Express app exposes `/api/copilotkit`, rejects requests when the model is unconfigured, and does not expose the old `/api/agent/run` template stream as the primary route.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- server/copilotkit.test.ts`
Expected: FAIL because the CopilotKit handler is not mounted.

- [ ] **Step 3: Create the runtime adapter**

Use the official CopilotKit Express adapter to register the `h3-agent` Deep Agent and mount its handler at `/api/copilotkit`. Keep `/api/health` and existing non-agent routes intact. Translate Express request/response objects only in this adapter; do not add another custom stream protocol.

- [ ] **Step 4: Run route tests and verify they pass**

Run: `npm test -- server/copilotkit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/server/index.ts frontend/server/copilotkit.ts frontend/server/copilotkit.test.ts
git commit -m "feat: expose H3 agent through CopilotKit runtime"
```

### Task 4: Replace the custom assistant surface with CopilotChat

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AgentScreen.tsx`
- Create: `frontend/src/components/H3AgentPage.tsx`
- Create: `frontend/src/components/H3PromptResult.tsx`
- Remove or deprecate: `frontend/src/components/AssistantChatSurface.tsx`
- Remove or deprecate: `frontend/src/agent/agentClient.ts`
- Remove or deprecate: `frontend/src/agent/h3AgentHarness.ts`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Write a failing component contract test**

Assert that the agent screen renders `CopilotChat` with runtime URL `/api/copilotkit`, uses agent id `h3-agent`, and exposes the existing apply callback through the final result renderer.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/components/H3AgentPage.test.tsx`
Expected: FAIL because the new page does not exist.

- [ ] **Step 3: Add the provider and prebuilt chat surface**

Wrap only the agent screen in `CopilotKit`, render `CopilotChat`, and configure labels, stop/retry behavior, and the existing dark theme. Use CopilotKit attachment support for image/file parts. Do not copy the old message state, SSE parser, or trajectory reducer.

- [ ] **Step 4: Add the thin H3 result renderer**

Render final Prompt text with copy and `onApplyPrompt`. Register this as a CopilotKit frontend tool/component only where needed; all agent execution remains server-side.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `npm test -- src/components/H3AgentPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/AgentScreen.tsx frontend/src/components/H3AgentPage.tsx frontend/src/components/H3PromptResult.tsx frontend/src/types.ts
git rm frontend/src/agent/agentClient.ts frontend/src/agent/h3AgentHarness.ts frontend/src/components/AssistantChatSurface.tsx
git commit -m "feat: use CopilotKit chat for prompt assistant"
```

### Task 5: Remove old graph and document deployment

**Files:**
- Remove: `frontend/server/graph/h3Graph.ts`
- Remove: `frontend/server/skills/manifest.ts`
- Remove: `frontend/server/skills/validator.ts`
- Remove: `frontend/src/skills/h3Skills.ts`
- Modify: `frontend/README.md`
- Modify: `frontend/.env.example`
- Test: `frontend/server/bundle-boundary.test.ts`

- [ ] **Step 1: Write a failing bundle-boundary test**

Assert that browser-facing modules do not import `frontend/server/graph`, `templateDraft`, or server-only model modules.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- server/bundle-boundary.test.ts`
Expected: FAIL while the old client agent imports remain.

- [ ] **Step 3: Remove old orchestration and fallback code**

Delete the custom graph, manifest, validator, client skill functions, SSE parser, and browser fallback. Keep only official skill files and the CopilotKit/Deep Agents integration.

- [ ] **Step 4: Update documentation and environment examples**

Document `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `MINIMAX_MODEL`, local Express startup, `/api/copilotkit`, production LangSmith deployment, and the Hub-only pre-production policy. State that no API key is stored in the browser.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all tests pass, TypeScript passes, and the browser bundle contains no Deep Agents/server graph code.

- [ ] **Step 6: Commit**

```bash
git add frontend/README.md frontend/.env.example frontend/server/bundle-boundary.test.ts
git rm frontend/server/graph/h3Graph.ts frontend/server/skills/manifest.ts frontend/server/skills/validator.ts frontend/src/skills/h3Skills.ts
git commit -m "refactor: remove custom H3 agent orchestration"
```
