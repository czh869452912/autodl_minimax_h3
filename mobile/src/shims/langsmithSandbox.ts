/**
 * DeepAgents' browser bundle re-exports its optional LangSmith sandbox backend.
 * The local Android harness uses StateBackend only, so keep that optional,
 * server-only transport outside the APK dependency graph.
 */
export class LangSmithResourceNotFoundError extends Error {}
export class LangSmithSandboxError extends Error {}
export class SandboxClient {
  constructor() { throw new Error('LangSmith Sandbox is unavailable in the local Android harness'); }
}
