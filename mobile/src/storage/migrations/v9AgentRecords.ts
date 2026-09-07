import { V9_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';
export const v9AgentRecords: MigrationStep = {
  fromVersion: 8, toVersion: 9, name: 'v9-agent-records',
  apply({ exec }) { for (const statement of V9_SCHEMA_STATEMENTS) exec(statement); },
};
