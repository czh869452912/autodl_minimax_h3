import React from 'react';
import { act, create } from 'react-test-renderer';
import { useDraftSync } from './useDraftSync';
let mockRemote: any;
jest.mock('./runtime', () => ({ creativeService: () => ({ draft: async () => mockRemote }) }));
jest.mock('expo-router', () => ({ useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
let api: ReturnType<typeof useDraftSync>;
const load = jest.fn(async (canApply?: () => boolean) => { if (canApply && !canApply()) throw new Error('Unexpected application'); });
const onError = jest.fn();
function Harness({ draft, dirty = false, busy = false }: any) { api = useDraftSync('d', draft, dirty, busy, load, onError); return null; }
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockRemote = { id: 'd', revision: 2, state: 'EDITING' }; });
afterEach(() => jest.useRealTimers());
test('refreshes a clean draft, preserves conflicting input and resumes only after explicit reload', async () => {
 let tree!: ReturnType<typeof create>;
 try {
  await act(async () => { tree = create(<Harness draft={{ id: 'd', revision: 1, state: 'EDITING' }} />); });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => tree.update(<Harness draft={{ id: 'd', revision: 1, state: 'EDITING' }} dirty />));
  await act(async () => { jest.advanceTimersByTime(2500); });
  expect(api.conflict).toBe(true); expect(load).toHaveBeenCalledTimes(1);
  await expect(api.assertCurrent()).rejects.toThrow('草稿已在其他入口更新');
  await act(async () => api.reload());
  expect(load).toHaveBeenCalledTimes(2); expect(api.conflict).toBe(false);
 } finally { act(() => tree.unmount()); }
});
test('does not reload while a write is in flight', async () => {
 let tree!: ReturnType<typeof create>;
 try { await act(async () => { tree = create(<Harness draft={{ revision: 1 }} busy />); }); expect(load).not.toHaveBeenCalled(); }
 finally { act(() => tree.unmount()); }
});
