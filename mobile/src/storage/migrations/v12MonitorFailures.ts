import { V12_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';

export const v12MonitorFailures: MigrationStep = {
  fromVersion: 11, toVersion: 12, name: 'v12-monitor-failures',
  apply(context) { for (const statement of V12_SCHEMA_STATEMENTS) context.exec(statement); },
};
