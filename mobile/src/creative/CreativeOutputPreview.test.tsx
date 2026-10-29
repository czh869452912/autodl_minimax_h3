import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeOutputPreview } from './CreativeOutputPreview';
import { VideoPlayer } from '../media/VideoPlayer';
import type { AssetVersion } from './types';

const mockVersions = jest.fn<Promise<AssetVersion[]>, [string[]]>();
const mockDraft = jest.fn();
const mockPush = jest.fn(), mockBack = jest.fn(), mockReplace = jest.fn();
let mockCanBack = true;
jest.mock('./runtime',()=>({creativeService:()=>({versionsByIds:mockVersions,draft:mockDraft})}));
jest.mock('../media/VideoPlayer',()=>({VideoPlayer:()=>null}));
jest.mock('./MediaPreview',()=>({MediaPreview:()=>null}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:mockBack,replace:mockReplace,canGoBack:()=>mockCanBack}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
const version:AssetVersion={id:'a',assetId:'asset',versionNo:1,source:'generated',state:'AVAILABLE',mime:'video/mp4',relativePath:'a.mp4',recipe:{jobId:'job'}};
const target={versionId:'a',assetId:'asset',jobId:'job',draftId:'draft'};
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
beforeEach(()=>{
  jest.clearAllMocks();mockCanBack=true;
  mockVersions.mockImplementation(async ids=>[version,{...version,id:'b',versionNo:2,relativePath:'b.mp4'}].filter(v=>ids.includes(v.id)));
  mockDraft.mockResolvedValue({id:'draft',job_id:'job',target_asset_id:'asset',provider_id:'autodl'});
});

test('A/B/A preview follows the exact version and editing is a separate action',async()=>{
  let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeOutputPreview {...target}/>);});
    expect(tree.root.findByType(VideoPlayer).props.source).toContain('a.mp4');
    await act(async()=>tree.update(<CreativeOutputPreview {...target} versionId="b"/>));
    expect(tree.root.findByType(VideoPlayer).props.source).toContain('b.mp4');
    await act(async()=>tree.update(<CreativeOutputPreview {...target}/>));
    expect(tree.root.findByType(VideoPlayer).props.source).toContain('a.mp4');
    act(()=>button(tree,'继续创作').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({pathname:'/creative-draft/[id]',params:{id:'draft'}});
    act(()=>button(tree,'返回').props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
  } finally {act(()=>tree?.unmount());}
});

test.each(['missing','wrong-asset','wrong-job','wrong-draft'])('rejects %s without showing a replacement result',async kind=>{
  if(kind==='missing')mockVersions.mockResolvedValue([]);
  if(kind==='wrong-asset')mockVersions.mockResolvedValue([{...version,assetId:'elsewhere'}]);
  if(kind==='wrong-job')mockVersions.mockResolvedValue([{...version,recipe:{jobId:'elsewhere'}}]);
  if(kind==='wrong-draft')mockDraft.mockResolvedValue({job_id:'other',target_asset_id:'asset'});
  mockCanBack=false;
  let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeOutputPreview {...target}/>);});
    expect(tree.root.findAllByType(VideoPlayer)).toHaveLength(0);
    expect(button(tree,'继续创作')).toBeUndefined();
    expect(tree.root.findAll(n=>n.props.accessibilityRole==='alert').length).toBeGreaterThan(0);
    act(()=>button(tree,'返回').props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/tasks');
  } finally {act(()=>tree?.unmount());}
});

test('a missing original file retains version identity and permits explicit recovery',async()=>{
  mockVersions.mockResolvedValue([{...version,state:'MISSING',relativePath:undefined}]);
  let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeOutputPreview {...target}/>);});
    expect(JSON.stringify(tree.toJSON())).toContain('原文件待恢复');
    expect(tree.root.findAllByType(VideoPlayer)).toHaveLength(0);
    act(()=>button(tree,'查看素材与版本').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({pathname:'/creative-asset/[id]',params:{id:'asset',versionId:'a'}});
  } finally {act(()=>tree?.unmount());}
});

test('a delayed old read cannot replace a more recent target',async()=>{
  let release!:(rows:AssetVersion[])=>void;
  mockVersions.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeOutputPreview {...target}/>);});
    await act(async()=>tree.update(<CreativeOutputPreview {...target} versionId="b"/>));
    await act(async()=>release([version]));
    expect(tree.root.findByType(VideoPlayer).props.source).toContain('b.mp4');
  } finally {act(()=>tree?.unmount());}
});
