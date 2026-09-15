import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, BackHandler, Pressable } from 'react-native';
import { DataManagementPanel } from './DataManagementPanel';
import { scheduleMaintenance } from '../storage/pendingMaintenance';
import { stopTaskMonitor } from '../native/taskMonitor';
jest.mock('../storage/pendingMaintenance', () => ({ scheduleMaintenance: jest.fn(async () => undefined) }));
jest.mock('../native/taskMonitor', () => ({ stopTaskMonitor: jest.fn(async () => undefined) }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: jest.fn() }));
jest.mock('../storage/backup', () => ({ createUserDatabaseBackup: jest.fn(), listFullDatabaseBackups: jest.fn(() => []) }));

test('scheduling failure unlocks actions; stop failure retains the scheduled operation and provides exit retry', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const exit = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
  jest.mocked(scheduleMaintenance).mockRejectedValueOnce(new Error('storage locked'));
  let tree!: ReturnType<typeof create>;
  try {
    act(() => { tree = create(<DataManagementPanel />); });
    const request = () => tree.root.findByProps({ accessibilityLabel: '清除应用数据' }).props.onPress();
    act(request);
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    expect(!tree.root.findByProps({ accessibilityLabel: '清除应用数据' }).props.disabled).toBe(true);
    expect(stopTaskMonitor).not.toHaveBeenCalled();
    jest.mocked(stopTaskMonitor).mockRejectedValueOnce(new Error('native unavailable'));
    act(request);
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    expect(exit).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ accessibilityLabel: '立即备份数据库' }).props.disabled).toBe(true);
    await act(async () => tree.root.findByProps({ accessibilityLabel: '重试退出完成数据维护' }).props.onPress());
    expect(exit).toHaveBeenCalledTimes(1);
    expect(scheduleMaintenance).toHaveBeenCalledTimes(2);
  } finally { act(() => tree?.unmount()); alert.mockRestore(); exit.mockRestore(); }
});
