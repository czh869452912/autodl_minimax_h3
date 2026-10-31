import {CREATIVE_RUN_SPEC_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v39RunSpecs:MigrationStep={fromVersion:38,toVersion:39,name:'v39-run-specs',apply(context){for(const sql of CREATIVE_RUN_SPEC_SCHEMA)context.exec(sql);}};
