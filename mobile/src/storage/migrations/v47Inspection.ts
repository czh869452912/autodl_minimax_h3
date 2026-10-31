import {CREATIVE_INSPECTION_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v47Inspection:MigrationStep={fromVersion:46,toVersion:47,name:'v47-inspection',apply(context){for(const sql of CREATIVE_INSPECTION_SCHEMA)context.exec(sql);}};
