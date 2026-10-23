import { RESTORE_SAFETY_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v15RestoreSafety: MigrationStep = {
  fromVersion: 14, toVersion: 15, name: 'v15-restore-safety',
  apply(context) { for (const sql of RESTORE_SAFETY_SCHEMA) context.exec(sql); },
};
