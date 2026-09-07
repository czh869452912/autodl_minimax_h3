import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppHeader } from '../ui/AppHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Keyboard, StyleSheet } from 'react-native';
import { AppTabs } from '../ui/AppTabs';
import { APP_TABS } from '../ui/theme';

jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));

jest.mock('expo-router', () => ({
  Tabs: () => null,
  usePathname: () => '/(tabs)/create',
  useRouter: () => ({ navigate: jest.fn() }),
}));

import TabsLayout from '../../app/(tabs)/_layout';

describe('tabs shell layout', () => {
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
    expect(tabs).toHaveLength(5);
    tabs.forEach((tab, index) => {
      expect(tab.props.accessibilityLabel).toBe(APP_TABS[index].label);
      expect(tab.props.accessibilityState.selected).toBe(APP_TABS[index].id === 'agent');
      expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(48);
    });
    act(() => tree.root.findAll(node => node.props.accessibilityLabel === APP_TABS[2].label && typeof node.props.onPress === 'function')[0].props.onPress());
    expect(select).toHaveBeenCalledWith('tasks');
    act(() => (callbacks.get('keyboardWillShow') ?? callbacks.get('keyboardDidShow'))!());
    expect(getTabs()).toHaveLength(0);
    act(() => (callbacks.get('keyboardWillHide') ?? callbacks.get('keyboardDidHide'))!());
    expect(getTabs()).toHaveLength(5);
    act(() => tree.unmount());
    expect(remove).toHaveBeenCalledTimes(2);
    listener.mockRestore();
  });

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
