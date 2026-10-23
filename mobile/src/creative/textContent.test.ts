import * as FileSystem from 'expo-file-system/legacy';
import {sha256File} from '../native/media';
import {readCreativeText} from './textContent';
import type {AssetVersion} from './types';
jest.mock('../native/media',()=>({sha256File:jest.fn()}));
const version:AssetVersion={id:'v',assetId:'a',versionNo:1,source:'authored',state:'AVAILABLE',recipe:{},relativePath:'cas/text',blobSha256:'a'.repeat(64)};
beforeEach(()=>{jest.clearAllMocks();(FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({exists:true,isDirectory:false,size:10});(sha256File as jest.Mock).mockResolvedValue(version.blobSha256);(FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('角色设定');});
test('validated content is shared by preview and editing',async()=>{expect(await readCreativeText(version)).toBe('角色设定');});
test.each(['missing','oversized','corrupt'])('%s text is never read into editor',async(kind)=>{
  if(kind==='missing')(FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({exists:false});
  if(kind==='oversized')(FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({exists:true,size:100*1024+1});
  if(kind==='corrupt')(sha256File as jest.Mock).mockResolvedValue('b'.repeat(64));
  await expect(readCreativeText(version)).rejects.toThrow();expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
});
