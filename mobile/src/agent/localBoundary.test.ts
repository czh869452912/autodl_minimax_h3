import fs from 'node:fs';
import path from 'node:path';

it('keeps the production agent boundary inside the Android app', () => {
  const root = path.resolve(__dirname, '..', '..');
  expect(fs.existsSync(path.join(root, '..', 'server'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'src', 'agent', 'AgentScreen.tsx'), 'utf8')).not.toMatch(/runtimeUrl|api\/copilotkit/);
  expect(fs.readFileSync(path.join(root, 'src', 'agent', 'LocalCopilotKitProvider.tsx'), 'utf8')).not.toMatch(/runtimeUrl/);
});
