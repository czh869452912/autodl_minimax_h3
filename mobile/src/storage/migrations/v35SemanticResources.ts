import {CREATIVE_SEMANTIC_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v35SemanticResources:MigrationStep={fromVersion:34,toVersion:35,name:'v35-semantic-resources',apply(context){for(const sql of CREATIVE_SEMANTIC_SCHEMA)context.exec(sql);}};
