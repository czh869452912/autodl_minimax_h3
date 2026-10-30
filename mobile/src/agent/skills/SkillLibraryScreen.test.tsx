jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
import { Switch } from 'react-native';
import { IconAction } from '../../creative/WorkbenchUI';
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
  act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='添加技能')!.props.onPress());
  await click('填入技能示例'); await click('检查粘贴的技能');
  expect(mockStore.install).not.toHaveBeenCalled(); expect(mockStore.enable).not.toHaveBeenCalled();
  mockStore.install.mockImplementationOnce(async (pkg?: any) => { mockStore.list.mockResolvedValue([{ ...pkg, createdAt: 1, revocation: 0, enabled: false }]); return pkg.id; });
  await click('安装此版本'); expect(mockStore.enable).not.toHaveBeenCalled();
  const action = tree.root.findByType(Switch);
  await act(async () => action.props.onValueChange(true)); expect(mockStore.enable).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  await act(async () => tree.unmount());
});


test('switching off revokes the selected version and blocks duplicate writes while saving',async()=>{
 mockStore.revoke.mockClear();
 mockStore.list.mockResolvedValue([{id:'enabled-version',name:'Review',description:'Review scenes',enabled:true,files:{'SKILL.md':'Review'},createdAt:1,revocation:0}]);
 let finish!:()=>void;mockStore.revoke.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 let tree!:ReturnType<typeof create>;
 await act(async()=>{tree=create(<SkillLibraryScreen/>);});
 const toggle=tree.root.findByType(Switch);
 act(()=>{toggle.props.onValueChange(false);toggle.props.onValueChange(false);});
 expect(mockStore.revoke).toHaveBeenCalledTimes(1);
 expect(mockStore.revoke).toHaveBeenCalledWith('enabled-version');
 expect(tree.root.findByType(Switch).props.disabled).toBe(true);
 await act(async()=>finish());
 expect(tree.root.findByType(Switch).props.disabled).toBe(false);
 act(()=>tree.unmount());
});
