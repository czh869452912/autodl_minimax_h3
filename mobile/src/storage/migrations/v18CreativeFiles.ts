import { CREATIVE_FILE_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v18CreativeFiles: MigrationStep = {
  fromVersion: 17, toVersion: 18, name: 'v18-creative-files',
  apply(context) { for (const sql of CREATIVE_FILE_SCHEMA) context.exec(sql); },
};
