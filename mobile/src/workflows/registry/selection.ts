import * as SecureStore from 'expo-secure-store';
import type { RegistryRecord } from './types';

const key = 'workflow.selected';
export const readSelectedWorkflow = (): Promise<string | null> => SecureStore.getItemAsync(key);
export const saveSelectedWorkflow = (id: string): Promise<void> => SecureStore.setItemAsync(key, id);
export function chooseWorkflow(records: RegistryRecord[], preferred?: string | null): RegistryRecord | undefined {
  return records.find(record => record.workflowId === preferred)
    ?? records.find(record => record.workflowId === 'autodl.minimax-h3.i2v-15s') ?? records[0];
}
