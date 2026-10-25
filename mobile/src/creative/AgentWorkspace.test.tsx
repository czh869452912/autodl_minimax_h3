import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { AgentWorkspace } from './AgentWorkspace';
import AgentScreen from '../agent/AgentScreen';

let mockProjectId: string | undefined;
const mockSetParams = jest.fn(), mockPush = jest.fn(), mockExecute = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ projectId: mockProjectId }),
  useRouter: () => ({ setParams: mockSetParams, push: mockPush }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../agent/AgentScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('./runtime', () => ({ creativeService: () => ({
  projects: async () => [{ id: 'project-a', title: '月光短片', brief: '三个镜头' }], execute: mockExecute,
}) }));
const button = (tree: ReturnType<typeof create>, label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
beforeEach(() => { jest.clearAllMocks(); mockProjectId = undefined; });

test('entering an existing project opens its chat without creating drafts or moving conversations', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<AgentWorkspace />); });
    expect(tree.root.findAllByType(AgentScreen)).toHaveLength(0);
    act(() => button(tree, '月光短片').props.onPress());
    expect(mockSetParams).toHaveBeenCalledWith({ projectId: 'project-a' });
    expect(mockExecute).not.toHaveBeenCalled();
    mockProjectId = 'project-a';
    act(() => tree.update(<AgentWorkspace />));
    expect(tree.root.findByType(AgentScreen).props.projectId).toBe('project-a');
    expect(button(tree, '切换创作项目')).toBeUndefined(); // Project controls live in the chat header, not another workspace row.
  } finally { act(() => tree?.unmount()); }
});

test('new project is created before entering chat, and duplicate taps do not create duplicates', async () => {
  let finish!: (value: unknown) => void;
  mockExecute.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<AgentWorkspace />); });
    act(() => button(tree, '新建项目并开始对话').props.onPress());
    act(() => tree.root.findByType(TextInput).props.onChangeText(' 新短片 '));
    const submit = button(tree, '创建并进入对话').props.onPress;
    act(() => { submit(); submit(); });
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({ name: 'project.create', payload: { title: '新短片' } }, expect.any(String));
    await act(async () => finish({ status: 'completed', value: { projectId: 'new-project' } }));
    expect(mockSetParams).toHaveBeenCalledWith({ projectId: 'new-project' });
  } finally { act(() => tree?.unmount()); }
});

test('failed project creation keeps the name and never enters a nonexistent chat', async () => {
  mockExecute.mockRejectedValueOnce(new Error('本地存储暂不可用'));
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<AgentWorkspace />); });
    act(() => button(tree, '新建项目并开始对话').props.onPress());
    act(() => tree.root.findByType(TextInput).props.onChangeText('保留名称'));
    await act(async () => button(tree, '创建并进入对话').props.onPress());
    expect(tree.root.findByType(TextInput).props.value).toBe('保留名称');
    expect(JSON.stringify(tree.toJSON())).toContain('本地存储暂不可用');
    expect(mockSetParams).not.toHaveBeenCalled();
  } finally { act(() => tree?.unmount()); }
});
