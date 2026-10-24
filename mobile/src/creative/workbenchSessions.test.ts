import {groupWorkbenchDrafts,workbenchResultDraft} from './workbenchSessions';
import {defaultNovelAiDraft} from './novelAiProtocol';
import type {CreativeDraft} from './drafts';
let mockRows:CreativeDraft[]=[];
jest.mock('./runtime',()=>({creativeService:()=>({drafts:async()=>mockRows})}));
const draft=(id:string,patch:Partial<CreativeDraft>={}):CreativeDraft=>({id,provider_id:'novelai',workflow_id:'image',state:'EDITING',revision:0,project_id:null,shot_id:null,target_asset_id:null,job_id:null,input_json:JSON.stringify(defaultNovelAiDraft),...patch});
test('records group immutable requests and editable successors by asset and scope while hiding untouched blanks',()=>{
  const rows=[draft('blank',{revision:7}),draft('next',{target_asset_id:'asset',revision:1}),draft('job2',{target_asset_id:'asset',state:'SUBMITTED',job_id:'j2'}),draft('job1',{target_asset_id:'asset',state:'SUBMITTED',job_id:'j1'}),draft('other-shot',{target_asset_id:'asset',project_id:'p',shot_id:'shot',job_id:'j3'}),draft('video',{provider_id:'autodl',job_id:'v'}),draft('video-reference',{provider_id:'autodl',has_inputs:1})];
  expect(groupWorkbenchDrafts(rows,'image')).toEqual([{draft:rows[1],generations:2},{draft:rows[4],generations:1}]);
  expect(groupWorkbenchDrafts(rows,'video')).toEqual([{draft:rows[5],generations:1},{draft:rows[6],generations:0}]);
});
test('an editable successor restores its most recent submitted result without selecting a different shot',async()=>{
  const next=draft('next',{target_asset_id:'asset',project_id:'p',shot_id:'shot'});
  mockRows=[draft('unrelated',{...next,id:'unrelated',shot_id:'other',job_id:'wrong'}),draft('result',{...next,id:'result',job_id:'last-job',state:'SUBMITTED'})];
  expect((await workbenchResultDraft(next)).job_id).toBe('last-job');
});
