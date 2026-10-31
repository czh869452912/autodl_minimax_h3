import {CREATIVE_TIMELINE_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v44Timeline:MigrationStep={fromVersion:43,toVersion:44,name:'v44-timeline',apply(context){for(const sql of CREATIVE_TIMELINE_SCHEMA)context.exec(sql);}};
