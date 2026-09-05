import { V8_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';

export const v8TaskRefresh: MigrationStep = {
  fromVersion: 7,
  toVersion: 8,
  name: 'v8-task-refresh-projections',
  apply({ exec }) {
    for (const statement of V8_SCHEMA_STATEMENTS) exec(statement);
  },
};
