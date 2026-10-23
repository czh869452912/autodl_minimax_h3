import { CREATIVE_SHOT_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v20CreativeShots: MigrationStep = {
  fromVersion: 19, toVersion: 20, name: 'v20-creative-shots',
  apply(context) { for (const sql of CREATIVE_SHOT_SCHEMA) context.exec(sql); },
};
