import React from 'react';
import {act,create} from 'react-test-renderer';
import {createInitializedRealSqliteTestDb} from '../../test/realSqlite';
import {withWriteTransaction} from '../../storage/sqliteBusy';
import {createSkillStore} from './store';
import {validateSkillPackage} from './package';
import {selectNextRunSkills,acceptNextRunSkills,readNextRunSkills} from './nextRun';
import {SkillLibraryScreen} from './SkillLibraryScreen';
import {ListAction} from '../../ui/ListPageUI';

let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
jest.mock('../../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn(),canGoBack:()=>true,back:jest.fn()}),useFocusEffect:(effect:()=>void)=>require('react').useEffect(effect,[effect])}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-file-system',()=>({File:jest.fn()}));

test('review reproduction: an open skill panel keeps showing an override after acceptance consumed it',async()=>{
 mockDb=createInitializedRealSqliteTestDb();let tree:ReturnType<typeof create>|undefined;
 try{
  mockDb.runSync('INSERT INTO creative_agent_scopes(thread_id,project_id,revision,updated_at) VALUES(?,NULL,0,1)','review-thread');
  const store=createSkillStore(mockDb as never);
  const id=await store.install(validateSkillPackage({'SKILL.md':'---\nname: review-once\ndescription: Review once only\n---\nReview the scene.'}));
  await selectNextRunSkills(mockDb as never,'review-thread',[id]);
  const panel=()=> <SkillLibraryScreen threadId="review-thread" onClose={()=>{}}/>;
  await act(async()=>{tree=create(panel());});
  const output=()=>JSON.stringify(tree!.toJSON());
  expect(output()).toContain('已固定，等待下一条消息消费');
  // Use the exact transaction function called by threadStore.accept; no model/runtime is started.
  await act(async()=>{await withWriteTransaction(mockDb as never,tx=>acceptNextRunSkills(tx,'review-thread','accepted-run'));});
  expect(await readNextRunSkills(mockDb as never,'review-thread')).toBeNull();
  expect((await store.capture('review-thread','accepted-run')).versions.map(v=>v.id)).toEqual([id]);
  // Parent runtime changes cause normal rerenders while its skill panel remains mounted.
  await act(async()=>tree!.update(panel()));
  expect(output()).toContain('已固定，等待下一条消息消费');
  expect(output()).not.toContain('当前使用项目组合，没有单次覆盖');
  await act(async()=>tree!.root.findAllByType(ListAction).find(n=>n.props.label==='选择下次运行技能')!.props.onPress());
  expect(output()).toContain('正在编辑，尚未保存');
  expect(tree!.root.findAllByType(ListAction).some(n=>n.props.label==='✓ 本次选用 review-once')).toBe(true);
  // Actual second run correctly falls back to defaults: the defect is the misleading UI status.
  expect((await store.capture('review-thread','second-run')).versions).toEqual([]);
  await act(async()=>tree!.unmount());tree=undefined;
  await act(async()=>{tree=create(panel());});
  expect(output()).toContain('当前使用项目组合，没有单次覆盖');
  expect(output()).not.toContain('已固定，等待下一条消息消费');
 }finally{if(tree)act(()=>tree!.unmount());mockDb.close();}
});
