import React from 'react';
import { act, create } from 'react-test-renderer';
import { DraftParametersSheet } from './DraftParametersSheet';
import type { CreativeDraft } from './drafts';

jest.mock('../storage/databaseClient', () => ({ getDatabase: () => ({
  getAllAsync: async () => [{ version_id:'reference', state:'MISSING' }],
  getFirstAsync:async()=>({input_json:JSON.stringify({prompt:'Actual submitted motion',seed:123456,duration:10})}),
}) }));

test('submitted parameters show the original video prompt and references without editing or exposing raw parameters by default', async () => {
  const draft = {id:'draft',input_json:JSON.stringify({prompt:'缓慢推近',duration:5,resolution:'720p',seed:0}),state:'SUBMITTED'} as CreativeDraft;
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<DraftParametersSheet draft={draft} onClose={()=>undefined} />); });
    const content = () => JSON.stringify(tree.toJSON());
    expect(content()).toContain('缓慢推近');
    expect(content()).toContain('5 秒');
    expect(content()).toContain('种子 0');
    expect(content()).toContain('原文件待恢复');
    expect(content()).not.toContain('TextInput');
    expect(content()).not.toContain('"duration"');
    act(()=>tree.root.findAll(node=>node.props.accessibilityLabel==='查看完整参数' && typeof node.props.onPress==='function')[0].props.onPress());
    expect(content()).toContain('duration');
  } finally {act(()=>tree?.unmount());}
});

test('pinned workflow parameters display the submitted random seed rather than the editable seed placeholder',async()=>{
  const draft={id:'video',job_id:'job',input_json:JSON.stringify({schemaVersion:2,workflow:{id:'video.workflow',version:'1.0',title:'Video model'},prompt:'Draft prompt',values:{prompt:'Draft prompt',seed:'',duration:5}})} as CreativeDraft;
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<DraftParametersSheet draft={draft} onClose={()=>undefined}/>);});
    const content=JSON.stringify(tree.toJSON());
    expect(content).toContain('Actual submitted motion');expect(content).toContain('种子 123456');expect(content).toContain('10 秒');expect(content).toContain('Video model');expect(content).not.toContain('Draft prompt');
  }finally{act(()=>tree?.unmount());}
});
