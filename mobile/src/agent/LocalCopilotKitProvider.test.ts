jest.mock('@copilotkit/react-core/v2/context', () => ({
  CopilotKitContext: require('react').createContext(null),
  LicenseContext: require('react').createContext(null),
}));
jest.mock('@copilotkit/shared', () => ({ createLicenseContextValue: jest.fn(() => ({})) }));

jest.mock('@copilotkit/react-core/v2/headless', () => ({
  CopilotKitCoreReact: jest.fn().mockImplementation((config) => ({ config })),
}));

import { createLocalCopilotKitCore } from './LocalCopilotKitProvider';

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
