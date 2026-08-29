import fs from 'node:fs';
import path from 'node:path';

it('keeps the production agent boundary inside the Android app', () => {
  const root = path.resolve(__dirname, '..', '..');
  expect(fs.existsSync(path.join(root, '..', 'server'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'src', 'agent', 'AgentScreen.tsx'), 'utf8')).not.toMatch(/runtimeUrl|api\/copilotkit/);
  expect(fs.readFileSync(path.join(root, 'src', 'agent', 'LocalCopilotKitProvider.tsx'), 'utf8')).not.toMatch(/runtimeUrl/);
  expect(fs.readFileSync(path.join(root, 'index.js'), 'utf8')).toContain("import './src/runtimeCompatibility'");
  expect(fs.readFileSync(path.join(root, 'src', 'runtimeCompatibility.js'), 'utf8')).toMatch(/userAgent.*ReactNative/s);
  expect(fs.readFileSync(path.join(root, 'src', 'runtimeCompatibility.js'), 'utf8')).toContain('throwIfAborted');
  const metroConfig = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');
  expect(metroConfig).toContain('reactNativeStreamdown.tsx');
  expect(metroConfig).toContain('copilotKitStreamingFetch.ts');
  const streamingFetch = fs.readFileSync(path.join(root, 'src', 'shims', 'copilotKitStreamingFetch.ts'), 'utf8');
  expect(streamingFetch).toMatch(/cancel\(\).*closed = true/s);
  expect(streamingFetch).toContain('configureStreamingFetch');
});
