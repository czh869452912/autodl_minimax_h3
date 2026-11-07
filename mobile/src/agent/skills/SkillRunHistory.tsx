import {localTime} from '../../ui/localTime';
import {Text,View} from 'react-native';
import {ListAction} from '../../ui/ListPageUI';
import {creativeUI as s} from '../../creative/creativeUI';
import {RUN_LABELS} from '../../conversation/activityLabels';
import type {createSkillStore} from './store';

export type SkillRunRecords=Awaited<ReturnType<ReturnType<typeof createSkillStore>['runs']>>;
/** This query covers saved skill evidence, not every conversation run. */
export function SkillRunHistory({runs,scope,canChangeScope,onChangeScope,onOpen,onOlder,onLatest,loading=false,error='',onRetry}:{runs:SkillRunRecords;scope:string;canChangeScope:boolean;onChangeScope:()=>void;onOpen:(threadId:string,runId:string)=>void;onOlder?:()=>void;onLatest?:()=>void;loading?:boolean;error?:string;onRetry?:()=>void}){
 return <View style={{gap:12}}>
  <Text accessibilityRole="header" style={s.title}>{scope} · 技能运行记录</Text>
  <Text style={s.muted}>只显示保存了技能证据的运行。未记录技能快照的会话运行不会出现在此列表；可从对话历史查看原消息。</Text>
  {canChangeScope?<ListAction label={scope==='全部范围'?'返回当前范围':'查看全部范围'} secondary onPress={onChangeScope}/>:null}
  {loading?<Text accessibilityLiveRegion="polite" style={s.muted}>正在读取此范围的技能运行记录…</Text>:null}
  {error?<View style={s.card}><Text accessibilityRole="alert" style={s.error}>{error}{runs.length?' 已保留此范围上次读取的记录，内容可能不是最新。':''}</Text>{onRetry?<ListAction label="重试读取运行记录" secondary onPress={onRetry}/>:null}</View>:null}
  {!runs.length&&!loading&&!error?<View style={s.card}><Text style={s.title}>此范围还没有技能运行记录</Text><Text style={s.muted}>这不表示没有对话或生成任务。</Text></View>:runs.slice(0,20).map(item=><View key={`${item.threadId}:${item.runId}`} style={s.card}>
   <ListAction label={'查看运行：'+(item.threadTitle??'未命名会话')+' · '+localTime(item.createdAt)} secondary onPress={()=>onOpen(item.threadId,item.runId)}/>
   <Text style={s.body}>{RUN_LABELS[item.status as keyof typeof RUN_LABELS]??'状态未记录'} · {item.projectTitle??'未关联项目'}</Text>
   <Text style={s.muted}>固定技能：{item.snapshot.versions.length?item.snapshot.versions.map(ref=>item.skillNames?.[ref.id]??'版本不可用').join('、'):'仅内置技能'}</Text>
  </View>)}
  {onOlder?<ListAction label="更早的运行" secondary onPress={onOlder}/>:null}
  {onLatest?<ListAction label="最新运行" secondary onPress={onLatest}/>:null}
 </View>;
}
