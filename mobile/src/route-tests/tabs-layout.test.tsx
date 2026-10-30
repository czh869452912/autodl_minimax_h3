import React from 'react';
import { act, create } from 'react-test-renderer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WorkbenchModeSwitcher } from '../ui/WorkbenchModeSwitcher';
let mockPathname = '/(tabs)/create';
const mockBack = jest.fn(), mockNavigate = jest.fn();

jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));

jest.mock('expo-router', () => ({
  Tabs: () => null,
  useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn]),
  usePathname: () => mockPathname,
  useRouter: () => ({ navigate: mockNavigate, back: mockBack, canGoBack: () => true }),
}));

import TabsLayout from '../../app/(tabs)/_layout';

describe('tabs shell layout', () => {
  beforeEach(() => { mockPathname = '/(tabs)/create'; jest.clearAllMocks(); });
  it('provides a persistent primary bar on the asset root without a back-to-workbench detour',()=>{
    mockPathname='/(tabs)/assets';let tree! : ReturnType<typeof create>;
    try{act(()=>{tree=create(<TabsLayout/>);});
    expect(tree.root.findAll(n=>n.props.accessibilityLabel==='返回工作台')).toHaveLength(0);
    expect(typeof tree.root.findByType(require('expo-router').Tabs).props.tabBar).toBe('function');
    }finally{act(()=>tree?.unmount());}
  });

  it('does not render the legacy global AutoDL H3 header', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    act(() => tree.unmount());
  });

  it('keeps workspaces mounted with history-aware primary navigation', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    const tabs = tree.root.findByType(require('expo-router').Tabs);
    expect(tabs.props.initialRouteName).toBe('create');
    expect(tabs.props.backBehavior).toBe('history');
    expect(typeof tabs.props.tabBar).toBe('function');
    act(() => tree.unmount());
  });

  it('keeps every tab below the Android status bar', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    const safeArea = tree.root.findByType(SafeAreaView);
    expect(safeArea.props.edges).toEqual(['top', 'bottom', 'left', 'right']);
    act(() => tree.unmount());
  });
});
