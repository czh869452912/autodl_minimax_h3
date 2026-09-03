import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, BackHandler, Text } from 'react-native';

const mockDatabase = {
  execSync: jest.fn(),
  getFirstSync: jest.fn(() => ({ user_version: 3 })),
  getAllSync: jest.fn(() => [{ name: 'tasks' }]),
  withTransactionSync(callback: () => void) { callback(); },
};

type StartupState = { mode: 'writable' | 'legacy' } | { mode: 'readonly'; diagnostic: string; allowReset: boolean };
const mockStartupState = jest.fn<StartupState, []>(() => ({ mode: 'legacy' }));
const mockRecoveryScreen = jest.fn((_props: { diagnostic: string }) => null);
jest.mock('../storage/databaseClient', () => ({ getDatabase: jest.fn(() => mockDatabase), getDatabaseStartupState: () => mockStartupState() }));
jest.mock('expo-router', () => ({ Stack: (props: { children?: React.ReactNode }) => <>{props.children}</> }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: (props: { children?: React.ReactNode }) => <>{props.children}</> }));
jest.mock('../tasks/background', () => ({ registerBackgroundSync: jest.fn(async () => undefined) }));
jest.mock('../storage/database', () => ({ ensureAppDatabase: jest.fn(), isLegacyAppDatabase: jest.fn(() => true), resetAppDatabase: jest.fn() }));
jest.mock('../storage/DatabaseRecoveryScreen', () => ({ DatabaseRecoveryScreen: (props: { diagnostic: string }) => mockRecoveryScreen(props) }));

import RootLayout from '../../app/_layout';

test('blocks old databases until the user explicitly clears or exits', async () => {
  mockStartupState.mockReturnValue({ mode: 'legacy' });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const exit = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<RootLayout />); });

  expect(alert).toHaveBeenCalledWith(
    '检测到旧版本数据',
    expect.stringContaining('系统相册中的视频不会被删除'),
    expect.any(Array),
    { cancelable: false },
  );
  expect(tree.root.findAllByType(require('expo-router').Stack)).toHaveLength(0);

  const actions = alert.mock.calls[0][2]!;
  actions[0].onPress?.();
  expect(exit).toHaveBeenCalled();

  await act(async () => { actions[1].onPress?.(); });
  expect(require('../storage/database').resetAppDatabase).toHaveBeenCalled();
  act(() => tree.unmount());
});

test('renders readonly recovery without registering background work', async () => {
  mockStartupState.mockReturnValue({ mode: 'readonly', diagnostic: 'MIGRATION_5_TO_6_FAILED', allowReset: true });
  const register = require('../tasks/background').registerBackgroundSync;
  register.mockClear();
  mockRecoveryScreen.mockClear();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<RootLayout />); });
  expect(mockStartupState).toHaveBeenCalled();
  expect(mockStartupState.mock.results.at(-1)?.value).toEqual({ mode: 'readonly', diagnostic: 'MIGRATION_5_TO_6_FAILED', allowReset: true });
  expect(mockRecoveryScreen).toHaveBeenCalledWith(expect.objectContaining({ diagnostic: 'MIGRATION_5_TO_6_FAILED' }));
  expect(register).not.toHaveBeenCalled();
  act(() => tree.unmount());
});
