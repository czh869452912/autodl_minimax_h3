import { CREATIVE_AUTHORIZATION_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v19CreativeAuthorization: MigrationStep = {
  fromVersion: 18, toVersion: 19, name: 'v19-creative-authorization',
  apply(context) { for (const sql of CREATIVE_AUTHORIZATION_SCHEMA) context.exec(sql); },
};
