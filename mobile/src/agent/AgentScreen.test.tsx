import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import type { LocalThreadSnapshot } from './threadStore';

const mockRows = new Map<string, LocalThreadSnapshot>();
const mockStore = {
  list: async () => [...mockRows.values()],
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
beforeEach(() => { mockRows.clear(); mockStore.save.mockClear(); });
afterEach(async () => { if (tree) act(() => tree.unmount()); await promptRuntimeRegistry.disposeAll(); });

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
  expect(ui().threads[0]).toMatchObject({ customTitle: 'Latest title', messages: [{ content: 'complete reply' }] });
});

test('initial empty-session save rejection reaches the screen error handling', async () => {
  mockStore.save.mockRejectedValueOnce(new Error('initial save unavailable'));
  await act(async () => { tree = create(<AgentScreen />); });
  expect(tree.root.findAllByType(Text).map((node) => node.props.children)).toContain('initial save unavailable');
});
