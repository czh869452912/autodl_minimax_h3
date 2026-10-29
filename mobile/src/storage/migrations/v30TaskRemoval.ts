import { TASK_REMOVAL_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v30TaskRemoval: MigrationStep = {
  fromVersion: 29, toVersion: 30, name: 'v30-task-removal',
  apply(context) { for (const sql of TASK_REMOVAL_SCHEMA) context.exec(sql); },
};
