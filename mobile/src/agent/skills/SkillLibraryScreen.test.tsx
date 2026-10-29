import React from 'react';
import { act, create } from 'react-test-renderer';
import { ListAction } from '../../ui/ListPageUI';
const mockStore = { list: jest.fn(async () => [] as any[]), runs: jest.fn(async () => []), install: jest.fn(async () => 'id'), enable: jest.fn(async () => {}), revoke: jest.fn(async () => {}) };
jest.mock('../../storage/databaseClient', () => ({ getDatabase: () => ({}) }));
jest.mock('./store', () => ({ createSkillStore: () => mockStore }));
jest.mock('expo-router', () => ({ useRouter: () => ({ canGoBack: () => true, back: jest.fn() }), useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
import { SkillLibraryScreen } from './SkillLibraryScreen';

test('review and install do not enable a skill until the user selects its version', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<SkillLibraryScreen />); });
  const click = async (label: string) => { await act(async () => tree.root.findAllByType(ListAction).find(node => node.props.label === label)!.props.onPress()); };
  await click('填入技能示例'); await click('检查粘贴的技能');
  expect(mockStore.install).not.toHaveBeenCalled(); expect(mockStore.enable).not.toHaveBeenCalled();
  mockStore.install.mockImplementationOnce(async (pkg?: any) => { mockStore.list.mockResolvedValue([{ ...pkg, createdAt: 1, revocation: 0, enabled: false }]); return pkg.id; });
  await click('安装此版本'); expect(mockStore.enable).not.toHaveBeenCalled();
  const action = tree.root.findAllByType(ListAction).find(node => String(node.props.label).startsWith('启用 scene-review'))!;
  await act(async () => action.props.onPress()); expect(mockStore.enable).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  await act(async () => tree.unmount());
});
