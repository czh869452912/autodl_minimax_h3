import { V13_SCHEMA_STATEMENTS } from '../schema';
import type { MigrationStep } from './types';
export const v13TaskArchives: MigrationStep = {
  fromVersion: 12, toVersion: 13, name: 'v13-task-archives',
  apply(context) { for (const statement of V13_SCHEMA_STATEMENTS) context.exec(statement); },
};
