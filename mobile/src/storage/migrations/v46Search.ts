import {CREATIVE_SEARCH_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v46Search:MigrationStep={fromVersion:45,toVersion:46,name:'v46-search',apply(context){for(const sql of CREATIVE_SEARCH_SCHEMA)context.exec(sql);}};
