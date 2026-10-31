import {CREATIVE_AUTHORIZATION_REQUEST_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v32AuthorizationRequests:MigrationStep={fromVersion:31,toVersion:32,name:'v32-authorization-requests',apply(context){for(const sql of CREATIVE_AUTHORIZATION_REQUEST_SCHEMA)context.exec(sql);}};
