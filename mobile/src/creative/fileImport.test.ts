import * as FileSystem from 'expo-file-system/legacy';
import {stageCreativeFile,importCreativeFile} from './fileImport';
import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
let mockDb:unknown;
const mockPublish=jest.fn(),mockAdopt=jest.fn(()=>({publish:mockPublish}));
jest.mock('../media/cas',()=>({createArtifactCas:()=>({adoptNativePart:mockAdopt})}));
jest.mock('../native/media',()=>({sha256File:async()=> 'a'.repeat(64)}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
beforeEach(()=>{
  jest.clearAllMocks();
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({exists:true,isDirectory:false,size:10});
  (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);
  (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
  (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  mockPublish.mockResolvedValue({sha256:'a'.repeat(64),byteSize:10,mime:'application/pdf',relativePath:'cas/document'});
});
test('document imports into CAS with durable version pin, provenance and no fake task',async()=>{
  const db=createInitializedRealSqliteTestDb();mockDb=db;try{
    await importCreativeFile({uri:'file:///selected.pdf',name:'设定.pdf',mimeType:'application/pdf'});
    expect(db.getFirstSync('SELECT kind,title FROM creative_assets')).toEqual({kind:'document',title:'设定.pdf'});
    expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
    expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='agent_import'")).toHaveLength(0);
    expect(db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    expect(db.getFirstSync('SELECT locator_json FROM creative_recovery_sources')).toEqual({locator_json:JSON.stringify({uri:'file:///selected.pdf'})});
  }finally{db.close();}
});
test('oversize source and truncated copy never publish; rejected part is cleaned up',async()=>{
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({exists:true,isDirectory:false,size:101*1024*1024});
  await expect(stageCreativeFile('file:///large.mp4','video/mp4')).rejects.toThrow('100MB');
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({exists:true,isDirectory:false,size:20}).mockResolvedValueOnce({exists:true,isDirectory:false,size:10});
  await expect(stageCreativeFile('file:///short.mp4','video/mp4')).rejects.toThrow('复制不完整');
  expect(mockPublish).not.toHaveBeenCalled();expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
});
test('failed domain receipt leaves no document or permanent reference',async()=>{
  const db=createInitializedRealSqliteTestDb();mockDb=db;try{
    db.execSync("CREATE TRIGGER fail_import BEFORE INSERT ON creative_command_receipts BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(importCreativeFile({uri:'file:///selected.pdf',name:'设定.pdf',mimeType:'application/pdf'})).rejects.toThrow('injected');
    expect(db.getAllSync('SELECT * FROM creative_assets')).toHaveLength(0);
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(0);
  }finally{db.close();}
});
