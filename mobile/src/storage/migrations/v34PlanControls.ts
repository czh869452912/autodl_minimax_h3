import {CREATIVE_PLAN_CONTROL_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v34PlanControls:MigrationStep={fromVersion:33,toVersion:34,name:'v34-plan-controls',apply(context){for(const sql of CREATIVE_PLAN_CONTROL_SCHEMA)context.exec(sql);}};
