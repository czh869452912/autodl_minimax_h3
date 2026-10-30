import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
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
  return <View style={{ gap: 16 }}>
    <Text style={s.body}>{project.brief || '写下目标、风格和交付要求，让每次创作保持一致。'}</Text>
    {!project.archivedAt ? <ListAction label="编辑项目简报" secondary onPress={onEdit} /> : <Text style={s.muted}>项目已归档，可查看成果。需要继续制作时，请在项目设置中恢复项目。</Text>}
    <View style={s.card}><Text style={s.title}>{project.archivedAt ? '项目成果' : '继续制作'}</Text><Text style={s.body}>{summary}</Text><ListAction label={project.archivedAt ? "查看镜头与成果" : "查看镜头与下一步"} onPress={onShots} /></View>
    {!project.archivedAt ? <ListAction label="让助手协助本项目" secondary onPress={() => router.push({ pathname: '/(tabs)/agent', params: { projectId: project.id } })} /> : null}
    <ProjectPlans projectId={project.id} archived={Boolean(project.archivedAt)} compact />
    {drafts.length ? <Text style={s.title}>最近创作</Text> : null}
    {drafts.map(d => <View style={s.card} key={d.id}><Text style={s.muted}>{d.provider_id === 'novelai' ? '图片' : '视频'} · {d.state === 'EDITING' ? '编辑中' : '已提交'}</Text><Text style={s.body} numberOfLines={2}>{JSON.parse(d.input_json).prompt || '未命名草稿'}</Text><ListAction label={d.state === 'EDITING' ? '继续编辑' : '查看进度与成果'} secondary onPress={() => router.push({ pathname: d.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: d.id } })} /></View>)}
  </View>;
}
