import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { ConversationDisclosure } from './disclosure';
import { RunProgress } from './RunProgress';
import { ActivityGroup } from './ActivityGroup';
import { AssistantTurn } from './AssistantTurn';
import type { PromptRun } from './types';
jest.mock('@copilotkit/react-native/components',()=>({CopilotMarkdown:({content}:{content:string})=>require('react').createElement(require('react-native').Text,null,content)}));
const run:PromptRun={id:'r',userMessageId:'u',messageIds:['a'],status:'completed',startedAt:1,endedAt:10,tools:[{id:'t',name:'validate_prompt',status:'complete',startedAt:2,endedAt:3,output:'{"valid":true}'}]};
const text=(tree:ReturnType<typeof create>)=>tree.root.findAllByType(Text).flatMap(n=>n.props.children).filter(v=>typeof v==='string').join('|');
test('manual opening survives virtualization and never crosses session providers',()=>{
 let tree!:ReturnType<typeof create>;
 const render=(visible:boolean)=><ConversationDisclosure>{visible?<ActivityGroup run={run} entries={run.tools.map(tool=>({id:tool.id,kind:'tool',tool}))}/>:null}</ConversationDisclosure>;
 act(()=>{tree=create(render(true));});
 act(()=>tree.root.findByProps({accessibilityLabel:'查看运行 r'}).props.onPress());
 expect(text(tree)).toContain('约束检查通过');
 act(()=>tree.update(render(false)));act(()=>tree.update(render(true)));
 expect(tree.root.findByProps({accessibilityLabel:'查看运行 r'}).props.accessibilityState.expanded).toBe(true);
 act(()=>tree.unmount());act(()=>{tree=create(render(true));});
 expect(tree.root.findByProps({accessibilityLabel:'查看运行 r'}).props.accessibilityState.expanded).toBe(false);
 act(()=>tree.unmount());
});
test('assistant replay keeps each intermediate reply outside its correctly ordered process',()=>{
 const ledger:PromptRun={...run,messageIds:['a','b'],activities:[{id:'thinking',kind:'reasoning',messageId:'a',text:'Check constraints'}, {id:'text:a',kind:'text',messageId:'a',text:'Checking'}, {id:'t',kind:'tool',messageId:'a'}, {id:'text:b',kind:'text',messageId:'b',text:'Finished'}]};
 let tree!:ReturnType<typeof create>;act(()=>{tree=create(<ConversationDisclosure><AssistantTurn run={ledger} text="CheckingFinished"/></ConversationDisclosure>);});
 const content=text(tree);expect(content.indexOf('思考过程')).toBeLessThan(content.indexOf('Checking'));expect(content.indexOf('Checking')).toBeLessThan(content.indexOf('检查提示词约束'));expect(content.indexOf('检查提示词约束')).toBeLessThan(content.indexOf('Finished'));
 expect(content).not.toContain('CheckingFinished');act(()=>tree.unmount());
});
test('inspecting a running tool keeps its parent open when the run completes',()=>{
 let tree!:ReturnType<typeof create>;
 const render=(status:PromptRun['status'])=><ConversationDisclosure><ActivityGroup run={{...run,status}} entries={run.tools.map(tool=>({id:tool.id,kind:'tool',tool}))}/></ConversationDisclosure>;
 act(()=>{tree=create(render('running'));});act(()=>tree.root.findByProps({testID:'process-item-t'}).props.onPress());act(()=>tree.update(render('completed')));
 expect(tree.root.findByProps({accessibilityLabel:'查看运行 r'}).props.accessibilityState.expanded).toBe(true);act(()=>tree.unmount());
});
test('live mobile turns show steps directly with one tail indicator and no repeated process headers',()=>{
 let tree!:ReturnType<typeof create>;
 act(()=>{tree=create(<ConversationDisclosure><AssistantTurn run={{...run,status:'running'}} text="Checking"/></ConversationDisclosure>);});
 expect(tree.root.findAll(n=>typeof n.props.accessibilityLabel==='string' && n.props.accessibilityLabel.startsWith('查看运行'))).toHaveLength(0);
 expect(tree.root.findAllByType(ActivityGroup)).toHaveLength(1);
 expect(tree.root.findAllByType(RunProgress)).toHaveLength(1);
 expect(text(tree)).toContain('约束检查通过');act(()=>tree.unmount());
});

test('tool-only proposal summaries follow execution rather than appearing before it',()=>{
 let tree!:ReturnType<typeof create>;
 const state:PromptRun={...run,activities:[{id:'t',kind:'tool',messageId:'model-round'}]};
 act(()=>{tree=create(<ConversationDisclosure><AssistantTurn run={state} text="Final proposal summary"/></ConversationDisclosure>);});
 const content=text(tree);expect(content.indexOf('检查提示词约束')).toBeLessThan(content.indexOf('Final proposal summary'));act(()=>tree.unmount());
});
