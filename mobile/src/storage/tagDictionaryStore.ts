import {Asset} from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import {openDatabaseAsync,type SQLiteDatabase} from 'expo-sqlite';
let database:Promise<SQLiteDatabase>|undefined;
function dictionary(){
 if(!database)database=(async()=>{
  const asset=await Asset.fromModule(require('../../assets/tags/danbooru-v1.db')).downloadAsync();
  if(!asset.localUri)throw new Error('TAG_DICTIONARY_UNAVAILABLE');
  const directory=FileSystem.documentDirectory+'tag-dictionaries/';await FileSystem.makeDirectoryAsync(directory,{intermediates:true});
  const path=directory+'danbooru-v1.db';if(!(await FileSystem.getInfoAsync(path)).exists)await FileSystem.copyAsync({from:asset.localUri,to:path});
  const db=await openDatabaseAsync('danbooru-v1.db',{useNewConnection:true},directory);await db.execAsync('PRAGMA query_only=ON');return db;
 })().catch(error=>{database=undefined;throw error;});
 return database;
}

export async function queryTagDictionary(key:string){
 const db=await dictionary();return await db.getAllAsync<{name:string;category:number;count:number;translation:string}>(`SELECT DISTINCT t.name,t.category,t.count,t.translation FROM terms s JOIN tags t ON t.name=s.tag WHERE s.term>=? AND s.term<? ORDER BY (s.term=?) DESC,t.count DESC LIMIT 24`,key,key+'\uffff',key);
}
