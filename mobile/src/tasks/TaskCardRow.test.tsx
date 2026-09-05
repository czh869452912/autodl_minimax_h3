import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { TaskCardRow } from './TaskCardRow';
import type { TaskCard } from './taskCard';
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

test('active card timing advances independently and terminal cards own no timer', () => {
  jest.useFakeTimers({ now: 2000 });
  const item: TaskCard = { id: 'a', prompt: 'p', status: 'RUNNING', resolution: '720p', duration: 5, createdAt: 1000, startedAt: 1500, updatedAt: 1500, downloadState: 'IDLE', exportState: 'NOT_REQUESTED' };
  const props = { item, busy: false, onDownload: () => {}, onExport: () => {}, onRemove: () => {}, onOpen: () => {} };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow {...props} />); });
  act(() => { jest.advanceTimersByTime(60000); });
  expect(tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''))).toContain('执行 1分00秒');
  act(() => tree.update(<TaskCardRow {...props} item={{ ...item, status: 'SUCCESS' }} />));
  expect(jest.getTimerCount()).toBe(0);
  act(() => tree.unmount());
  jest.useRealTimers();
});
