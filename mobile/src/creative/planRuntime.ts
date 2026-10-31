import {preparedCreativeSubmission} from './preparedSubmission';
import type {AppDatabase} from '../storage/appDatabase';
import {getDatabase} from '../storage/databaseClient';
import {prepareCreativeVideo} from './videoRuntime';
import {runCreativePlans} from './planRunner';
export function resumeCreativePlans(db:AppDatabase){
  if(db!==getDatabase())throw new Error('DATABASE_CHANGED');
  return runCreativePlans(db,async draftId=>{
    const preview=await prepareCreativeVideo(draftId);
    if(preview.db!==db||db!==getDatabase())throw new Error('DATABASE_CHANGED');
    return preparedCreativeSubmission(preview);
  });
}
