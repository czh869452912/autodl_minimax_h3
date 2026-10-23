import {CREATIVE_REVIEW_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v27CreativeReview:MigrationStep={fromVersion:26,toVersion:27,name:'v27-creative-review',apply(context){for(const sql of CREATIVE_REVIEW_SCHEMA)context.exec(sql);}};
