import { CREATIVE_PLAN_SCHEMA } from '../schema';
import type { MigrationStep } from './types';
export const v25CreativePlans: MigrationStep = { fromVersion:24,toVersion:25,name:'v25-creative-plans',apply(context){for(const sql of CREATIVE_PLAN_SCHEMA)context.exec(sql);} };
