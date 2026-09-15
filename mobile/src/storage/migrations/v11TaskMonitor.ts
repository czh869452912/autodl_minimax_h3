import { V11_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';

export const v11TaskMonitor: MigrationStep = {
  fromVersion: 10, toVersion: 11, name: 'v11-task-monitor',
  apply(context) { for (const statement of V11_SCHEMA_STATEMENTS) context.exec(statement); },
};
