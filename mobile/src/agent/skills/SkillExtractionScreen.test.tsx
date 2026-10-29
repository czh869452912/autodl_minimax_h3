import React from 'react';
import { act, create } from 'react-test-renderer';
import { ListAction } from '../../ui/ListPageUI';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
let mockDb: ReturnType<typeof createInitializedRealSqliteTestDb>;
const mockExtract = jest.fn();
jest.mock('../../storage/databaseClient', () => ({ getDatabase: () => mockDb }));
jest.mock('../threadStore', () => ({ createLocalThreadStore: () => ({ listSummaries: async () => [{ threadId: 't', customTitle: 'Test evidence' }] }) }));
jest.mock('../../settings/storage', () => ({ readSettings: async () => ({ llmApiKey: 'key', llmEndpoint: 'https://test/v1', llmModel: 'test', llmTimeoutSeconds: '10', llmMaxRetries: '0' }) }));
jest.mock('./extraction', () => ({ ...jest.requireActual('./extraction'), extractSkillDraft: (...args: unknown[]) => mockExtract(...args) }));
jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]), useRouter: () => ({ canGoBack: () => true, back: jest.fn(), push: jest.fn() }) }));
import { SkillExtractionScreen } from './SkillExtractionScreen';

test('selects evidence, reviews exact sending text, edits and publishes without enabling', async () => {
  mockDb = createInitializedRealSqliteTestDb();
  mockDb.runSync("INSERT INTO agent_thread_index(thread_id,created_at,updated_at) VALUES('t',1,1)");
  for (const [id, role, content] of [['u', 'user', 'Check camera movement. https://private.test'], ['a', 'assistant', 'Start with subject and action.'], ['x', 'tool', 'Never select tool credentials.']]) mockDb.runSync('INSERT INTO agent_messages(thread_id,id,sequence,payload_json) VALUES(?,?,?,?)', 't', id, id === 'u' ? 0 : id === 'a' ? 1 : 2, JSON.stringify({ id, role, content }));
  mockExtract.mockResolvedValue('---\nname: camera-review\ndescription: Review camera movement\n---\nCheck movement.');
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<SkillExtractionScreen />); });
    const click = async (label: string) => { await act(async () => { tree.root.findAllByType(ListAction).find(node => node.props.label === label)!.props.onPress(); }); };
    const type = (label: string, value: string) => act(() => tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value));
    await click('选择对话：Test evidence');
    expect(tree.root.findAllByType(ListAction).some(node => node.props.label === '选择证据 x')).toBe(false);
    await click('选择证据 u'); await click('整理已选证据（1 段）');
    type('提炼目标', 'Reusable camera review');
    const evidence = tree.root.findByProps({ accessibilityLabel: '待发送的证据' }).props.value;
    expect(evidence).not.toContain('private.test');
    await click('确认发送证据并生成草稿');
    expect(mockExtract.mock.calls[0][0]).toEqual({ evidence, goal: 'Reusable camera review' });
    expect(mockDb.getAllSync('SELECT * FROM agent_skill_versions')).toEqual([]);
    type('技能草稿正文', '---\nname: camera-review\ndescription: Review movement\n---\nUser reviewed revision.');
    await click('检查待发布版本');
    expect(mockDb.getAllSync('SELECT * FROM agent_skill_versions')).toEqual([]);
    await click('确认审阅并发布此版本');
    expect(mockDb.getAllSync('SELECT * FROM agent_skill_versions')).toHaveLength(1);
    expect(mockDb.getAllSync('SELECT * FROM agent_skill_bindings')).toEqual([]);
    expect(mockDb.getFirstSync<{ content: string }>('SELECT content FROM agent_skill_drafts')!.content).toContain('User reviewed revision');
  } finally { await act(async () => tree?.unmount()); mockDb.close(); }
});
