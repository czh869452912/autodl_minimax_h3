import { draftPresentation } from './workPresentation';
import { IconAction } from './WorkbenchUI';
import { COLORS } from '../ui/theme';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { creativeService } from './runtime';
import type { CreativeProject } from './types';
import type { CreativeDraft } from './drafts';
import { ProjectPlans } from './ProjectPlans';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';

export function ProjectOverview({ project, onShots, onEdit }: { project: CreativeProject; onShots: () => void; onEdit: () => void }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<CreativeDraft[]>([]);
  const [summary, setSummary] = useState('正在读取镜头进展…');
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([creativeService().shots(project.id), creativeService().drafts(project.id)]).then(([shots, drafts]) => {
      if (!active) return;
      setDrafts(drafts.slice(0, 3));
      const adopted = shots.filter(s => s.selected_video).length;
      setSummary(shots.length ? `${shots.length} 个镜头 · ${adopted} 个已选定视频 · ${shots.filter(s => !s.selected_image).length} 个待选图` : '还没有镜头，从第一个画面开始。');
    }).catch(() => { if (active) setSummary('进展读取失败，请重新进入项目'); });
    return () => { active = false; };
  }, [project.id]));
  return <View style={{gap:10}}>
    <View style={s.card}>
      <View style={{flexDirection:'row',alignItems:'center'}}><Text style={[s.title,{flex:1}]}>项目简报</Text>{!project.archivedAt?<IconAction label="编辑项目简报" icon="edit" onPress={onEdit}/>:null}</View>
      <Text style={s.body}>{project.brief || '尚未填写目标、风格和交付要求。'}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={project.archivedAt?'查看镜头与成果':'查看镜头与下一步'} onPress={onShots} style={[s.card,{borderColor:COLORS.primary}]}>
      <Text style={s.title}>{project.archivedAt?'项目成果':'镜头进度'} →</Text><Text style={s.body}>{summary}</Text>
    </Pressable>
    {!project.archivedAt?<View style={{flexDirection:'row'}}><ListAction label="在助手中继续" secondary icon="auto_awesome" onPress={()=>router.push({pathname:'/(tabs)/agent',params:{projectId:project.id}})}/></View>:null}
    <ProjectPlans projectId={project.id} archived={Boolean(project.archivedAt)} compact/>
    {drafts.length?<Text style={s.title}>最近创作</Text>:null}
    {drafts.map(d=><Pressable accessibilityRole="button" accessibilityLabel={d.state==='EDITING'?'继续编辑':'查看进度与成果'} key={d.id} style={s.card} onPress={()=>router.push({pathname:d.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:d.id}})}>
      <Text style={s.muted}>{d.provider_id==='novelai'?'图片':'视频'} · {d.state==='EDITING'?'编辑中':'已提交'} →</Text><Text style={s.body} numberOfLines={2}>{draftPresentation(d).title}</Text><Text style={s.muted}>{draftPresentation(d).updated}</Text>
    </Pressable>)}
  </View>;
}
