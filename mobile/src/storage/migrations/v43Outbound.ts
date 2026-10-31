import {CREATIVE_OUTBOUND_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v43Outbound:MigrationStep={fromVersion:42,toVersion:43,name:'v43-outbound',apply(context){for(const sql of CREATIVE_OUTBOUND_SCHEMA)context.exec(sql);}};
