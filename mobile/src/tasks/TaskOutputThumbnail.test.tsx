import React from 'react';
import {act,create} from 'react-test-renderer';
import {TaskOutputThumbnail} from './TaskOutputThumbnail';
const mockRead=jest.fn();const mockPoster=jest.fn();
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:mockRead})}));
jest.mock('../native/media',()=>({extractPoster:(...args:unknown[])=>mockPoster(...args)}));
jest.mock('../creative/previewQueue',()=>({previewQueue:{request:(_key:string,run:()=>Promise<string>)=>({promise:run(),release:jest.fn()})}}));
beforeEach(()=>{jest.clearAllMocks();mockPoster.mockResolvedValue('file:///poster.jpg');});
test('creative video tasks extract a poster from their available local result',async()=>{
 mockRead.mockImplementation(async(sql:string)=>sql.includes('artifact_blobs')?{relative_path:'cas/video',sha256:'hash'}:undefined);
 let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<TaskOutputThumbnail id="job" updatedAt={1} video/>);});expect(mockPoster).toHaveBeenCalledWith(expect.stringContaining('cas/video'),'creative-preview:hash');expect(tree.root.findAllByProps({accessibilityLabel:'任务结果缩略图'})[0].props.source.uri).toBe('file:///poster.jpg');}finally{act(()=>tree?.unmount());}
});
test('legacy downloaded videos without a thumbnail also extract a poster',async()=>{
 mockRead.mockImplementation(async(sql:string)=>sql.includes('FROM tasks')?{local_uri:'file:///old.mp4'}:undefined);
 let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<TaskOutputThumbnail id="old" updatedAt={1} video/>);});expect(mockPoster).toHaveBeenCalledWith('file:///old.mp4','creative-preview:old');expect(tree.root.findAllByProps({accessibilityLabel:'任务结果缩略图'}).length).toBeGreaterThan(0);}finally{act(()=>tree?.unmount());}
});

test('a late poster from the previous task cannot replace the current task thumbnail',async()=>{
 let finish!:(value:string)=>void;
 mockRead.mockImplementation(async(sql:string,id:string)=>sql.includes('artifact_blobs')?{relative_path:'cas/'+id,sha256:id}:undefined);
 mockPoster.mockImplementation((source:string)=>source.endsWith('/first')?new Promise<string>(resolve=>{finish=resolve;}):Promise.resolve('file:///second.jpg'));
 let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<TaskOutputThumbnail id="first" updatedAt={1} video/>);});
 await act(async()=>tree.update(<TaskOutputThumbnail id="second" updatedAt={1} video/>));
 await act(async()=>finish('file:///first.jpg'));
 expect(tree.root.findAllByProps({accessibilityLabel:'任务结果缩略图'})[0].props.source.uri).toBe('file:///second.jpg');
 }finally{act(()=>tree?.unmount());}
});
