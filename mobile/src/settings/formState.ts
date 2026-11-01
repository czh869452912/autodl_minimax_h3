import type {AppSettings} from './storage';
const identity=new Set<keyof AppSettings>(['llmConnectionId','llmConnectionRevision','llmSupportsImages']);
const connectionFields=new Set<keyof AppSettings>(['llmEndpoint','llmModel','llmApiKey']);
/** Refresh effective identity, preserving only preferences edited since the last read. */
export function mergeSettingsRefresh(current:AppSettings,baseline:AppSettings,saved:AppSettings):AppSettings{
 const next={...saved};
 for(const key of Object.keys(current) as (keyof AppSettings)[]){
  if(identity.has(key)||(connectionFields.has(key)&&(saved.llmConnectionId||baseline.llmConnectionId)))continue;
  if(current[key]!==baseline[key])Object.assign(next,{[key]:current[key]});
 }
 return next;
}
export function restoreSettingsDraft(current:AppSettings,draft:Partial<AppSettings>):AppSettings{
 const next={...current};for(const key of Object.keys(draft) as (keyof AppSettings)[]){if(identity.has(key)||(current.llmConnectionId&&connectionFields.has(key)))continue;Object.assign(next,{[key]:draft[key]});}return next;
}
