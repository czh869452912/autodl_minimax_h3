import React from 'react';
import { act, create } from 'react-test-renderer';
import { WorkflowSyncPanel } from './WorkflowSyncPanel';
const mockSync = jest.fn(async () => ({ at: 123, status: 'success', installed: 0, skipped: 1, errors: [] }));
jest.mock('../workflows/registry/remoteApp', () => ({ syncOfficialWorkflows: () => mockSync(), loadRemoteSyncState: async () => ({}) }));
jest.mock('../workflows/registry/builtin', () => ({ createAppWorkflowCatalog: () => ({ listActive: async () => [] }) }));
test('mount stays offline and explicit sync updates result', async () => {
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<WorkflowSyncPanel />); });
  expect(mockSync).not.toHaveBeenCalled();
  await act(async () => { await tree!.root.findByProps({ testID: 'workflow-sync-button' }).props.onPress(); });
  expect(mockSync).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree!.toJSON())).toContain('同步完成');
  await act(async () => tree!.unmount());
});
