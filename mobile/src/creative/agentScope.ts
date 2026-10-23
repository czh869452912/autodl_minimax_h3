import type { AppDatabase } from '../storage/appDatabase';
import type { CreativeCommand } from './types';
export type CreativeAgentOrigin = { threadId: string; runId: string; toolCallId: string; projectId: string | null; scopeRevision: number };

export async function assertCreativeAgentScope(tx: AppDatabase, origin: CreativeAgentOrigin) {
  const run = await tx.getFirstAsync<{ payload_json: string }>('SELECT payload_json FROM agent_runs WHERE thread_id=? AND id=?', origin.threadId, origin.runId);
  if (!run || !['queued','running'].includes(JSON.parse(run.payload_json).status)) throw new Error('AGENT_RUN_NOT_ACTIVE');
  const scope = await tx.getFirstAsync<{ project_id: string | null; revision: number }>('SELECT project_id,revision FROM creative_agent_scopes WHERE thread_id=?', origin.threadId);
  if (!scope || scope.project_id !== origin.projectId || scope.revision !== origin.scopeRevision) throw new Error('AGENT_SCOPE_CHANGED');
  return scope;
}
export async function guardCreativeAgentCommand(tx: AppDatabase, origin: CreativeAgentOrigin, command: CreativeCommand) {
  await assertCreativeAgentScope(tx, origin);
  const p = command.payload as Record<string, unknown>;
  if (command.name === 'project.create') return;
  if (!origin.projectId) throw new Error('AGENT_PROJECT_SELECTION_REQUIRED');
  const requireProject = (projectId: unknown) => { if (projectId !== origin.projectId) throw new Error('AGENT_PROJECT_SCOPE_MISMATCH'); };
  const version = async (versionId: unknown) => {
    if (typeof versionId !== 'string') return;
    if (!await tx.getFirstAsync('SELECT v.id FROM creative_asset_versions v JOIN creative_project_assets p ON p.asset_id=v.asset_id WHERE v.id=? AND p.project_id=?', versionId, origin.projectId)) throw new Error('AGENT_ASSET_SCOPE_MISMATCH');
  };
  if (command.name.startsWith('project.')) requireProject(p.id);
  else if (command.name === 'draft.createImage' || command.name === 'draft.createVideo' || command.name === 'shot.create' || command.name === 'shot.reorder') {
    requireProject(p.projectId); await version(p.versionId); await version(p.fromVersionId);
    if (typeof p.shotId === 'string' && !await tx.getFirstAsync('SELECT id FROM creative_shots WHERE id=? AND project_id=?', p.shotId, origin.projectId)) throw new Error('AGENT_SHOT_SCOPE_MISMATCH');
  } else if (command.name.startsWith('draft.')) {
    const draft = await tx.getFirstAsync<{project_id:string}>('SELECT project_id FROM creative_generation_drafts WHERE id=?', p.id as string);
    requireProject(draft?.project_id);
    if (Array.isArray(p.versionIds)) for (const id of p.versionIds) await version(id);
  } else if (command.name.startsWith('shot.')) {
    const shot = await tx.getFirstAsync<{project_id:string}>('SELECT project_id FROM creative_shots WHERE id=?', p.id as string);
    requireProject(shot?.project_id); await version(p.versionId);
  } else if (command.name === 'asset.export') await version(p.versionId);
  else if (command.name === 'asset.pinProjectVersion' || command.name === 'asset.unlinkFromProject') requireProject(p.projectId);
  else throw new Error('AGENT_COMMAND_NOT_ALLOWED');
}
