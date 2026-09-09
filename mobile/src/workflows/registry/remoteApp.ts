import * as SecureStore from 'expo-secure-store';
import config from './remoteConfig.json';
import { createRemoteWorkflowSync, type RemoteSyncState } from './remoteSync';
import { createWorkflowRegistry } from './repository';
import { getDatabase } from '../../storage/databaseClient';
import { workflowCatalogEvents } from './catalogEvents';
const key = 'workflow.registry.official.v1';
export async function loadRemoteSyncState(): Promise<RemoteSyncState> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return {};
  const value = JSON.parse(raw) as RemoteSyncState;
  if (value.sequence !== undefined && (!Number.isSafeInteger(value.sequence) || value.sequence < 1 || !/^[a-f0-9]{64}$/.test(value.indexHash ?? ''))) throw new Error('Invalid saved registry state');
  return value;
}
let coordinatorDatabase: ReturnType<typeof getDatabase> | undefined;
let coordinator: ReturnType<typeof createRemoteWorkflowSync> | undefined;
export async function syncOfficialWorkflows() {
  const database = getDatabase();
  if (!coordinator || coordinatorDatabase !== database) {
    coordinatorDatabase = database;
    coordinator = createRemoteWorkflowSync({ repository: createWorkflowRegistry(database), publicKey: config.publicKey, state: { load: loadRemoteSyncState, save: value => SecureStore.setItemAsync(key, JSON.stringify(value)) } });
  }
  const result = await coordinator.sync();
  if (result.installed) workflowCatalogEvents.invalidate();
  return result;
}
