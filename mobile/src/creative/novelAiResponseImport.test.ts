import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {novelAiResponseStore} from './novelAiRuntime';
import * as FileSystem from 'expo-file-system/legacy';

let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
const mockImport=jest.fn(), hash='c'.repeat(64);
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('./runtime',()=>({creativeFiles:jest.fn()}));
jest.mock('./accountRuntime',()=>({}));
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file:///documents/',getInfoAsync:jest.fn(),readAsStringAsync:jest.fn()}));
jest.mock('../media/attachments',()=>({createAttachmentStore:(db:unknown)=>jest.requireActual('../media/attachments').createAttachmentStore(db,{importImage:mockImport})}));
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=';

test('a saved native response passes through the real attachment traversal and retains its CAS blob',async()=>{
  mockDb=createInitializedRealSqliteTestDb();
  try {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({exists:true,isDirectory:false,size:1000});
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify({images:[{image:png,seed:123,index:0}]}));
    mockImport.mockResolvedValue({sha256:hash,mime:'image/png',byteSize:68,relativePath:`cas/sha256/cc/${hash}`});
    const store=novelAiResponseStore(mockDb as never);
    await expect(store.importResponse('file:///saved-response','request-key')).resolves.toEqual([{hash,seed:123,index:0,width:1,height:1}]);
    expect(mockImport).toHaveBeenCalledWith(`data:image/png;base64,${png}`, 'image/png');
    expect(mockDb.getAllSync("SELECT owner_type,owner_id FROM artifact_blob_refs WHERE blob_sha256=?",hash)).toEqual([{owner_type:'novelai_response',owner_id:'request-key'}]);
    expect(mockDb.getAllSync("SELECT * FROM app_scheduler_leases WHERE lease_key LIKE 'agent-import:%'")).toEqual([]);
    expect(mockDb.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{mockDb.close();}
});
