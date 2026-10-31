import {AGENT_SKILL_NEXT_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v42NextSkills:MigrationStep={fromVersion:41,toVersion:42,name:'v42-next-skills',apply(context){for(const sql of AGENT_SKILL_NEXT_SCHEMA)context.exec(sql);}};
