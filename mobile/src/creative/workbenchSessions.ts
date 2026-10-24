import * as SecureStore from 'expo-secure-store';
import type { CreativeDraft } from './drafts';
import { creativeService } from './runtime';

export type WorkbenchMode = 'image' | 'video';
const modeOf = (draft: CreativeDraft): WorkbenchMode => draft.provider_id === 'novelai' ? 'image' : 'video';
const key = (mode: WorkbenchMode) => `creative.workbench.last.${mode}`;
let writes: Promise<unknown> = Promise.resolve();

export function rememberWorkbenchDraft(draft: CreativeDraft) {
  const next = writes.catch(() => undefined).then(() => SecureStore.setItemAsync(key(modeOf(draft)), draft.id));
  writes = next;
  return next;
}

export async function recentWorkbenchDraft(mode: WorkbenchMode, drafts: CreativeDraft[]) {
  await writes.catch(() => undefined);
  const saved = await SecureStore.getItemAsync(key(mode));
  return drafts.find(d => d.id === saved && modeOf(d) === mode) ?? drafts.find(d => modeOf(d) === mode);
}

/** Editable copies and their immutable submissions belong to one asset exploration. */
export function groupWorkbenchDrafts(drafts: CreativeDraft[], mode: WorkbenchMode) {
  const groups = new Map<string, { draft: CreativeDraft; generations: number }>();
  for (const draft of drafts) {
    if (modeOf(draft) !== mode || draft.state === 'DISCARDED') continue;
    let input;try{input=JSON.parse(draft.input_json);}catch{continue;}
    if (!draft.job_id && !draft.target_asset_id && !draft.has_inputs && !input.prompt?.trim() && !input.characters?.some((c:{enabled:boolean;prompt:string})=>c.enabled && c.prompt.trim()) && !input.sourceVersionId && !draft.shot_id) continue;
    const groupKey = `${draft.provider_id}:${draft.project_id ?? ''}:${draft.shot_id ?? ''}:${draft.target_asset_id ?? draft.id}`;
    const group = groups.get(groupKey);
    if (group) group.generations += draft.job_id ? 1 : 0;
    else groups.set(groupKey, { draft, generations: draft.job_id ? 1 : 0 });
  }
  return [...groups.values()];
}

/** Keep polling the last submission while its editable successor is being prepared. */
export async function workbenchResultDraft(draft: CreativeDraft) {
  if (!draft.target_asset_id) return draft;
  const rows = await creativeService().drafts(draft.project_id ?? undefined);
  return rows.find(row => row.target_asset_id === draft.target_asset_id && row.provider_id === draft.provider_id && row.shot_id === draft.shot_id && row.job_id) ?? draft;
}
