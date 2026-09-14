import React from 'react';
import { act, create } from 'react-test-renderer';
import { SectionList } from 'react-native';
import { HistoryList } from './HistoryList';
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

test('a failed next page retries pagination without restarting the search or clearing rows', async () => {
  jest.useFakeTimers();
  const search = jest.fn(async () => undefined);
  const more = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const row = { threadId: 'a', messages: [], state: {}, createdAt: 1, updatedAt: 1 };
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<HistoryList threads={[row]} activeThreadId="a" onNew={jest.fn()} onSelect={jest.fn()} onDelete={jest.fn()} onRename={jest.fn()} onRenameVisibilityChange={jest.fn()} onSearchHistory={search} onLoadMoreHistory={more} />); });
    await act(async () => { jest.advanceTimersByTime(250); });
    const list = () => tree.root.findByType(SectionList);
    await act(async () => list().props.onEndReached());
    expect(more).toHaveBeenCalledTimes(1);
    expect(list().props.sections[0].data).toEqual([row]);
    await act(async () => list().props.onEndReached());
    expect(more).toHaveBeenCalledTimes(1);
    await act(async () => tree.root.findByProps({ accessibilityLabel: '重试读取更多对话' }).props.onPress());
    expect(more).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ accessibilityLabel: '重试读取更多对话' })).toHaveLength(0);
  } finally { act(() => tree?.unmount()); jest.useRealTimers(); }
});
