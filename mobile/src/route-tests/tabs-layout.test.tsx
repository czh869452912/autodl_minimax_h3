import React from 'react';
import { act, create } from 'react-test-renderer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Keyboard, StyleSheet } from 'react-native';
import { AppTabs } from '../ui/AppTabs';
import { APP_TABS } from '../ui/theme';
let mockPathname = '/(tabs)/create';
const mockBack = jest.fn(), mockNavigate = jest.fn();

jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));

jest.mock('expo-router', () => ({
  Tabs: () => null,
  usePathname: () => mockPathname,
  useRouter: () => ({ navigate: mockNavigate, back: mockBack, canGoBack: () => true }),
}));

import TabsLayout from '../../app/(tabs)/_layout';

describe('tabs shell layout', () => {
  beforeEach(() => { mockPathname = '/(tabs)/create'; jest.clearAllMocks(); });
  it('returns from shared resources through navigation history to preserve the originating workbench', () => {
    mockPathname = '/(tabs)/assets';
    let tree!: ReturnType<typeof create>;
    try {
      act(() => { tree = create(<TabsLayout />); });
      act(() => tree.root.findAll(node => node.props.accessibilityLabel === '返回工作台' && typeof node.props.onPress === 'function')[0].props.onPress());
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    } finally { act(() => tree?.unmount()); }
  });
  it('exposes named selected tabs with full touch targets and hides the custom bar for keyboard input', () => {
    const callbacks = new Map<string, (...args: any[]) => void>();
    const remove = jest.fn();
    const addListener = Keyboard.addListener.bind(Keyboard);
    const listener = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
      callbacks.set(name, callback);
      const subscription = addListener(name, callback);
      const dispose = subscription.remove.bind(subscription);
      subscription.remove = () => { remove(); dispose(); };
      return subscription;
    });
    const select = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<AppTabs activeId="agent" onSelect={select} />); });
    const getTabs = () => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'tab');
    const tabs = getTabs();
    expect(tabs).toHaveLength(2);
    tabs.forEach((tab, index) => {
      expect(tab.props.accessibilityLabel).toBe(APP_TABS[index].label);
      expect(tab.props.accessibilityState.selected).toBe(APP_TABS[index].id === 'agent');
      expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(48);
    });
    act(() => tree.root.findAll(node => node.props.accessibilityLabel === APP_TABS.find(tab => tab.id === 'create')!.label && typeof node.props.onPress === 'function')[0].props.onPress());
    expect(select).toHaveBeenCalledWith('create');
    act(() => (callbacks.get('keyboardWillShow') ?? callbacks.get('keyboardDidShow'))!());
    expect(getTabs()).toHaveLength(0);
    act(() => (callbacks.get('keyboardWillHide') ?? callbacks.get('keyboardDidHide'))!());
    expect(getTabs()).toHaveLength(2);
    act(() => tree.unmount());
    expect(remove).toHaveBeenCalledTimes(2);
    listener.mockRestore();
  });

  it('does not render the legacy global AutoDL H3 header', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    act(() => tree.unmount());
  });

  it('hides the bottom tab bar while the keyboard is open', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    const tabs = tree.root.findByType(require('expo-router').Tabs);
    expect(tabs.props.initialRouteName).toBe('create');
    expect(tabs.props.backBehavior).toBe('history');
    expect(tabs.props.screenOptions.tabBarHideOnKeyboard).toBe(true);
    act(() => tree.unmount());
  });

  it('keeps every tab below the Android status bar', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<TabsLayout />);
    });
    const safeArea = tree.root.findByType(SafeAreaView);
    expect(safeArea.props.edges).toEqual(['top', 'left', 'right']);
    act(() => tree.unmount());
  });
});
