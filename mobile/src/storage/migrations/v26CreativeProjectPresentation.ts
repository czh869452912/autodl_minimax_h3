import {CREATIVE_PROJECT_PRESENTATION_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v26CreativeProjectPresentation:MigrationStep={fromVersion:25,toVersion:26,name:'v26-project-presentation',apply(context){for(const sql of CREATIVE_PROJECT_PRESENTATION_SCHEMA)context.exec(sql);}};
