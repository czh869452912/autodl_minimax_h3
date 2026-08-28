import type { ScreenName } from './types';

test('declares every product tab', () => {
  const tabs: ScreenName[] = ['create', 'agent', 'tasks', 'gallery', 'settings'];
  expect(tabs).toHaveLength(5);
});
