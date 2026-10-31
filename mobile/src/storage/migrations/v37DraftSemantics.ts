import {CREATIVE_DRAFT_SEMANTIC_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v37DraftSemantics:MigrationStep={fromVersion:36,toVersion:37,name:'v37-draft-semantics',apply(context){for(const sql of CREATIVE_DRAFT_SEMANTIC_SCHEMA)context.exec(sql);}};
