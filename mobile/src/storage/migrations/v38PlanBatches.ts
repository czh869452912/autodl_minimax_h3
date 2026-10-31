import {CREATIVE_PLAN_BATCH_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v38PlanBatches:MigrationStep={fromVersion:37,toVersion:38,name:'v38-plan-batches',apply(context){for(const sql of CREATIVE_PLAN_BATCH_SCHEMA)context.exec(sql);}};
