# Agent Harness Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Replace the browser-side pseudo harness with a server-owned LangGraph.js workflow, MCP-discoverable H3 skills, and a standard streaming chat UI backed by assistant-ui.

**Architecture:** The Android/Web frontend sends user messages and attachments to a backend endpoint. A LangGraph state graph discovers the applicable skill, generates a structured draft, runs deterministic validation plus evaluator/refinement iterations, and streams run events and the final prompt. MCP exposes skill metadata and tools; the frontend consumes the stream through assistant-ui (or the AI SDK UI runtime if the native shell cannot host assistant-ui directly).

**Tech Stack:** TypeScript, Node.js, LangGraph.js, MCP, Vercel AI SDK UI protocol, assistant-ui, Zod, React.

---

### Task 1: Establish the backend boundary

**Files:**
- Create: `frontend/server/index.ts`
- Create: `frontend/server/config.ts`
- Create: `frontend/server/types.ts`
- Modify: `frontend/package.json`
- Test: `frontend/server/config.test.ts`

- [ ] Add an HTTP server entry point with `POST /api/agent/run` and `GET /api/health`.
- [ ] Read provider credentials only from server environment variables; reject missing credentials with HTTP 503.
- [ ] Define request types for text, data-URI images, conversation id, and optional abort signal.
- [ ] Add a config test proving credentials are not read from browser storage and health reports provider readiness.
- [ ] Run `npm run lint` and the backend test command.

### Task 2: Convert H3 skills into a discoverable registry

**Files:**
- Create: `frontend/server/skills/manifest.ts`
- Create: `frontend/server/skills/h3.ts`
- Create: `frontend/server/skills/validator.ts`
- Create: `frontend/server/mcp/server.ts`
- Modify: `frontend/src/skills/h3Skills.ts`
- Test: `frontend/server/skills/validator.test.ts`

- [ ] Define a `SkillManifest` with name, description, applicability predicate, input schema, output schema, and execution function.
- [ ] Register `t2va`, `i2va`, `fl2va`, and `ref2va` from one server-side registry; do not hard-code image-count routing in the UI.
- [ ] Expose manifests and executions through an MCP server so the agent can discover descriptions at runtime.
- [ ] Implement deterministic H3 validation for required sections, shot numbering, cut timestamps, camera motion triples, and separate sound fields.
- [ ] Add tests for valid output and each invalid format condition.

### Task 3: Build the LangGraph workflow

**Files:**
- Create: `frontend/server/graph/state.ts`
- Create: `frontend/server/graph/nodes.ts`
- Create: `frontend/server/graph/h3Graph.ts`
- Create: `frontend/server/graph/stream.ts`
- Test: `frontend/server/graph/h3Graph.test.ts`

- [ ] Model graph state with request, discovered skills, draft, validation findings, evaluator feedback, iteration count, and final prompt.
- [ ] Add nodes for skill discovery, draft generation, deterministic validation, evaluator scoring, refinement, and finalization.
- [ ] Route back to refinement only when validation/evaluation fails, with a bounded iteration condition.
- [ ] Compile with a checkpointer and expose a stream of typed graph events.
- [ ] Test that the graph selects a skill from runtime manifests, retries a failing draft, and terminates with a validated prompt.

### Task 4: Stream the backend run to the client

**Files:**
- Modify: `frontend/server/index.ts`
- Create: `frontend/src/agent/agentClient.ts`
- Modify: `frontend/src/types.ts`
- Test: `frontend/server/stream.test.ts`

- [ ] Serialize graph events as the AI SDK UI message stream protocol or a documented SSE event envelope.
- [ ] Support cancellation, timeout, provider errors, and resumable conversation ids.
- [ ] Ensure tool calls/results and final text are emitted incrementally rather than after one awaited Promise.
- [ ] Add stream parsing tests for partial text, tool events, evaluator events, and terminal errors.

### Task 5: Replace the custom chat surface

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/components/AgentScreen.tsx`
- Modify: `frontend/src/components/MarkdownRenderer.tsx`
- Create: `frontend/src/components/AgentRuntime.tsx`

- [ ] Add assistant-ui and connect its runtime to `agentClient`.
- [ ] Preserve image attachments and the “apply prompt” action as runtime metadata/actions.
- [ ] Remove simulated fallback tool calls and the browser-side `runH3AgentHarness` path.
- [ ] Render streamed Markdown, tool progress, copy actions, retry, cancel, and error states through existing components/primitives.
- [ ] Keep a clearly labeled offline/mock mode only when explicitly enabled for development.

### Task 6: Verification and migration cleanup

**Files:**
- Modify: `frontend/README.md`
- Modify: `.env.example` or `frontend/.env.example`
- Remove or deprecate: `frontend/src/agent/h3AgentHarness.ts`
- Remove or deprecate: unused `executeLlmStep` in `frontend/src/components/AgentScreen.tsx`

- [ ] Document local backend startup, required environment variables, MCP skill registration, and Android/WebView proxy configuration.
- [ ] Run `npm run lint`, `npm run build`, backend unit tests, and a manual streamed run against a tool-capable provider.
- [ ] Verify no API key is present in the production JavaScript bundle or browser localStorage.
- [ ] Verify mobile and desktop layouts with streamed Markdown, images, copy, retry, and cancel interactions.

