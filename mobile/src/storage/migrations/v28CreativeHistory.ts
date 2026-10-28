import {CREATIVE_HISTORY_INDEXES} from '../schema';
import type {MigrationStep} from './types';
export const v28CreativeHistory:MigrationStep={fromVersion:27,toVersion:28,name:'v28-creative-history',apply(context){for(const sql of CREATIVE_HISTORY_INDEXES)context.exec(sql);}};
