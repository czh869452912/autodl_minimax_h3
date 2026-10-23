import { CREATIVE_CAPTURE_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v14CreativeCapture: MigrationStep = {
  fromVersion: 13, toVersion: 14, name: 'v14-creative-capture',
  apply(context) { for (const sql of CREATIVE_CAPTURE_SCHEMA) context.exec(sql); },
};
