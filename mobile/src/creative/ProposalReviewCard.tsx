import {useState} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
import {proposalChanges,proposalState,proposalSubject,proposalValue,type ProposalReview} from './proposalPresentation';

export function ProposalReviewCard({review,expanded,onToggle,onResolve,busy}:{review:ProposalReview;expanded:boolean;onToggle:()=>void;onResolve:(accept:boolean)=>void;busy:boolean}){
  const {proposal:p,current,conflict}=review,changes=proposalChanges(p);
  const [whole,setWhole]=useState<Record<string,boolean>>({});
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{proposalSubject(p)}</Text>
    <Text accessibilityLiveRegion="polite" style={s.muted}>{proposalState(p.state)}{p.resolved_at?` · ${new Date(p.resolved_at).toLocaleString()}`:''}</Text>
    <Text style={s.body}>{changes.length?`修改 ${changes.length} 项：${changes.map(c=>c.label).join('、')}`:'建议内容与原内容一致'}</Text>
    {!expanded&&changes[0]?<Text numberOfLines={2} style={s.muted}>{changes[0].label} → {proposalValue(changes[0].field,changes[0].after)}</Text>:null}
    <ListAction label={expanded?'收起修改对照':'审阅修改'} secondary onPress={onToggle}/>
    {expanded?<>
      {conflict?<Text accessibilityRole="alert" style={s.error}>{current?'原内容已有新修订，暂不能采用这份旧建议。当前内容与原建议均保留；可拒绝建议，再基于最新内容提出修改。':'目标对象已移除或项目不可用，不能采用。建议内容仍保留，可拒绝此建议。'}</Text>:null}
      {changes.map(change=><View key={change.field} style={s.change}>
        <Text accessibilityRole="header" style={s.label}>{change.label}</Text>
        <Text style={s.muted}>原内容</Text><Text selectable numberOfLines={whole[change.field]||Math.max(change.before.length,change.after.length,current?.[change.field]?.length??0)<=70?undefined:5} style={s.body}>{proposalValue(change.field,change.before)}</Text>
        {conflict&&current?<><Text style={s.muted}>当前内容</Text><Text selectable numberOfLines={whole[change.field]||Math.max(change.before.length,change.after.length,current?.[change.field]?.length??0)<=70?undefined:5} style={s.body}>{proposalValue(change.field,current[change.field]??'')}</Text></>:null}
        <Text style={s.muted}>建议改为</Text><Text selectable numberOfLines={whole[change.field]||Math.max(change.before.length,change.after.length,current?.[change.field]?.length??0)<=70?undefined:5} style={s.body}>{proposalValue(change.field,change.after)}</Text>
        {Math.max(change.before.length,change.after.length,current?.[change.field]?.length??0)>70||[change.before,change.after,current?.[change.field]??''].some(value=>value.split('\n').length>5)?<ListAction label={`${whole[change.field]?'收起':'展开完整'}${change.label}对照`} secondary onPress={()=>setWhole(old=>({...old,[change.field]:!old[change.field]}))}/>:null}
      </View>)}
      {p.state==='WAITING'?<>
        <Text style={s.muted}>采用仅更新上述项目或镜头文字与状态，不会授权或提交生成。</Text>
        {!conflict&&changes.length?<ListAction label="采用这项修改" disabled={busy} onPress={()=>onResolve(true)}/>:null}
        <ListAction label="拒绝建议" secondary disabled={busy} onPress={()=>onResolve(false)}/>
      </>:<Text style={s.muted}>{p.state==='APPLIED'?'这份修改已采用，未提交生成。':p.state==='REJECTED'?'这份建议已拒绝，未修改目标内容。':'这份建议目前不能采用。'}</Text>}
    </>:null}
  </View>;
}
const s=StyleSheet.create({card:{padding:14,borderWidth:1,borderColor:COLORS.border,borderRadius:12,gap:10,backgroundColor:COLORS.surface},title:{color:COLORS.text,fontSize:16,fontWeight:'600'},label:{color:COLORS.text,fontSize:14,fontWeight:'600'},body:{color:COLORS.text,fontSize:14,lineHeight:22},muted:{color:COLORS.textMuted,fontSize:12,lineHeight:19},error:{color:COLORS.danger,fontSize:14,lineHeight:22},change:{gap:6,paddingVertical:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:COLORS.border}});
