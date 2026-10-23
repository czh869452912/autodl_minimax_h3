import { CREATIVE_DRAFT_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v21CreativeDrafts: MigrationStep = {
  fromVersion: 20, toVersion: 21, name: 'v21-creative-drafts',
  apply(context) { for (const sql of CREATIVE_DRAFT_SCHEMA) context.exec(sql); },
};
