jest.mock('@copilotkit/react-core/v2/context', () => ({
  CopilotKitContext: require('react').createContext(null),
  LicenseContext: require('react').createContext(null),
}));
jest.mock('@copilotkit/shared', () => ({ createLicenseContextValue: jest.fn(() => ({})) }));

jest.mock('@copilotkit/react-core/v2/headless', () => ({
  CopilotKitCoreReact: jest.fn().mockImplementation((config) => ({
    config,
    runAgent: jest.fn(async () => undefined),
  })),
}));

import { createLocalCopilotKitCore, rerunLocalAgent } from './LocalCopilotKitProvider';

it('registers the local H3 agent without a runtime URL', () => {
  const agent = { agentId: 'h3-prompt-assistant' };
  const core = createLocalCopilotKitCore(agent as never);
  expect(core).toBeTruthy();
  expect((core as unknown as { config: Record<string, unknown> }).config).toEqual(expect.objectContaining({
    agents__unsafe_dev_only: { 'h3-prompt-assistant': agent },
  }));
  expect((core as unknown as { config: Record<string, unknown> }).config).not.toHaveProperty('runtimeUrl');
});

it('reuses one core for the same long-lived agent', () => {
  const agent = { agentId: 'h3-prompt-assistant' };
  expect(createLocalCopilotKitCore(agent as never)).toBe(
    createLocalCopilotKitCore(agent as never),
  );
});

it('reruns an existing agent without appending a user message', async () => {
  const agent = {
    agentId: 'h3-prompt-assistant',
    messages: [{ id: 'u1', role: 'user', content: 'same' }],
  };
  const core = createLocalCopilotKitCore(agent as never) as unknown as {
    runAgent: jest.Mock;
  };
  await rerunLocalAgent(agent as never);
  expect(core.runAgent).toHaveBeenCalledWith({ agent });
  expect(agent.messages).toHaveLength(1);
});

it('drops a failed partial assistant tail before rerunning the last user round', async () => {
  const setMessages = jest.fn(function(this: { messages: unknown[] }, messages: unknown[]) {
    this.messages = messages;
  });
  const agent = {
    agentId: 'h3-prompt-assistant',
    messages: [
      { id: 'a0', role: 'assistant', content: 'earlier' },
      { id: 'u1', role: 'user', content: 'same', attachments: [{ id: 'image-1' }] },
      { id: 'a1', role: 'assistant', content: 'partial' },
      { id: 'tool-1', role: 'tool', content: 'partial result' },
    ],
    setMessages,
  };
  const core = createLocalCopilotKitCore(agent as never) as unknown as { runAgent: jest.Mock };

  await rerunLocalAgent(agent as never);

  expect(setMessages).toHaveBeenCalledWith([
    { id: 'a0', role: 'assistant', content: 'earlier' },
    { id: 'u1', role: 'user', content: 'same', attachments: [{ id: 'image-1' }] },
  ]);
  expect(core.runAgent).toHaveBeenCalledWith({ agent });
});
