import { z } from 'zod';
import type { AppDatabase } from '../storage/appDatabase';
const id = z.string().min(1).max(200), revision = z.number().int().nonnegative();
const title = z.string().trim().min(1).max(200), description = z.string().max(20000);
export const storySchemas = {
  'shot.create': z.object({ projectId: id, title, description: description.default('') }).strict(),
  'shot.update': z.object({ id, expectedRevision: revision, title, description, status: z.enum(['planned','working','review','approved']) }).strict(),
  'shot.delete': z.object({ id, expectedRevision: revision }).strict(),
  'shot.reorder': z.object({ projectId: id, shots: z.array(z.object({ id, expectedRevision: revision }).strict()).min(1).max(500) }).strict(),
  'shot.selectOutput': z.object({ id, expectedRevision: revision, slot: z.enum(['selected_image','selected_video']), versionId: id.nullable() }).strict(),
  'asset.pinProjectVersion': z.object({ assetId: id, projectId: id, expectedRevision: revision, versionId: id.nullable() }).strict(),
};
export type StoryCommand = { [K in keyof typeof storySchemas]: { name: K; payload: z.input<typeof storySchemas[K]> } }[keyof typeof storySchemas];
export type CreativeShot = { id: string; project_id: string; title: string; description: string; sort_key: number; editorial_status: 'planned' | 'working' | 'review' | 'approved'; revision: number; selected_image: string | null; selected_video: string | null; image_state?: string | null; image_asset_id?: string | null };
export function listCreativeShots(db: AppDatabase, projectId: string) {
  return db.getAllAsync<CreativeShot>(`SELECT s.*,
    (SELECT version_id FROM creative_shot_assets WHERE shot_id=s.id AND slot='selected_image') AS selected_image,
    (SELECT version_id FROM creative_shot_assets WHERE shot_id=s.id AND slot='selected_video') AS selected_video,
    (SELECT f.state FROM creative_shot_assets a LEFT JOIN creative_version_files f ON f.version_id=a.version_id AND f.role='original' WHERE a.shot_id=s.id AND a.slot='selected_image') AS image_state,
    (SELECT v.asset_id FROM creative_shot_assets a JOIN creative_asset_versions v ON v.id=a.version_id WHERE a.shot_id=s.id AND a.slot='selected_image') AS image_asset_id
    FROM creative_shots s WHERE project_id=? AND deleted_at IS NULL ORDER BY sort_key,id`, projectId);
}
export async function applyStoryCommand(tx: AppDatabase, name: string, p: any, now: number, makeId: () => string): Promise<Record<string, string>> {
  if (!(name in storySchemas)) throw new Error('UNKNOWN_CREATIVE_COMMAND');
  const requireProject = async (id: string) => { if (!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL', id)) throw new Error('PROJECT_NOT_AVAILABLE'); };
  const version = async (versionId: string) => {
    const row = await tx.getFirstAsync<{ asset_id: string; kind: string }>("SELECT v.asset_id,a.kind FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' AND f.state='AVAILABLE' WHERE v.id=?", versionId);
    if (!row) throw new Error('VERSION_NOT_AVAILABLE'); return row;
  };
  if (name === 'asset.pinProjectVersion') {
    await requireProject(p.projectId);
    if (p.versionId && (await version(p.versionId)).asset_id !== p.assetId) throw new Error('VERSION_ASSET_MISMATCH');
    const r = await tx.runAsync('UPDATE creative_project_assets SET pinned_version_id=?,revision=revision+1 WHERE project_id=? AND asset_id=? AND revision=?', p.versionId, p.projectId, p.assetId, p.expectedRevision);
    if (Number(r.changes) !== 1) throw new Error('REVISION_CONFLICT');
    return { assetId: p.assetId, projectId: p.projectId };
  }
  if (name === 'shot.create') {
    await requireProject(p.projectId);
    const rows = await tx.getFirstAsync<{ n: number; last: number }>('SELECT COUNT(*) AS n,COALESCE(MAX(sort_key),0) AS last FROM creative_shots WHERE project_id=? AND deleted_at IS NULL', p.projectId);
    if ((rows?.n ?? 0) >= 500) throw new Error('SHOT_LIMIT_REACHED');
    const shotId = makeId();
    await tx.runAsync("INSERT INTO creative_shots VALUES(?,?,?,?,?,'planned',0,NULL,?,?)", shotId, p.projectId, p.title, p.description, (rows?.last ?? 0) + 1024, now, now);
    return { shotId };
  }
  if (name === 'shot.reorder') {
    await requireProject(p.projectId);
    const rows = await listCreativeShots(tx, p.projectId);
    if (rows.length !== p.shots.length || new Set(p.shots.map((s: { id: string }) => s.id)).size !== rows.length || p.shots.some((s: { id: string; expectedRevision: number }) => !rows.some(r => r.id === s.id && r.revision === s.expectedRevision))) throw new Error('REVISION_CONFLICT');
    for (const [index, shot] of (p.shots as { id: string }[]).entries()) await tx.runAsync('UPDATE creative_shots SET sort_key=?,revision=revision+1,updated_at=? WHERE id=?', (index + 1) * 1024, now, shot.id);
    return { projectId: p.projectId };
  }
  const shot = await tx.getFirstAsync<CreativeShot>('SELECT * FROM creative_shots WHERE id=? AND deleted_at IS NULL', p.id);
  if (!shot || shot.revision !== p.expectedRevision) throw new Error('REVISION_CONFLICT');
  await requireProject(shot.project_id);
  if (name === 'shot.update') await tx.runAsync('UPDATE creative_shots SET title=?,description=?,editorial_status=?,revision=revision+1,updated_at=? WHERE id=?', p.title, p.description, p.status, now, p.id);
  else if (name === 'shot.delete') await tx.runAsync('UPDATE creative_shots SET deleted_at=?,revision=revision+1,updated_at=? WHERE id=?', now, now, p.id);
  else if (name === 'shot.selectOutput') {
    if (p.versionId) {
      const selected = await version(p.versionId);
      if (selected.kind !== (p.slot === 'selected_image' ? 'image' : 'video')) throw new Error('SHOT_VERSION_KIND_MISMATCH');
      await tx.runAsync('INSERT INTO creative_shot_assets VALUES(?,?,0,?) ON CONFLICT(shot_id,slot,ordinal) DO UPDATE SET version_id=excluded.version_id', p.id, p.slot, p.versionId);
      await tx.runAsync('INSERT INTO creative_project_assets VALUES(?,?,?,0) ON CONFLICT(project_id,asset_id) DO NOTHING', shot.project_id, selected.asset_id, p.versionId);
    } else await tx.runAsync('DELETE FROM creative_shot_assets WHERE shot_id=? AND slot=?', p.id, p.slot);
    await tx.runAsync('UPDATE creative_shots SET revision=revision+1,updated_at=? WHERE id=?', now, p.id);
  }
  return { shotId: p.id };
}
