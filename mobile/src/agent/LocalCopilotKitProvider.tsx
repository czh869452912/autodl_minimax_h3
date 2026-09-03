import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CopilotKitContext, LicenseContext } from '@copilotkit/react-core/v2/context';
import type { CopilotKitContextValue, CopilotKitCoreReact as CopilotKitCoreReactInstance } from '@copilotkit/react-core/v2/context';
import { CopilotKitCoreReact } from '@copilotkit/react-core/v2/headless';
import { createLicenseContextValue } from '@copilotkit/shared';
import type { AbstractAgent } from '@ag-ui/client';

const localCores = new WeakMap<AbstractAgent, CopilotKitCoreReactInstance>();

export function createLocalCopilotKitCore(agent: AbstractAgent): CopilotKitCoreReactInstance {
  const existing = localCores.get(agent);
  if (existing) return existing;
  const agentId = String(agent.agentId || 'h3-prompt-assistant');
  const core = new CopilotKitCoreReact({
    // CopilotKit uses the in-memory agent registry when no runtime URL is set.
    // This is the same local-agent hook used by its own RN tests.
    agents__unsafe_dev_only: { [agentId]: agent },
    deferInitialConnection: true,
  });
  localCores.set(agent, core);
  return core;
}

export async function rerunLocalAgent(agent: AbstractAgent): Promise<void> {
  await createLocalCopilotKitCore(agent).runAgent({ agent });
}

export function LocalCopilotKitProvider({ children, agent, onError }: {
  children: ReactNode;
  agent: AbstractAgent;
  onError?: (error: Error) => void;
}) {
  const core = useMemo(() => createLocalCopilotKitCore(agent), [agent]);
  const [executingToolCallIds, setExecutingToolCallIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const subscription = core.subscribe({
      onToolExecutionStart: ({ toolCallId }) => setExecutingToolCallIds((previous) => new Set(previous).add(toolCallId)),
      onToolExecutionEnd: ({ toolCallId }) => setExecutingToolCallIds((previous) => {
        const next = new Set(previous);
        next.delete(toolCallId);
        return next;
      }),
      onError: ({ error }) => {
        console.error('[LocalCopilotKitProvider] Agent runtime error', error.stack ?? error.message);
        onError?.(error);
      },
    });
    return () => subscription.unsubscribe();
  }, [core, onError]);

  const contextValue = useMemo<CopilotKitContextValue>(() => ({ copilotkit: core, executingToolCallIds }), [core, executingToolCallIds]);
  const licenseValue = useMemo(() => createLicenseContextValue(undefined), []);
  return <CopilotKitContext.Provider value={contextValue}><LicenseContext.Provider value={licenseValue}>{children}</LicenseContext.Provider></CopilotKitContext.Provider>;
}
