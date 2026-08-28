# In-App Agent Runtime Design

## Reader And Outcome

This document is for engineers implementing and reviewing the Prompt Assistant. After reading it, a maintainer should be able to identify which code belongs in the Android APK, which network access is still expected, and how to verify that no remote agent runtime is required.

## Decision Summary

The Prompt Assistant will use a real Deep Agents JavaScript harness inside the APK's WebView, paired with `assistant-ui`'s local runtime for the chat surface. The agent will receive the complete official MiniMax H3 skill tree as runtime files and will autonomously choose which skills and references to read over multiple model/tool rounds.

The model endpoint remains configurable through an OpenAI-compatible API. That API is the only remote dependency in the production APK. Agent planning, tool dispatch, skill loading, iteration, streaming state, and thread state all execute locally in the APK. There is no CopilotKit runtime, Express process, LangGraph server, Node service, LAN computer, or remote agent host in the production path.

```text
Android APK
├── Native shell
│   ├── WebView asset loading
│   ├── encrypted settings / API-key bridge
│   └── optional native HTTP transport fallback
└── WebView
    ├── assistant-ui LocalRuntime
    ├── deepagents/browser
    ├── local StateBackend
    ├── complete MiniMax H3 skill files
    └── OpenAI-compatible model adapter
                 │
                 └── HTTPS model API (configurable provider)
```

## Why The Current Shape Must Change

The current assistant has a browser-side/template path and a CopilotKit-style provider contract that expects an agent endpoint. That architecture makes the agent runtime an external service, even when the UI itself is packaged in the APK. It also encourages application-owned prompt templates and fixed orchestration.

The target behavior requires the opposite boundary: the APK owns the agent loop, while the model API is a replaceable inference dependency. The official H3 skills must remain authoritative files, including `SKILL.md`, references, and any supporting assets. They must not be reduced to an image-count manifest or copied into hard-coded prompt constants.

## Runtime Responsibilities

### Deep Agents in the WebView

`deepagents/browser` is the agent harness. It owns the model/tool loop, planning, filesystem-like state, context management, multi-round iteration, cancellation, and optional subagent behavior supported by the browser build. The application supplies the model adapter, the initial user input, the skill files, and a small set of safe app tools.

The application must not implement a second ReAct loop, fixed graph, skill-specific branch table, or response truncation layer. A run is complete only when the agent decides that it has enough information to produce the final prompt result or reports a clear failure.

### `assistant-ui` LocalRuntime

`assistant-ui` provides the message model, streaming updates, thread operations, stop/retry states, and composable chat components. Its local runtime calls a `ChatModelAdapter` implemented by the in-app Deep Agents runner. The UI observes agent events and renders assistant text, tool activity, errors, and the final result without owning orchestration.

The page keeps the existing H3 result action: users can copy the final prompt and apply it to the existing generation screen. This is a thin presentation/action layer, not an alternate agent implementation.

### Native Android Shell

The native layer continues to load the bundled WebView assets and owns sensitive configuration storage. API keys are read from Android Keystore-backed settings and passed to the in-app model adapter at runtime; they are never committed to assets or persisted in ordinary browser storage.

Direct WebView requests are the default transport. If a provider rejects browser requests because of CORS or WebView networking restrictions, the native layer may expose a narrow HTTPS request bridge. That bridge transports model requests and streamed responses only; it does not host or execute the agent.

## Full Official Skill Loading

The MiniMax H3 repository's `skills/` directory is bundled unchanged into the APK. The bundle includes every official skill directory, each complete `SKILL.md`, and all referenced files such as the H3 prompt references. Build tooling may generate an asset index or byte payload map, but it must preserve paths and file contents exactly.

At run start, the app exposes those files to Deep Agents' `StateBackend` as virtual files. The agent can inspect skill metadata, read the matching complete `SKILL.md`, and progressively read references or assets as needed. Multiple skills may be selected in one run. The application does not decide the skill sequence and does not splice a shortened skill prompt into the system message.

The system policy only establishes safety and product boundaries: use official skill instructions as the source of truth, combine skills when the request warrants it, do not claim unavailable external actions occurred, and return a pre-production package when a skill depends on tools that are not present in the APK.

## Model Adapter

The adapter accepts the existing app settings:

- OpenAI-compatible base URL
- model identifier
- API key
- optional request headers or provider-specific settings supported by the current configuration model

The adapter must support streaming text and tool calls required by Deep Agents. It should fail early with an actionable configuration error when credentials, endpoint, or model capabilities are missing. A provider-specific SDK may be used only behind this adapter; the rest of the app depends on the OpenAI-compatible contract.

The APK still needs network access to call the configured model. “Fully in app” means the agent runtime and all orchestration are local, not that inference is offline. An offline model is a separate future capability and is not part of this migration.

## State And Persistence

Each agent run gets a local `StateBackend` containing the bundled skills plus its working files. The UI persists thread messages, identifiers, timestamps, and final H3 results in local app storage so a user can reopen the assistant after navigation or process recreation.

The persisted representation must be sufficient to restore the visible conversation and rebuild the agent's virtual files when a thread resumes. No server checkpointer or remote thread store is required. Storage failures must be surfaced as recoverable UI errors rather than silently discarding the conversation.

## UI Composition

The existing prompt assistant page remains the entry point, but its data flow changes:

1. The user enters a request and optional image/file parts.
2. Send becomes enabled when the request is non-empty and the runtime is ready; it must not depend on a remote health endpoint.
3. `assistant-ui` streams the local agent's messages and activity.
4. Tool/skill activity is shown as compact, collapsible progress so users can understand that multiple autonomous rounds occurred without exposing internal implementation details as a fixed workflow.
5. Stop cancels the active local run. Retry starts a new run from the preserved thread. Errors identify configuration, transport, model capability, skill loading, iteration-limit, and persistence failures separately.
6. The final H3 prompt result supports copy and the existing apply action.

The UI may use existing component primitives and theme tokens. It must not reintroduce the old handwritten SSE parser, trajectory reducer, or fixed “stage” cards as the source of truth for agent state.

## Failure And Safety Rules

- Missing API key or endpoint: show a configuration error and keep the composer usable for correction.
- Network, TLS, CORS, or native bridge failure: show a retryable transport error with no fabricated result.
- Model does not support the required tool-call/streaming behavior: show a capability error before or during the run.
- Skill asset missing or unreadable: identify the skill path and stop the run; never silently substitute a shortened template.
- Agent reaches its configured iteration/context limit: preserve partial trace, explain that the run stopped, and allow retry.
- User cancellation: stop model/tool work and mark the run cancelled without presenting partial text as final.
- API keys and request authorization headers: keep them out of the JavaScript bundle, ordinary localStorage, logs, and persisted message records.
- Production model traffic: use HTTPS and avoid logging request bodies by default.

## Non-Goals And Rejected Alternatives

### Not A Remote Agent Service

CopilotKit runtime, Express, LangSmith Agent Server, and a LAN development machine may remain useful for experiments or a separate desktop deployment, but none is required or referenced by the APK's production entry point.

### Not An Embedded Node Server

Packaging a Node runtime and starting a local server inside Android adds a large native/runtime surface, lifecycle problems, and another HTTP boundary. It does not improve the agent behavior compared with the browser-native Deep Agents build.

### Not A Handwritten Harness

A custom loop would require the application to own context trimming, tool state, cancellation, retries, and skill loading. That is precisely the infrastructure this decision avoids and would make future Deep Agents updates harder to adopt.

### Not Fixed Skill Templates

Application code must not encode per-skill prompt templates, hard-coded image-count rules, or a predetermined skill pipeline. Official files and the agent's autonomous decisions are the behavior under test.

## Verification And Acceptance

The implementation is acceptable when all of the following are true:

- An APK can start the assistant with no Express, Node, CopilotKit, LangSmith, or LAN process running.
- After local model settings are supplied, the composer enables send and a request produces more than one model/tool round when the task requires it.
- The run trace shows the actual official skills and references read by the agent.
- The complete H3 skill files are present in the packaged APK and are loaded through the local state backend.
- A mocked OpenAI-compatible streaming/tool-call provider can drive the harness in automated tests without network access.
- Restarting the app restores the visible thread and rebuilds its local agent state without a server checkpointer.
- Missing configuration, unavailable transport, unsupported model capabilities, asset errors, cancellation, and iteration limits each produce an explicit UI state.
- The final prompt can be copied and applied to the existing generation flow.
- The browser bundle contains no remote agent endpoint as a required dependency and no old template/SSE fallback path.

## Migration Sequence

1. Add and verify the browser-compatible Deep Agents and `assistant-ui` runtime dependencies.
2. Bundle the complete official H3 skill tree and add an asset integrity test.
3. Implement the OpenAI-compatible model adapter and local Deep Agents runner behind a small app-facing interface.
4. Replace the provider-dependent chat surface with `assistant-ui` LocalRuntime and connect the existing result/apply action.
5. Add local thread persistence, cancellation, failure states, and the optional native transport bridge only if direct WebView transport is insufficient.
6. Remove the old template graph, fixed skill manifest, remote-agent client, and endpoint-dependent send gating.
7. Verify with unit tests, mocked multi-round integration tests, and an APK smoke test run without any local server.

## Reference Documentation

- [Deep Agents overview](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [Deep Agents backends and `StateBackend`](https://docs.langchain.com/oss/javascript/deepagents/backends)
- [Deep Agents skills and progressive disclosure](https://docs.langchain.com/oss/javascript/deepagents/skills)
- [assistant-ui custom/local runtime](https://www.assistant-ui.com/docs/runtimes/custom/overview)
- [MiniMax H3 official skills](https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills)

