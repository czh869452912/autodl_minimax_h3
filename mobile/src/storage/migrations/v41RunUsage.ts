import {CREATIVE_RUN_USAGE_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v41RunUsage:MigrationStep={fromVersion:40,toVersion:41,name:'v41-run-usage',apply(context){for(const sql of CREATIVE_RUN_USAGE_SCHEMA)context.exec(sql);}};
