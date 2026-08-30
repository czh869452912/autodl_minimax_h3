# Provider Isolation and Extensible Adapter Foundation

## Goal

Separate LLM networking from generation-provider networking now, while making AutoDL and future providers such as NovelAI independently replaceable.

## Scope

This change establishes the provider boundary and migrates AutoDL. It does not implement NovelAI, agent-initiated submission, arbitrary remote plugins, or a generic user-configured HTTP adapter.

## Architecture

```text
Prompt Assistant -> LLM service -> LLM streaming transport
Generation page -> WorkflowRuntime -> PlatformAdapter -> Provider client -> provider REST transport
```

The runtime knows only `PlatformAdapter`. An adapter owns provider protocol, endpoint, authentication, payload mapping, polling, and provider error normalization. A provider client owns JSON HTTP mechanics for that provider. No generation adapter may import LLM shims, LLM settings, or global fetch behavior.

## Transport boundary

The app exposes a small injected transport contract:

```ts
type HttpTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
```

The bootstrap captures the native React Native fetch before CopilotKit installs its LLM streaming fetch. Provider clients receive that captured transport through dependency injection. Tests can inject a fake transport. Provider code must never inspect `__originalFetch`, CopilotKit modules, or LLM configuration.

LLM streaming remains an LLM-owned concern. Its existing model/shim path may continue to use the streaming implementation, but that implementation must not be the default transport for provider clients.

## Provider modules

Each provider lives under `src/workflows/providers/<provider>` and contains:

- `client.ts`: provider REST endpoint, headers, JSON response parsing, timeout/error translation.
- `adapter.ts`: platform adapter implementing workflow operations by calling its client.
- `mapping.ts`: schema input to provider payload and provider response to normalized job/artifact values.
- tests for client transport calls, mapping, and adapter behavior.

AutoDL is the first migrated provider. NovelAI can later add a separate module without changing LLM code, AutoDL code, or renderer/runtime contracts.

## Error model

Transport errors are normalized with provider id and operation, preserving the original message and status when available. DNS, timeout, authentication, HTTP, malformed response, and provider-declared task failures remain distinguishable. The UI may localize these errors, but must not label provider errors as LLM errors.

## Configuration and trust

Provider endpoint and credential kind are code-owned by the adapter manifest for built-in providers. Workflow config may select an installed adapter and operation but cannot provide arbitrary URLs, headers, scripts, or component paths. Future providers add code-owned manifests and clients.

## Compatibility

Existing workflow runtime, job persistence, task projections, and H3 payload mapping remain unchanged. The only transport change is that AutoDL no longer uses the CopilotKit global streaming fetch. Existing explicit test fetch injection remains supported.

## Acceptance criteria

1. AutoDL submit and poll use an injected/provider-native transport, never the LLM streaming fetch.
2. AutoDL client tests assert exact URL, method, headers, and JSON body.
3. LLM streaming tests remain green and do not import AutoDL modules.
4. A provider adapter can be registered without changes to `WorkflowRuntime`.
5. Provider errors preserve category and do not contain the misleading LLM network message.
6. Typecheck and the full Jest suite pass.
