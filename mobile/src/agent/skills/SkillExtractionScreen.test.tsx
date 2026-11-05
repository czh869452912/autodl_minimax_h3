import React from 'react';
import { act, create } from 'react-test-renderer';
import { ListAction } from '../../ui/ListPageUI';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
let mockDb: ReturnType<typeof createInitializedRealSqliteTestDb>;
const mockExtract = jest.fn(),mockPush=jest.fn();let mockModel='test';
jest.mock('../../storage/databaseClient', () => ({ getDatabase: () => mockDb }));
jest.mock('../threadStore', () => ({ createLocalThreadStore: () => ({ listSummaries: async () => [{ threadId: 't', customTitle: 'Test evidence' }] }) }));
jest.mock('../../settings/storage', () => ({ readSettings: async () => ({ llmApiKey: 'key', llmEndpoint: 'https://test/v1', llmModel: mockModel, llmTimeoutSeconds: '10', llmMaxRetries: '0' }) }));
jest.mock('./extraction', () => ({ ...jest.requireActual('./extraction'), extractSkillDraft: (...args: unknown[]) => mockExtract(...args) }));
jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]), useRouter: () => ({ canGoBack: () => true, back: jest.fn(), push: mockPush }) }));
import { SkillExtractionScreen } from './SkillExtractionScreen';

test('selects evidence, reviews exact sending text, edits and publishes without enabling', async () => {
  mockModel='test';mockExtract.mockReset();mockPush.mockReset();mockDb = createInitializedRealSqliteTestDb();
  mockDb.runSync("INSERT INTO agent_thread_index(thread_id,created_at,updated_at) VALUES('t',1,1)");
  for (const [id, role, content] of [['u', 'user', 'Check camera movement. https://private.test'], ['a', 'assistant', 'Start with subject and action.'], ['x', 'tool', 'Never select tool credentials.']]) mockDb.runSync('INSERT INTO agent_messages(thread_id,id,sequence,payload_json) VALUES(?,?,?,?)', 't', id, id === 'u' ? 0 : id === 'a' ? 1 : 2, JSON.stringify({ id, role, content }));
  mockExtract.mockResolvedValue('---\nname: camera-review\ndescription: Review camera movement\n---\nCheck movement.');
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<SkillExtractionScreen />); });
    const click = async (label: string) => { await act(async () => { const button=tree.root.findAllByType(ListAction).find(node => node.props.label === label)??tree.root.findAll(node=>node.props.accessibilityLabel===label&&typeof node.props.onPress==='function')[0];button!.props.onPress(); }); };
    const type = (label: string, value: string) => act(() => tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value));
    await click('新建提炼草稿');
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
    await click('返回');type('技能草稿正文','---\nname: camera-review\ndescription: Review movement\n---\nUser reviewed revision.');
    expect(tree.root.findAllByType(ListAction).some(node=>node.props.label==='确认审阅并发布此版本')).toBe(false);
    await click('检查待发布版本');await click('确认审阅并发布此版本');
    expect(mockDb.getAllSync('SELECT * FROM agent_skill_versions')).toHaveLength(1);
    expect(mockDb.getAllSync('SELECT * FROM agent_skill_bindings')).toEqual([]);
    await click('查看发布版本并独立选用');expect(mockPush).toHaveBeenCalledWith({pathname:'/agent-skills',params:{projectId:undefined,threadId:undefined,versionId:expect.any(String)}});
    expect(mockDb.getFirstSync<{ content: string }>('SELECT content FROM agent_skill_drafts')!.content).toContain('User reviewed revision');
  } finally { await act(async () => tree?.unmount()); mockDb.close(); }
});

test('changing the recipient blocks sending until the new model is explicitly reviewed, and saved evidence reopens',async()=>{
 mockDb=createInitializedRealSqliteTestDb();mockModel='test';mockExtract.mockReset();mockExtract.mockResolvedValue('---\nname: method-review\ndescription: Review method\n---\nReview details.');let tree!:ReturnType<typeof create>;
 const click=async(label:string)=>{await act(async()=>{tree.root.findAllByType(ListAction).find(n=>n.props.label===label)!.props.onPress();});};
 const type=(label:string,value:string)=>act(()=>tree.root.findByProps({accessibilityLabel:label}).props.onChangeText(value));
 try{await act(async()=>{tree=create(<SkillExtractionScreen/>);});await click('新建提炼草稿');await click('手动整理已有证据');type('提炼目标','Reusable review');type('待发送的证据','Check movement before editing.');
 expect(mockExtract).not.toHaveBeenCalled();mockModel='changed';await click('确认发送证据并生成草稿');expect(mockExtract).not.toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('模型连接已变化');
 await click('保存的草稿与新建');act(()=>tree.unmount());await act(async()=>{tree=create(<SkillExtractionScreen/>);});await click('继续审阅：Reusable review');expect(tree.root.findByProps({accessibilityLabel:'待发送的证据'}).props.value).toBe('Check movement before editing.');
 await click('确认发送证据并生成草稿');expect(mockExtract.mock.calls[0][1].model).toBe('changed');expect(mockDb.getAllSync('SELECT * FROM agent_skill_versions')).toEqual([]);
 }finally{act(()=>tree?.unmount());mockDb.close();}
});
