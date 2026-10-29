import type { PromptRuntime, RuntimeEvent } from './runtimeStore';
import type { SubmissionCommand, SubmissionReceipt } from './submissionCommands';
import { createAgentId } from './submissionCommands';
import { readPromptRuns } from './runState';

export type AgentRunHandle = { receipt: SubmissionReceipt; completion: Promise<void> };
export interface AgentRuntimeAdapter {
  start(command: SubmissionCommand): Promise<AgentRunHandle>;
  retry(runId?: string): Promise<AgentRunHandle>;
  cancel(): void;
  subscribe(listener: (event: RuntimeEvent) => void): () => void;
  recovery(): 'running' | 'interrupted' | 'ready' | 'reload-required';
}

function executeRuntime(runtime: PromptRuntime, runId: string): Promise<void> {
  const { createLocalCopilotKitCore } = require('./LocalCopilotKitProvider') as typeof import('./LocalCopilotKitProvider');
  return createLocalCopilotKitCore(runtime.agent).runAgent({ agent: runtime.agent, runId }).then(() => undefined);
}

export function createAgentRuntimeAdapter(
  runtime: PromptRuntime,
  execute = (runId: string) => executeRuntime(runtime, runId),
): AgentRuntimeAdapter {
  const starts = new Map<string, Promise<AgentRunHandle>>();
  const start = (command: SubmissionCommand) => {
    const existing = starts.get(command.id);
    if (existing) return existing;
    const pending = (async () => {
      const receipt = await runtime.accept(command);
      const completion = runtime.disposed() || receipt.executionReady === false
        ? Promise.resolve() : execute(receipt.runId);
      // Callers attach their UI error handler after durable acceptance resolves.
      void completion.catch(() => undefined);
      return { receipt, completion };
    })();
    starts.set(command.id, pending);
    void pending.catch(() => starts.delete(command.id));
    return pending;
  };
  return {
    start,
    retry: async runId => {
      runtime.agent.prepareRetry(runId);
      const retry = runtime.agent.getPreparedRetry();
      const message = runtime.agent.messages.find(item => item.id === retry?.userMessageId);
      if (!message) throw new Error('没有可重试的用户消息');
      return start({ id: createAgentId(), runId: createAgentId(), draftRevision: -1, message, retryOf: retry?.retryOf });
    },
    cancel: () => runtime.agent.abortRun(),
    subscribe: runtime.subscribe,
    recovery: () => {
      if (runtime.needsReload()) return 'reload-required';
      if (runtime.agent.isRunning) return 'running';
      return readPromptRuns(runtime.getSnapshot().state).at(-1)?.status === 'interrupted' ? 'interrupted' : 'ready';
    },
  };
}
