import * as SecureStore from 'expo-secure-store';
import type { CreativeDraft } from './drafts';
import { creativeService } from './runtime';
import {videoSession} from './videoDraftState';

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
    let input;try{input=JSON.parse(draft.input_json);if(!input||typeof input!=='object')continue;}catch{continue;}
    if (!draft.job_id && !draft.target_asset_id && !draft.has_inputs && !input.prompt?.trim() && !input.characters?.some((c:{enabled:boolean;prompt:string})=>c.enabled && c.prompt.trim()) && !input.sourceVersionId && !draft.shot_id) continue;
    const identity=mode==='video'?videoSession(input,draft.target_asset_id??draft.id):draft.target_asset_id??draft.id;
    const groupKey = `${draft.provider_id}:${draft.project_id ?? ''}:${draft.shot_id ?? ''}:${identity}`;
    const group = groups.get(groupKey);
    if (group) group.generations += draft.job_id ? 1 : 0;
    else groups.set(groupKey, { draft, generations: draft.job_id ? 1 : 0 });
  }
  return [...groups.values()];
}

/** Keep polling the last submission while its editable successor is being prepared. */
export async function workbenchResultDraft(draft: CreativeDraft) {
  if (!draft.target_asset_id && draft.provider_id==='novelai') return draft;
  const rows = await creativeService().drafts(draft.project_id ?? undefined);
  if(draft.provider_id!=='novelai')return videoSessionDrafts(draft,rows).find(row=>row.job_id)??draft;
  return rows.find(row => row.target_asset_id === draft.target_asset_id && row.provider_id === draft.provider_id && row.shot_id === draft.shot_id && row.job_id) ?? draft;
}

export function videoSessionDrafts(draft:CreativeDraft,rows:CreativeDraft[]){
  const raw=JSON.parse(draft.input_json),session=videoSession(raw,draft.target_asset_id??draft.id);
  return rows.filter(row=>{
    if(row.provider_id!==draft.provider_id||row.project_id!==draft.project_id||row.shot_id!==draft.shot_id)return false;
    try{const input=JSON.parse(row.input_json);return videoSession(input,row.target_asset_id??row.id)===session || Boolean(draft.target_asset_id&&row.target_asset_id===draft.target_asset_id);}catch{return false;}
  });
}
