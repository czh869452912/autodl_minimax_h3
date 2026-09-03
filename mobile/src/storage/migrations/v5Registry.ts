import { V5_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';

export const v5Registry: MigrationStep = {
  fromVersion: 4,
  toVersion: 5,
  name: 'v5-registry',
  apply({ exec }) {
    for (const statement of V5_SCHEMA_STATEMENTS) exec(statement);
  },
};
