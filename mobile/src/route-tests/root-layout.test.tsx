import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, BackHandler } from 'react-native';

const mockDatabase = {
  execSync: jest.fn(),
  getFirstSync: jest.fn(() => ({ user_version: 3 })),
  getAllSync: jest.fn(() => [{ name: 'tasks' }]),
  withTransactionSync(callback: () => void) { callback(); },
};

jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => mockDatabase) }));
jest.mock('expo-router', () => ({ Stack: (props: { children?: React.ReactNode }) => <>{props.children}</> }));
jest.mock('../tasks/background', () => ({ registerBackgroundSync: jest.fn(async () => undefined) }));
jest.mock('../storage/database', () => ({ isLegacyAppDatabase: jest.fn(() => true), resetAppDatabase: jest.fn() }));

import RootLayout from '../../app/_layout';

test('blocks old databases until the user explicitly clears or exits', async () => {
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
