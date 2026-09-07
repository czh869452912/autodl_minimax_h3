# Prompt Agent Runtime Design

## Goal

Replace the browser-side/template LangGraph prompt assistant with an embeddable, maintained agent runtime that uses MiniMax H3's official skills without copying their prompt templates into application code.

## Decision

Use Deep Agents JS as the server-owned agent harness, CopilotKit v2 as the prebuilt React chat/runtime surface, and LangSmith Agent Server as the production persistence and run infrastructure. Keep the existing Vite/Android WebView shell and Express server as the integration boundary.

The official MiniMax H3 skill directory is mounted unchanged as a Deep Agents skill source. The agent decides which skills to read and combine through the native skills progressive-disclosure mechanism. The application does not maintain an image-count manifest, a custom graph, a template draft generator, or a client-side fallback harness.

## Scope

### In scope

- Real server-side multi-step tool-calling and skill selection.
- Complete `h3-prompt-writing` skill files, including `references/base-en.txt` and `references/ref-en.txt`.
- CopilotKit prebuilt chat, streaming state, stop/retry/error handling, and thread identity.
- MiniMax OpenAI-compatible model configuration kept on the server.
- Existing image attachment and "apply prompt" business action.
- Explicit pre-production fallback for official Hub-only skills when their required Hub tools are unavailable.

### Out of scope

- Reimplementing MiniMax Hub's Canvas or `hub_*` tool runtime.
- Claiming final video generation for a Hub-only skill when its required tools are not connected.
- A custom MCP registry solely for reading local H3 skill files.
- Rebuilding chat primitives, message state, or stream parsing in application code.

## Runtime Boundaries

```text
React/Vite/Android WebView
  -> CopilotKit v2 CopilotChat
  -> AG-UI/CopilotKit runtime endpoint
  -> Deep Agents JS
  -> official H3 skills + app tools
  -> MiniMax OpenAI-compatible API
```

Deep Agents owns planning, tool loops, skill loading, context compression, subagents, and checkpoints. CopilotKit owns the chat experience and agent event projection. LangSmith Agent Server is the production deployment target for durable threads, reconnects, and queued runs. Express remains the local adapter and development entry point.

## Data Flow

1. The user submits text and optional multimodal attachments through `CopilotChat`.
2. CopilotKit sends the conversation and attachment parts to the server runtime.
3. Deep Agents inspects skill frontmatter, reads only matching full `SKILL.md` files and references, and chooses one or more skills.
4. The agent uses available app tools to analyze assets and produce a prompt or pre-production package.
5. CopilotKit streams assistant text, tool calls, skill progress, errors, and final structured data to the UI.
6. The H3 result card exposes copy and the existing `onApplyPrompt` action.

## Hub-only Skill Policy

The H3 repository marks eight style skills as MiniMax Hub-compatible only. They may be loaded unchanged, but their output must be labeled as a pre-production package unless the runtime has the listed Hub tools. The agent's system instructions must enforce this policy and never claim that an unavailable generation or Canvas action ran.

## Error and Safety Behavior

- Missing model credentials returns a visible runtime error; there is no automatic browser execution fallback.
- Abort requests stop the active agent run through the runtime.
- Provider and tool failures are rendered through the runtime's error state and remain retryable.
- Attachment limits and MIME validation happen at the integration boundary.
- API keys never enter the browser bundle or local storage.

## UI Composition

Use the prebuilt CopilotKit chat surface as the primary assistant page. Customize only labels, theme tokens, attachment adapters, and the final H3 result renderer. The runtime state inspector is a compact, collapsible panel driven by CopilotKit/AG-UI events rather than a hand-maintained fixed pipeline.

## Acceptance Criteria

- A request can produce more than one model/tool step without application-side orchestration.
- The run trace identifies the actual skills and tools selected by the agent.
- `h3-prompt-writing` reads its official reference files at runtime.
- A disconnected backend produces an error rather than a locally generated template.
- Threads can be resumed by ID after reload or stream interruption in the production runtime.
- Final H3 output can be copied or applied to the existing generation page.
- Frontend build, typecheck, and tests pass without server graph code bundled into the browser.
