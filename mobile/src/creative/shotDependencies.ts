import CryptoJS from 'crypto-js';
import type {AppDatabase} from '../storage/appDatabase';
/** Production inputs only. Editing revision still protects user commands, never ordering/title presentation. */
export async function shotDependencySignature(db:AppDatabase,shotId:string,projectId:string){
 const shot=await db.getFirstAsync<{description:string}>('SELECT description FROM creative_shots WHERE id=? AND project_id=? AND deleted_at IS NULL',shotId,projectId);
 if(!shot)throw new Error('SHOT_NOT_AVAILABLE');
 const media=await db.getAllAsync('SELECT slot,ordinal,version_id FROM creative_shot_assets WHERE shot_id=? AND slot!=\'selected_video\' ORDER BY slot,ordinal',shotId);
 const semantics=await db.getAllAsync('SELECT entity_id,version_id FROM creative_shot_semantics WHERE shot_id=? ORDER BY entity_id',shotId);
 return CryptoJS.SHA256(JSON.stringify({schemaVersion:1,description:shot.description,media,semantics})).toString();
}
