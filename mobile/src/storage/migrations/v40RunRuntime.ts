import {CREATIVE_RUN_RUNTIME_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v40RunRuntime:MigrationStep={fromVersion:39,toVersion:40,name:'v40-run-runtime',apply(context){for(const sql of CREATIVE_RUN_RUNTIME_SCHEMA)context.exec(sql);}};
