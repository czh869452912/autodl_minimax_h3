import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeService } from './runtime';
import type { AssetVersion } from './types';
import type { CreativeDraft } from './drafts';
import { MediaPreview } from './MediaPreview';
import { VideoPlayer } from '../media/VideoPlayer';
import { CompactWorkbench, IconAction, TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

/** A result preview never resolves a draft session to its latest submission. */
export function CreativeOutputPreview({ versionId, assetId, jobId, draftId }: { versionId: string; assetId: string; jobId: string; draftId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<{ key: string; version?: AssetVersion; draft?: CreativeDraft; error?: string }>();
  const key = JSON.stringify([versionId, assetId, jobId, draftId]);
  useFocusEffect(useCallback(() => {
    let active = true;
    setResult(undefined);
    void (async () => {
      if (!versionId || !assetId || !jobId || !draftId) throw new Error('成果链接不完整，请从原任务重新打开。');
      const service = creativeService();
      const [versions, draft] = await Promise.all([service.versionsByIds([versionId]), service.draft(draftId)]);
      const version = versions.find(item => item.id === versionId);
      if (!version) throw new Error('该版本不可用，记录可能已移除。');
      if (version.assetId !== assetId || version.recipe.jobId !== jobId || (draft && (draft.job_id !== jobId || draft.target_asset_id !== assetId))) {
        throw new Error('成果与来源任务不匹配，请从原任务重新打开。');
      }
      if (active) setResult({ key, version, draft: draft ?? undefined });
    })().catch(error => { if (active) setResult({ key, error: error instanceof Error ? error.message : '成果读取失败，请返回重试。' }); });
    return () => { active = false; };
  }, [key, versionId, assetId, jobId, draftId]));
  const current = result?.key === key ? result : undefined;
  const version = current?.version;
  return <CompactWorkbench><SafeAreaView style={s.screen}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8 }}><IconAction label="返回" icon="arrow_back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/tasks')} /><Text style={[s.title, { flex: 1 }]}>成果预览</Text></View>
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      {!current ? <Text style={s.muted}>正在读取成果…</Text> : null}
      {current?.error ? <Text accessibilityRole="alert" style={s.error}>{current.error}</Text> : null}
      {version ? <>
        <Text style={s.body}>版本 {version.versionNo}</Text>
        {version.state === 'AVAILABLE' && version.relativePath ? <View style={{ flex: 1, minHeight: 220 }}>
          {version.mime?.startsWith('video/') ? <VideoPlayer source={`${FileSystem.documentDirectory}${version.relativePath}`} /> : <MediaPreview version={version} contain label={`版本 ${version.versionNo} 预览`} style={{ flex: 1 }} />}
        </View> : <Text style={s.muted}>版本记录仍保留，原文件待恢复。</Text>}
        <TextAction label="查看素材与版本" onPress={() => router.push({ pathname: '/creative-asset/[id]', params: { id: version.assetId, versionId: version.id } })} />
        {current?.draft ? <TextAction label="继续创作" onPress={() => router.push({ pathname: current.draft!.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: current.draft!.id } })} /> : <Text style={s.muted}>来源草稿已不可用，成果仍可查看。</Text>}
      </> : null}
    </View>
  </SafeAreaView></CompactWorkbench>;
}
