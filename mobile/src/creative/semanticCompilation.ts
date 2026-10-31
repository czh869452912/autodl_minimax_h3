import type {AppDatabase} from '../storage/appDatabase';
import {readShotSemantics} from './semanticResources';
import {readSemanticReferences} from './semanticDependencies';
import {applyDraftCommand} from './drafts';
export type SemanticPreparation={projectId:string;shotId:string;expectedShotRevision:number;prompt:string;textVersions:string[];referenceVersions:string[]};
export async function compileSemanticVideo(tx:AppDatabase,p:SemanticPreparation,now:number,makeId:()=>string){
 if(!await tx.getFirstAsync('SELECT id FROM creative_shots WHERE id=? AND project_id=? AND revision=? AND deleted_at IS NULL',p.shotId,p.projectId,p.expectedShotRevision))throw new Error('SHOT_REVISION_CONFLICT');
 const bindings=await readShotSemantics(tx,p.shotId,p.projectId);
 if(new Set(p.textVersions).size!==p.textVersions.length||new Set(p.referenceVersions).size!==p.referenceVersions.length)throw new Error('DUPLICATE_SEMANTIC_SELECTION');
 const texts=p.textVersions.map(id=>{const item=bindings.find(b=>b.version_id===id);if(!item)throw new Error('SEMANTIC_VERSION_NOT_BOUND');return item;});
 const references=(await Promise.all(bindings.map(b=>readSemanticReferences(tx,b.version_id,p.projectId)))).flat();
 const chosen=p.referenceVersions.map(id=>{const ref=references.find(r=>r.asset_version_id===id);if(!ref||ref.unavailable_reason)throw new Error('SEMANTIC_REFERENCE_UNAVAILABLE');return ref;});
 const image=await tx.getFirstAsync<{version_id:string}>("SELECT version_id FROM creative_shot_assets WHERE shot_id=? AND slot='selected_image'",p.shotId);
 const images=[...new Set([...(image?[image.version_id]:[]),...chosen.filter(r=>r.kind==='image').map(r=>r.asset_version_id)])];
 const audios=chosen.filter(r=>r.kind==='audio').map(r=>r.asset_version_id);
 if(images.length>9||audios.length>3)throw new Error('SEMANTIC_MEDIA_LIMIT');
 const prompt=[p.prompt,...texts.map(t=>`[${t.kind}: ${t.title} / ${t.version_id}]\n${t.content}`)].join('\n\n');
 if(prompt.length>10000)throw new Error('COMPILED_PROMPT_TOO_LONG');
 return applyDraftCommand(tx,'draft.createVideo',{projectId:p.projectId,shotId:p.shotId,prompt,imageVersionIds:images,audioVersionIds:audios,semanticUsage:{textVersions:p.textVersions,referenceVersions:p.referenceVersions,initialPrompt:prompt}},now,makeId);
}
