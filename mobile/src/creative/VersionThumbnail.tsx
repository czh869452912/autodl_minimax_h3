import { useEffect, useState } from 'react';
import { Image, Text } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '../storage/databaseClient';
import { creativeUI as s } from './creativeUI';
export function VersionThumbnail({ versionId, compact=false }: { versionId: string; compact?:boolean }) {
  const [path, setPath] = useState<string>();
  useEffect(() => {
    let active = true; setPath(undefined);
    void getDatabase().getFirstAsync<{ relative_path: string }>("SELECT b.relative_path FROM creative_version_files f JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE f.version_id=? AND f.role='original' AND f.state='AVAILABLE' AND b.mime LIKE 'image/%'", versionId).then(row => { if (active) setPath(row?.relative_path); }).catch(() => undefined);
    return () => { active = false; };
  }, [versionId]);
  return path ? <Image accessibilityLabel="已选定参考图" source={{ uri: `${FileSystem.documentDirectory}${path}` }} style={[s.preview,compact && {width:88,height:70,borderRadius:8}]} resizeMode="contain" /> : <Text style={s.muted}>已选定参考版本</Text>;
}
