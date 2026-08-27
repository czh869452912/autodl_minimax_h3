/**
 * @deprecated Mode 2 in-app harness has been removed in favor of Mode 1 (LangGraph Server Agent).
 * All streaming agent requests are routed through runAgentStream in agentClient.ts.
 */
export const runH3AgentHarness = async (): Promise<never> => {
  throw new Error('Mode 2 client-side harness has been deprecated. Please use LangGraph agent server (/api/agent/run).');
};

