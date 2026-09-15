import React from 'react';
import { act, create } from 'react-test-renderer';
import { DeviceEventEmitter, NativeModules, Platform, Text } from 'react-native';
import { useTaskMonitorStatus } from './useTaskMonitorStatus';
jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => unknown) => { require('react').useEffect(effect, [effect]); } }));
function Status() { const { status } = useTaskMonitorStatus(); return <Text>{status.running ? 'running' : status.stopReason ?? 'stopped'}</Text>; }

test('auto-stop updates a mounted page and stale initial reads cannot overwrite native events', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  let resolve!: (value: unknown) => void;
  (NativeModules as any).AutoDLTaskMonitor = { getStatus: jest.fn(() => new Promise(r => { resolve = r; })) };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Status />); });
  act(() => { DeviceEventEmitter.emit('AutoDLTaskMonitorStatus', { running: true, taskIds: [] }); });
  expect(tree.root.findByType(Text).props.children).toBe('running');
  act(() => { DeviceEventEmitter.emit('AutoDLTaskMonitorStatus', { running: false, taskIds: [], stopReason: 'timeout' }); });
  await act(async () => { resolve({ running: true }); });
  expect(tree.root.findByType(Text).props.children).toBe('timeout');
  act(() => tree.unmount());
});
