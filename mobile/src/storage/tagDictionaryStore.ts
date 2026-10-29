import {searchTagDictionary} from './tagDictionaryQuery';
import {Asset} from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import {openDatabaseAsync,type SQLiteDatabase} from 'expo-sqlite';
let database:Promise<SQLiteDatabase>|undefined;
function dictionary(){
 if(!database)database=(async()=>{
  const asset=await Asset.fromModule(require('../../assets/tags/danbooru-v2.db')).downloadAsync();
  if(!asset.localUri)throw new Error('TAG_DICTIONARY_UNAVAILABLE');
  const directory=FileSystem.documentDirectory+'tag-dictionaries/';await FileSystem.makeDirectoryAsync(directory,{intermediates:true});
  const path=directory+'danbooru-v2.db';if(!(await FileSystem.getInfoAsync(path)).exists)await FileSystem.copyAsync({from:asset.localUri,to:path});
  const db=await openDatabaseAsync('danbooru-v2.db',{useNewConnection:true},directory);await db.execAsync('PRAGMA query_only=ON');return db;
 })().catch(error=>{database=undefined;throw error;});
 return database;
}

export async function queryTagDictionary(key:string){
 return searchTagDictionary(await dictionary(),key);
}
