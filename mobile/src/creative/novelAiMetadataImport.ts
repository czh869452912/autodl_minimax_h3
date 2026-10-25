import {novelAiDraftInput,type NovelAiDraftInput} from './novelAiProtocol';
import {QUALITY_PRESETS,NEGATIVE_PRESETS,qualitySuffix,negativePrefix} from './novelAiPresets';
export type MetadataSelection={prompt:boolean;negative:boolean;characters:boolean;append:boolean;settings:boolean;seed:boolean;clean:boolean};
export const defaultMetadataSelection:MetadataSelection={prompt:true,negative:true,characters:true,append:false,settings:false,seed:false,clean:false};
export function metadataImportPatch(current:NovelAiDraftInput,recovered:NovelAiDraftInput,selection:MetadataSelection){
  const patch:Partial<NovelAiDraftInput>={};
  let prompt=recovered.prompt,negative=recovered.negative;
  if(selection.clean){
    for(const preset of QUALITY_PRESETS){const suffix=qualitySuffix(recovered.model,preset);if(suffix&&prompt.endsWith(suffix))prompt=prompt.slice(0,-suffix.length).replace(/[,\s]+$/,'');}
    for(const preset of NEGATIVE_PRESETS){const prefix=negativePrefix(recovered.model,preset);if(prefix&&negative.startsWith(prefix))negative=negative.slice(prefix.length).replace(/^[,\s]+/,'');}
  }
  if(selection.prompt)Object.assign(patch,{prompt,qualityPreset:'none',autoText:false});
  if(selection.negative)Object.assign(patch,{negative,negativePreset:'none'});
  if(selection.characters)Object.assign(patch,{characters:selection.append?[...current.characters,...recovered.characters]:recovered.characters,useCoordinates:recovered.useCoordinates});
  if(selection.settings){
    const keys=['model','effort','width','height','steps','sampler','noiseSchedule','guidance','rescale','samples','transparent','straightAlpha'] as const;
    for(const key of keys)Object.assign(patch,{[key]:recovered[key]});
  }
  if(selection.seed)patch.seed=recovered.seed;
  const parsed=novelAiDraftInput.safeParse({...current,...patch});
  if(!parsed.success)throw new Error(parsed.error.issues.map(i=>i.message).join('；'));
  return patch;
}
