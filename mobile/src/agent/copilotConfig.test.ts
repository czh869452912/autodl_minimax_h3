import { getAgentHeaders, getCopilotRuntimeUrl } from './copilotConfig';

describe('CopilotKit runtime configuration', () => {
  it('uses the Android emulator loopback alias for a local server', () => {
    expect(getCopilotRuntimeUrl('android-emulator', 'http://127.0.0.1:8200')).toBe(
      'http://10.0.2.2:8200/api/copilotkit',
    );
  });

  it('keeps an explicitly configured path while normalizing its suffix', () => {
    expect(getCopilotRuntimeUrl('custom', 'https://agent.example.com/api/copilotkit/')).toBe(
      'https://agent.example.com/api/copilotkit',
    );
  });

  it('does not send an LLM key to the runtime', () => {
    expect(getAgentHeaders('mobile-session-token')).toEqual({
      Authorization: 'Bearer mobile-session-token',
      Accept: 'application/json',
    });
  });

  it('omits authorization until the user configures an access token', () => {
    expect(getAgentHeaders('')).toEqual({ Accept: 'application/json' });
  });
});
