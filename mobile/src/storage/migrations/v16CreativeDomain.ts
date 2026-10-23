import { CREATIVE_DOMAIN_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v16CreativeDomain: MigrationStep = {
  fromVersion: 15, toVersion: 16, name: 'v16-creative-domain',
  apply(context) { for (const sql of CREATIVE_DOMAIN_SCHEMA) context.exec(sql); },
};
