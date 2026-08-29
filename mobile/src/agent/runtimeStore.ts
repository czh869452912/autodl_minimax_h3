import type { H3AgUiAgent } from './aguiAgent';
import type { H3AgentConfig } from './agentTypes';
import type { LocalThreadSnapshot, LocalThreadStore } from './threadStore';

export type PromptAgentConfig = H3AgentConfig;

type RuntimeEvent =
  | { type: 'snapshot'; snapshot: LocalThreadSnapshot }
  | { type: 'error'; message: string };

export type PromptRuntime = {
  agent: H3AgUiAgent;
  getSnapshot: () => LocalThreadSnapshot;
  updateMetadata: (snapshot: LocalThreadSnapshot) => void;
  subscribe: (listener: (event: RuntimeEvent) => void) => () => void;
};

type AgentFactory = (config: PromptAgentConfig) => H3AgUiAgent;

function defaultAgentFactory(config: PromptAgentConfig): H3AgUiAgent {
  // Keep the registry's pure lifecycle helpers importable in Jest and other
  // lightweight environments without eagerly loading the DeepAgents bundle.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createH3Agent } = require('./h3Agent') as typeof import('./h3Agent');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { H3AgUiAgent } = require('./aguiAgent') as typeof import('./aguiAgent');
  return new H3AgUiAgent(createH3Agent(config) as never);
}

function configKey(config: PromptAgentConfig): string {
  return `${config.endpoint}\u0000${config.model}\u0000${config.apiKey}\u0000${config.timeoutMs}\u0000${config.maxRetries}`;
}

export function createPromptRuntimeRegistry(
  createAgent: AgentFactory = defaultAgentFactory,
) {
  const runtimes = new Map<string, PromptRuntime>();

  return {
    ensure(
      config: PromptAgentConfig,
      initial: LocalThreadSnapshot,
      threadStore: LocalThreadStore,
    ): PromptRuntime {
      const key = `${configKey(config)}\u0000${initial.threadId}`;
      const existing = runtimes.get(key);
      if (existing) {
        existing.updateMetadata(initial);
        return existing;
      }

      const agent = createAgent(config);
      agent.threadId = initial.threadId;
      agent.setMessages(initial.messages);
      agent.setState(initial.state);
      let snapshot = initial;
      let saveQueue = Promise.resolve();
      const listeners = new Set<(event: RuntimeEvent) => void>();
      const emit = (event: RuntimeEvent) => {
        for (const listener of listeners) listener(event);
      };
      const persist = (messages: readonly unknown[], state: unknown) => {
        snapshot = {
          ...snapshot,
          messages: [...messages] as never,
          state: { ...(state as Record<string, unknown>) } as never,
          updatedAt: Date.now(),
        };
        emit({ type: 'snapshot', snapshot });
        saveQueue = saveQueue
          .then(() => threadStore.save(snapshot))
          .catch((reason) =>
            emit({
              type: 'error',
              message:
                reason instanceof Error
                  ? `本地会话保存失败：${reason.message}`
                  : '本地会话保存失败',
            }),
          );
      };
      agent.subscribe({
        onMessagesChanged: ({ messages, state }) => persist(messages, state),
        onStateChanged: ({ messages, state }) => persist(messages, state),
      });

      const runtime: PromptRuntime = {
        agent,
        getSnapshot: () => snapshot,
        updateMetadata: (next) => {
          snapshot = {
            ...snapshot,
            customTitle: next.customTitle,
            createdAt: next.createdAt,
          };
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      runtimes.set(key, runtime);
      return runtime;
    },
  };
}

export const promptRuntimeRegistry = createPromptRuntimeRegistry();
