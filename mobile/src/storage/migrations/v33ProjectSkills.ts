import {AGENT_SKILL_PROJECT_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v33ProjectSkills:MigrationStep={fromVersion:32,toVersion:33,name:'v33-project-skills',apply(context){for(const sql of AGENT_SKILL_PROJECT_SCHEMA)context.exec(sql);}};
