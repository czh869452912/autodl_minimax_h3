import type {AppDatabase} from '../storage/appDatabase';
import {createWorkflowRegistry} from '../workflows/registry/repository';
import {strictActiveRecord} from '../workflows/registry/activeRecord';
import {registryRecordToDefinition} from '../workflows/registry/catalog';
import {createApplicationProviderRegistry} from '../providers/applicationRegistry';
import {NOVELAI_MODELS,NOVELAI_CAPABILITIES_VERSION} from './novelAiProtocol';

export type Capability={id:string;title:string;version:string;provider:string;adapter:string;operation:string;outputs:string[];inputs:Record<string,unknown>;models:string[];reasons:string[];configuration:'workflow'|'account';executionAllowed:false};
/** Installed declarations and local account state only; never probes or reads a secret. */
export async function readCapabilityCatalog(db:AppDatabase,afterId='',limit=20){
 const registry=createWorkflowRegistry(db),providers=createApplicationProviderRegistry(db);
 const pointers=await db.getAllAsync<{workflow_id:string}>('SELECT workflow_id FROM workflow_registry_active ORDER BY workflow_id');
 const ids=['novelai-image-basic',...pointers.map(p=>p.workflow_id)].filter((id,i,all)=>id>afterId&&all.indexOf(id)===i).sort();
 const selected=ids.slice(0,Math.max(1,Math.min(20,limit))),items:Capability[]=[];
 for(const id of selected){
  const reasons:string[]=[];
  let entry:Capability;
  if(id==='novelai-image-basic')entry={id,title:'NovelAI 图片',version:NOVELAI_CAPABILITIES_VERSION,provider:'novelai',adapter:'novelai-image',operation:'image.generate',outputs:['image'],inputs:{image:'可选底图/蒙版',prompt:'文本'},models:[...NOVELAI_MODELS],reasons,configuration:'account',executionAllowed:false};
  else {
   try{
    const record=await strictActiveRecord(registry,id);if(!record)throw Error('WORKFLOW_UNAVAILABLE');
    const definition=registryRecordToDefinition(record);
    let provider='unavailable';
    try{const registration=providers.registration(definition.platform.adapter);provider=registration.provider;
     if(!registration.manifest.operations.includes(definition.platform.operation))reasons.push('OPERATION_UNSUPPORTED');
     if(definition.compatibility?.requiredAdapterVersion&&definition.compatibility.requiredAdapterVersion!==registration.manifest.adapterVersion)reasons.push('ADAPTER_VERSION_MISMATCH');
    }catch{reasons.push('ADAPTER_UNAVAILABLE');}
    entry={id,title:definition.metadata.title,version:record.version,provider,adapter:definition.platform.adapter,operation:definition.platform.operation,outputs:definition.outputs.artifacts.map(a=>a.kind),inputs:definition.inputs,models:[],reasons,configuration:'workflow',executionAllowed:false};
   }catch{entry={id,title:id,version:'unknown',provider:'unavailable',adapter:'unavailable',operation:'unavailable',outputs:[],inputs:{},models:[],reasons:['WORKFLOW_INVALID'],configuration:'workflow',executionAllowed:false};}
  }
  if(!await db.getFirstAsync("SELECT d.provider_id FROM creative_default_accounts d JOIN creative_credential_generations g ON g.id=d.credential_generation_id WHERE d.provider_id=? AND g.status='active'",entry.provider))entry.reasons.push('ACCOUNT_NOT_BOUND');
  items.push(entry);
 }
 return {items,next:ids.length>selected.length?selected[selected.length-1]:undefined,remoteIdentityVerified:false,automaticFallback:false};
}
