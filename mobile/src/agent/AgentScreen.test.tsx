import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState, Text, type AppStateStatus } from 'react-native';
import type { LocalThreadSnapshot } from './threadStore';

const mockRows = new Map<string, LocalThreadSnapshot>();
const mockDefinition = require('../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json');
const mockActiveWorkflow = { workflowId: mockDefinition.id, version: 'active-test', contentHash: 'active-hash', definitionJson: JSON.stringify({ ...mockDefinition, version: 'active-test' }) };
const mockCatalog = { bootstrap: jest.fn(async (): Promise<void> => undefined), listActive: jest.fn(async () => [mockActiveWorkflow]), getActive: jest.fn(async () => mockActiveWorkflow) };
jest.mock('../workflows/registry/builtin', () => ({ createAppWorkflowCatalog: () => mockCatalog }));
const mockStore = {
  recoverInterruptedRuns: async () => undefined,
  list: async () => [...mockRows.values()],
  listSummaries: async () => [...mockRows.values()],
  load: async (id: string) => mockRows.get(id) ?? null,
  save: jest.fn(async (snapshot: LocalThreadSnapshot) => { mockRows.set(snapshot.threadId, snapshot); }),
  rename: async (id: string, title: string, updatedAt: number) => {
    const row = mockRows.get(id);
    if (row) mockRows.set(id, { ...row, customTitle: title, updatedAt });
  },
  remove: async (id: string) => { mockRows.delete(id); },
};
function mockCreateAgent() {
  const subscribers = new Set<(event: { messages: unknown[]; state: object }) => void>();
  return {
    threadId: '', agentId: 'test', messages: [] as unknown[], state: {},
    setMessages(messages: unknown[]) { this.messages = messages; },
    setState(state: object) { this.state = state; },
    subscribe(subscriber: { onMessagesChanged: (event: { messages: unknown[]; state: object }) => void }) {
      subscribers.add(subscriber.onMessagesChanged);
      return { unsubscribe: () => subscribers.delete(subscriber.onMessagesChanged) };
    },
    emit(messages: unknown[]) { this.messages = messages; for (const listener of subscribers) listener({ messages, state: {} }); },
    dispose() {},
  };
}
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate() {} }),
  useFocusEffect: (effect: () => void) => { require('react').useEffect(effect, [effect]); },
}));
jest.mock('../settings/storage', () => ({ readSettings: async () => ({ llmApiKey: 'key', llmEndpoint: 'https://example.invalid', llmModel: 'h3', llmTimeoutSeconds: '600', llmMaxRetries: '2' }) }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: () => ({}) }));
jest.mock('./threadStore', () => ({ createLocalThreadStore: () => mockStore }));
jest.mock('./promptDraft', () => ({ createPromptDraftStore: () => ({}) }));
jest.mock('./modelAdapter', () => ({ getH3AgentConfigError: () => undefined }));
jest.mock('./imageAttachmentUpload', () => ({ readImageAsDataSource: jest.fn() }));
jest.mock('./runtimeStore', () => ({
  promptRuntimeRegistry: jest.requireActual('./runtimeStore').createPromptRuntimeRegistry(() => mockCreateAgent()),
}));
jest.mock('./LocalCopilotKitProvider', () => ({ LocalCopilotKitProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@copilotkit/react-native', () => ({ CopilotChat: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('./PromptAssistantUi', () => ({ PromptAssistantUi: () => null }));

import AgentScreen from './AgentScreen';
import { PromptAssistantUi } from './PromptAssistantUi';
import { promptRuntimeRegistry } from './runtimeStore';

const config = { apiKey: 'key', endpoint: 'https://example.invalid', model: 'h3', timeoutMs: 600000, maxRetries: 2 };
const thread = (threadId: string, updatedAt = 1): LocalThreadSnapshot => ({ threadId, messages: [], state: {}, createdAt: 1, updatedAt });
let tree: ReturnType<typeof create>;
const ui = () => tree.root.findByType(PromptAssistantUi).props;
beforeEach(() => { mockRows.clear(); mockStore.save.mockClear(); mockCatalog.bootstrap.mockReset().mockResolvedValue(undefined); mockCatalog.listActive.mockReset().mockResolvedValue([mockActiveWorkflow]); mockCatalog.getActive.mockReset().mockResolvedValue(mockActiveWorkflow); });
afterEach(async () => { if (tree) act(() => tree.unmount()); await promptRuntimeRegistry.disposeAll(); });

test('uses the active catalog release and blocks exports while catalog loading or failed', async () => {
  let release!: () => void;
  mockCatalog.bootstrap.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  mockRows.set('a', thread('a'));
  await act(async () => { tree = create(<AgentScreen />); });
  expect(ui().workflowDefinition).toBeUndefined();
  await expect(ui().onExportPrompt('prompt')).rejects.toThrow('工作流');
  await act(async () => release());
  expect(ui().workflowDefinition.version).toBe('active-test');
  mockCatalog.bootstrap.mockRejectedValueOnce(new Error('catalog unavailable'));
  await act(async () => ui().onReloadWorkflow());
  expect(ui().workflowDefinition).toBeUndefined();
  expect(ui().workflowLoadIssue).toBe('catalog unavailable');
  await expect(ui().onExportPrompt('prompt')).rejects.toThrow('工作流');
});

test('rejects a changed active release and disables the SDK attachment writer', async () => {
  mockRows.set('a', thread('a'));
  await act(async () => { tree = create(<AgentScreen />); });
  expect(tree.root.findByType(require('@copilotkit/react-native').CopilotChat).props.attachments).toEqual({ enabled: false });
  mockCatalog.getActive.mockResolvedValueOnce({ ...mockActiveWorkflow, contentHash: 'changed' });
  await act(async () => { await expect(ui().onExportPrompt('prompt')).rejects.toThrow('工作流已更新'); });
  expect(ui().workflowDefinition).toBeUndefined();
  expect(ui().workflowLoadIssue).toContain('工作流已更新');
});

test('surfaces a rejected background flush without an unhandled rejection', async () => {
  const listeners: Array<(state: AppStateStatus) => void> = [];
  const originalImplementation = jest.isMockFunction(AppState.addEventListener) ? jest.mocked(AppState.addEventListener).getMockImplementation() : undefined;
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => { listeners.push(callback); return { remove: jest.fn() }; });
  const flush = jest.spyOn(promptRuntimeRegistry, 'flushAll').mockRejectedValueOnce(new Error('disk unavailable'));
  try {
    mockRows.set('a', thread('a'));
    await act(async () => { tree = create(<AgentScreen />); });
    await act(async () => listeners.forEach(listener => listener('background')));
    expect(ui().notice).toBe('disk unavailable');
  } finally { flush.mockRestore(); subscription.mockRestore(); if (originalImplementation) jest.mocked(AppState.addEventListener).mockImplementation(originalImplementation); }
});

test('background completion is reflected after switching sessions and stale rename preserves it through reload', async () => {
  mockRows.set('a', thread('a', 2));
  mockRows.set('b', thread('b'));
  await act(async () => { tree = create(<AgentScreen />); });
  const staleRename = ui().onRename;
  const runtime = promptRuntimeRegistry.ensure(config, thread('a'), mockStore as never);
  await act(async () => { ui().onSelect('b'); });
  await act(async () => { (runtime.agent as unknown as ReturnType<typeof mockCreateAgent>).emit([{ id: 'reply', role: 'assistant', content: 'background complete' }]); });
  expect(ui().threads.find((item: LocalThreadSnapshot) => item.threadId === 'a').messages).toEqual([{ id: 'reply', role: 'assistant', content: 'background complete' }]);
  await runtime.flush();
  await act(async () => { await staleRename('a', 'My title'); });
  await act(async () => { ui().onSelect('a'); });
  await act(async () => { tree.unmount(); await promptRuntimeRegistry.disposeAll(); });
  expect(mockRows.get('a')).toMatchObject({ customTitle: 'My title', messages: [{ content: 'background complete' }] });
  await act(async () => { tree = create(<AgentScreen />); });
  expect(ui().threads.find((item: LocalThreadSnapshot) => item.threadId === 'a')).toMatchObject({ customTitle: 'My title', messages: [{ content: 'background complete' }] });
});

test('deleting the last session keeps a working new-session entry', async () => {
  mockRows.set('only', thread('only'));
  await act(async () => { tree = create(<AgentScreen />); });
  await act(async () => { await ui().onDelete('only'); });
  expect(tree.root.findAllByType(PromptAssistantUi)).toHaveLength(1);
  expect(ui().activeThreadId).not.toBe('only');
  const replacement = ui().activeThreadId;
  await act(async () => { await ui().onNew(); });
  expect(ui().activeThreadId).not.toBe(replacement);
  expect(mockRows.has('only')).toBe(false);
});

test('overlapping renames keep the latest title when an earlier rename finishes after a later stream save', async () => {
  mockRows.set('a', thread('a'));
  await act(async () => { tree = create(<AgentScreen />); });
  const runtime = promptRuntimeRegistry.ensure(config, thread('a'), mockStore as never);
  const agent = runtime.agent as unknown as ReturnType<typeof mockCreateAgent>;
  let release!: () => void;
  mockStore.save.mockImplementationOnce(async (snapshot) => {
    await new Promise<void>((resolve) => { release = resolve; });
    mockRows.set(snapshot.threadId, snapshot);
  });
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    agent.emit([{ id: 'reply', role: 'assistant', content: 'partial' }]);
    first = ui().onRename('a', 'First title');
    second = ui().onRename('a', 'Latest title');
    agent.emit([{ id: 'reply', role: 'assistant', content: 'complete reply' }]);
  });
  await act(async () => { release(); await Promise.all([first, second]); });
  expect(mockRows.get('a')?.customTitle).toBe('Latest title');
  expect(runtime.getSnapshot().customTitle).toBe('Latest title');
  expect(ui().threads[0]).toMatchObject({ customTitle: 'Latest title' });
  expect(runtime.getSnapshot().messages).toMatchObject([{ content: 'complete reply' }]);
});

test('initial empty-session save rejection reaches the screen error handling', async () => {
  mockStore.save.mockRejectedValueOnce(new Error('initial save unavailable'));
  await act(async () => { tree = create(<AgentScreen />); });
  expect(tree.root.findAllByType(Text).map((node) => node.props.children)).toContain('initial save unavailable');
});
