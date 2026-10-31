import {CREATIVE_PLAN_SCHEMA,CREATIVE_PLAN_ATTEMPT_SCHEMA} from '../schema';
import type {MigrationStep} from './types';
export const v48PlanChecks:MigrationStep={fromVersion:47,toVersion:48,name:'v48-plan-checks',apply(context){
 const tables=['creative_plan_steps','creative_plan_dependencies','creative_decision_requests','creative_decision_candidates','creative_selection_outbox','creative_plan_attempts'];
 for(const table of tables)context.exec('CREATE TEMP TABLE backup_'+table+' AS SELECT * FROM '+table);
 for(const table of [...tables].reverse())context.exec('DROP TABLE '+table);
 for(const sql of [...CREATIVE_PLAN_SCHEMA,...CREATIVE_PLAN_ATTEMPT_SCHEMA])context.exec(sql);
 for(const table of tables){context.exec('INSERT INTO '+table+' SELECT * FROM backup_'+table);context.exec('DROP TABLE backup_'+table);}
 if(context.db.getAllSync('PRAGMA foreign_key_check').length)throw Error('PLAN_CHECK_MIGRATION_FOREIGN_KEY');
}};
