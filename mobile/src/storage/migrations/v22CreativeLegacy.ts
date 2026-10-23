import { CREATIVE_LEGACY_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v22CreativeLegacy: MigrationStep = { fromVersion: 21, toVersion: 22, name: 'v22-creative-legacy', apply(context) { for (const sql of CREATIVE_LEGACY_SCHEMA) context.exec(sql); } };
