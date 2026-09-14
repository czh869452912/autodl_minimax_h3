import { V10_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';
export const v10MediaDeletion: MigrationStep = { fromVersion: 9, toVersion: 10, name: 'v10-media-deletion', apply({ exec }) { for (const statement of V10_SCHEMA_STATEMENTS) exec(statement); } };
