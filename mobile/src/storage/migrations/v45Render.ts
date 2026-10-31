import {CREATIVE_RENDER_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v45Render:MigrationStep={fromVersion:44,toVersion:45,name:'v45-render',apply(context){for(const sql of CREATIVE_RENDER_SCHEMA)context.exec(sql);}};
