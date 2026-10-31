import {CREATIVE_PLAN_ATTEMPT_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v36PlanAttempts:MigrationStep={fromVersion:35,toVersion:36,name:'v36-plan-attempts',apply(context){for(const sql of CREATIVE_PLAN_ATTEMPT_SCHEMA)context.exec(sql);}};
