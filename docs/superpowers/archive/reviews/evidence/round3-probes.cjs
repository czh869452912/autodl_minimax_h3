// Manual audit probes for the reviewed baseline, not desired-behavior regression tests.
// Run from the repository root: node docs/superpowers/reviews/evidence/round3-probes.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../..');
const mobile = path.join(root, 'mobile');
const appRequire = createRequire(path.join(mobile, 'package.json'));
const ts = appRequire('typescript');
const originalLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  if (!filename.startsWith(path.join(mobile, 'src') + path.sep)) {
    if (originalLoader) return originalLoader(module, filename);
    throw new Error(`Unexpected TypeScript module: ${filename}`);
  }
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
const source = (name) => fs.readFileSync(path.join(mobile, name), 'utf8');
const agentModule = (name) => appRequire(path.join(mobile, 'src/agent', name));
const { parsePromptResult } = agentModule('promptParser.ts');
const { adaptDeepAgentStream } = agentModule('deepAgentStream.ts');
const { H3AgUiAgent } = agentModule('aguiAgent.ts');
const { reconcilePromptVersions, restorePromptVersion } = agentModule('promptVersions.ts');
const { assignImageDisplayNames } = agentModule('imageMentions.ts');
const { applyImageIdentities } = agentModule('imageMessageIdentity.ts');
const { getOfficialH3SkillFiles } = agentModule('skillBundle.ts');
const report = (id, value) => console.log(JSON.stringify({ id, ...value }));
const prompt = 'integrated_multimodal_description: A scene.\noverall_soundscape: Wind.\nnon_diegetic_music: None.';
const fenced = '```h3-prompt\n' + prompt + '\n```';
const runRecord = { id: 'r1', userMessageId: 'u1', status: 'failed', startedAt: 1, endedAt: 2, messageIds: ['a1'], tools: [] };
async function collect(iterable) { const result = []; for await (const value of iterable) result.push(value); return result; }
async function* items(values) { yield* values; }
async function observeRun(messages, state = {}, retry) {
  let graphInput;
  const agent = new H3AgUiAgent({ stream: async function* (input) { graphInput = input; } });
  agent.setMessages(messages);
  agent.setState(state);
  if (retry) agent.prepareRetry(retry);
  const events = [];
  await new Promise((resolve, reject) => agent.run({ threadId: 'audit', runId: 'audit-run', messages, state, tools: [], context: [], forwardedProps: {} }).subscribe({ next: event => events.push(event), error: reject, complete: resolve }));
  return { graphInput, events };
}
async function main() {
  const ast = ts.createSourceFile('PromptAssistantUi.tsx', source('src/agent/PromptAssistantUi.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let bodyCondition;
  const walk = (node) => {
    if (ts.isConditionalExpression(node) && node.condition.getText(ast).includes('item.text && !(item.prompt')) bodyCondition = node.condition.getText(ast);
    ts.forEachChild(node, walk);
  };
  walk(ast);
  assert.ok(bodyCondition, 'Find the actual JSX visibility condition');
  const content = fenced + '\n' + fenced;
  const parsed = parsePromptResult(content, 'a');
  const visible = Boolean(new Function('item', 'completedMessageIds', `return (${bodyCondition});`)({ id: 'a', text: content, prompt: parsed }, ['a']));
  assert.equal(parsed, null);
  assert.equal(visible, true);
  report('T6', { parserReturnsNull: true, actualJsxBodyVisible: visible });

  const interleaved = await collect(adaptDeepAgentStream(items([
    { id: 'a', type: 'ai_chunk', content: 'A' },
    { id: 'b', type: 'ai_chunk', content: 'B' },
    { id: 'a', type: 'ai_chunk', content: 'C' },
  ]), 'fallback', new AbortController().signal));
  const text = interleaved.filter(event => event.type === 'TEXT_MESSAGE_CONTENT').map(event => event.delta).join('');
  assert.equal(text, 'AB');
  report('G1', { input: 'ABC', output: text });

  const conflicted = await collect(adaptDeepAgentStream(items([
    { id: 'a', type: 'ai_chunk', content: 'cat' }, { id: 'a', type: 'ai', content: 'car' },
  ]), 'fallback', new AbortController().signal));
  const conflictText = conflicted.filter(event => event.type === 'TEXT_MESSAGE_CONTENT').map(event => event.delta).join('');
  assert.equal(conflictText, 'catcar');
  report('G2', { streamed: 'cat', snapshot: 'car', output: conflictText });

  const history = [{ id: 'u1', role: 'user', content: 'start' }, { id: 'a1', role: 'assistant', content: 'partial idea' }, { id: 'u2', role: 'user', content: 'continue above' }];
  const state = { h3Runs: [runRecord, { ...runRecord, id: 'r2', userMessageId: 'u2', messageIds: [] }] };
  for (const retry of [undefined, 'r2']) {
    const { graphInput } = await observeRun(history, state, retry);
    assert.deepEqual(graphInput.messages.map(message => message.id), ['u1', 'u2']);
    report(retry ? 'G4-retry-ancestor' : 'G4-followup', { modelMessageIds: graphInput.messages.map(message => message.id) });
  }

  const originalError = console.error;
  let broken;
  try {
    console.error = () => undefined;
    broken = await observeRun([
      { id: 'a', role: 'assistant', content: 'partial', toolCalls: [{ id: 't', type: 'function', function: { name: 'read_file', arguments: '{' } }] },
      { id: 'result', role: 'tool', toolCallId: 't', content: 'saved result' },
    ]);
  } finally { console.error = originalError; }
  assert.equal(broken.graphInput, undefined);
  assert.equal(broken.events.at(-1).type, 'RUN_ERROR');
  report('G3', { graphReached: false, error: broken.events.at(-1).message });

  const image = { id: 'image', type: 'image', status: 'ready', source: { type: 'data', value: Buffer.alloc(1024, 1).toString('base64'), mimeType: 'image/png' } };
  const messages = [{ id: 'u', role: 'user', content: 'reference', attachments: [image] }, { id: 'a', role: 'assistant', content: fenced }];
  let versions = reconcilePromptVersions(messages, ['a'], [], 1);
  for (let index = 0; index < 5; index++) versions = restorePromptVersion(versions, versions[0].id, index + 2);
  const snapshot = JSON.stringify({ messages, state: { h3Composer: { text: '', attachments: [image] }, h3Versions: versions } });
  const copies = snapshot.split(image.source.value).length - 1;
  assert.equal(copies, 8);
  report('S1', { restores: 5, versions: versions.length, embeddedImageCopies: copies, serializedBytes: Buffer.byteLength(snapshot) });
  const twoArtifacts = [...messages, { id: 'b', role: 'assistant', content: fenced }];
  const both = reconcilePromptVersions(twoArtifacts, ['a', 'b'], [], 10);
  const clipped = both.slice(-1);
  const rebuilt = reconcilePromptVersions(twoArtifacts, ['a', 'b'], clipped, 11);
  assert.equal(rebuilt.length, 2);
  assert.equal(rebuilt.at(-1).id, 'version-a');
  report('S5-pruning', { retainedVersions: clipped.length, afterReconcile: rebuilt.length, deletedGeneratedVersionRecreatedFromHistory: rebuilt.at(-1).id });

  const unnamed = [{ id: 'image', status: 'ready' }];
  const named = assignImageDisplayNames(unnamed, new Map(), 1).attachments;
  assert.ok(named.find(item => item.id === 'image').displayName);
  report('H4', { missingInputDisplayNameGetsGeneratedName: named[0].displayName });
  const shuffled = applyImageIdentities({ role: 'user', content: [{ type: 'image', metadata: { attachmentId: 'b' } }, { type: 'image', metadata: { attachmentId: 'a' } }] }, [{ attachmentId: 'a', displayName: 'image1' }, { attachmentId: 'b', displayName: 'image2' }]);
  assert.equal(shuffled.content[0].metadata.attachmentId, 'a');
  report('G11', { firstImageOriginalId: 'b', firstImageDecoratedId: shuffled.content[0].metadata.attachmentId });

  const upload = source('node_modules/@copilotkit/react-native/src/hooks/use-attachments.ts');
  assert.ok(upload.includes('const DEFAULT_MAX_SIZE = 20 * 1024 * 1024'));
  assert.ok(upload.includes('if (file.size > maxSize)'));
  report('U4', { sdkPerFileLimitMiB: 20, evidence: 'installed use-attachments.ts validation' });
  const rnText = source('node_modules/react-native/Libraries/Text/Text.js');
  assert.ok(rnText.includes('processedProps.allowFontScaling = allowFontScaling !== false'));
  report('P11', { nativeFontScalingDefaultsOn: true });
  const deepagents = appRequire('deepagents/browser');
  report('A1', { actualDefaultSummarization: deepagents.computeSummarizationDefaults({}) });
  const skillFiles = getOfficialH3SkillFiles();
  report('A12', { virtualFileCount: Object.keys(skillFiles).length, virtualFileUtf8Bytes: Object.values(skillFiles).reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (originalLoader) require.extensions['.ts'] = originalLoader;
  else delete require.extensions['.ts'];
});
