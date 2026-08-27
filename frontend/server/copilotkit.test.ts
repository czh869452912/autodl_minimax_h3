import { describe, expect, it } from 'vitest';
import { createH3CopilotRouter } from './copilotkit';

describe('CopilotKit runtime wiring', () => {
  it('creates an Express router backed by the Deep Agents H3 agent', () => {
    const router = createH3CopilotRouter({
      apiKey: 'test-key',
      endpoint: 'https://api.minimaxi.com/v1',
      model: 'MiniMax-M2.7',
    });

    expect(typeof router).toBe('function');
    expect((router as { stack?: unknown[] }).stack?.length).toBeGreaterThan(0);
  });
});
