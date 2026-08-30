import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppHeader } from '../ui/AppHeader';
import { SafeAreaView } from 'react-native-safe-area-context';

jest.mock('expo-router', () => ({
  Tabs: () => null,
  usePathname: () => '/(tabs)/create',
  useRouter: () => ({ navigate: jest.fn() }),
}));

import TabsLayout from '../../app/(tabs)/_layout';

describe('tabs shell layout', () => {
  it('does not render the legacy global AutoDL H3 header', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    expect(tree.root.findAllByType(AppHeader)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('hides the bottom tab bar while the keyboard is open', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    const tabs = tree.root.findByType(require('expo-router').Tabs);
    expect(tabs.props.screenOptions.tabBarHideOnKeyboard).toBe(true);
    act(() => tree.unmount());
  });

  it('keeps every tab below the Android status bar', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    const safeArea = tree.root.findByType(SafeAreaView);
    expect(safeArea.props.edges).toEqual(['top']);
    act(() => tree.unmount());
  });
});
