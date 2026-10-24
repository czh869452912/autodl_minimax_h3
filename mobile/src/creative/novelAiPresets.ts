// Model presets checked against NovelAI's public client 32f2478.
export const QUALITY_PRESETS = ['none', 'standard', 'light'] as const;
export const NEGATIVE_PRESETS = ['none', 'heavy', 'light', 'humanFocus', 'furryFocus'] as const;
export type QualityPreset = typeof QUALITY_PRESETS[number];
export type NegativePreset = typeof NEGATIVE_PRESETS[number];
const heavy = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
const furry = '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic';
export const presetNames = { none: '不添加', standard: '标准', heavy: '重度', light: '轻度', humanFocus: '人物', furryFocus: '兽人' };
export function qualitySuffix(model: string, preset: QualityPreset) {
  if (preset === 'none') return '';
  if (preset === 'light') return 'very aesthetic, amazing quality, no text';
  return model === 'nai-diffusion-4-5-curated' ? 'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general' : 'very aesthetic, masterpiece, no text';
}
export function negativePrefix(model: string, preset: NegativePreset) {
  if (preset === 'none') return '';
  if (model === 'nai-diffusion-4-5-curated') {
    if (preset === 'light') return 'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page';
    if (preset === 'humanFocus') return 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page';
    return 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page';
  }
  if (preset === 'furryFocus') return furry;
  if (preset === 'humanFocus') return `${heavy}, @_@, mismatched pupils, glowing eyes, bad anatomy`;
  if (preset === 'light') return model.startsWith('nai-diffusion-5') ? 'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::' : 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page';
  return heavy;
}
export const presetHint = { none: 0, standard: 1, heavy: 2, light: 3, humanFocus: 4, furryFocus: 5 };

/** A single bar mixes prompts; bars inside ||random choices|| belong to the choice. */
export function splitPromptMix(prompt: string) {
  const result: string[]=[]; let start=0, inChoice=false;
  for(let i=0;i<prompt.length;i++){
    if(prompt.slice(i,i+2)==='||'){inChoice=!inChoice;i++;}
    else if(prompt[i]==='|' && !inChoice && result.length<5){result.push(prompt.slice(start,i));start=i+1;}
  }
  result.push(prompt.slice(start));return result;
}

function quotedText(source: string) {
  const quotes:Record<string,string>={'"':'"','“':'”','「':'」',"'":"'",'‘':'’'}, result:string[]=[];
  for(let i=0;i<source.length;i++){
    const end=quotes[source[i]];if(!end || (source[i]==="'" && i>0 && !/[\s,.]/.test(source[i-1])))continue;
    let j=i+1;const single=end==="'" || end==='’';
    while(j<source.length && (source[j]!==end || single && /[\p{L}\p{N}]/u.test(source[j+1]??'')))j++;
    if(j===source.length)continue;const text=source.slice(i+1,j).trim();if(text)result.push(text);i=j;
  }
  return result;
}

function coordinateOrder<T extends {x:number;y:number}>(items: readonly T[]):T[] {
  if(items.length<=1)return [...items];const sorted=[...items].sort((a,b)=>a.y-b.y);
  let split=1,gap=-1;
  for(let i=1;i<sorted.length;i++){const distance=sorted[i].y-sorted[i-1].y;if(distance>gap){gap=distance;split=i;}}
  if(sorted.at(-1)!.y-sorted[0].y<=0.15 && gap<=0.1)return sorted.sort((a,b)=>a.x-b.x);
  return [...coordinateOrder(sorted.slice(0,split)),...coordinateOrder(sorted.slice(split))];
}

/** Preserve explicit text blocks. Quote extraction adds a block only when absent. */
export function addAutoText(prompt: string, characters: ReadonlyArray<{ prompt: string; x: number; y: number }>, useCoordinates: boolean) {
  const marker = /(?:^|[\s,.:\[\]{}、。])text:(?!:)/i;
  if (marker.test(prompt) || characters.some(c => marker.test(c.prompt))) return prompt;
  const ordered = useCoordinates ? coordinateOrder(characters) : characters;
  const mixes=splitPromptMix(prompt);
  const groups = [mixes[0], ...ordered.map(c => c.prompt)].map(quotedText);
  const joined = groups.flat().join('');
  if (joined && (joined.match(/[\u3000-\u30ff\uff00-\uff9f\u3400-\u9fff]/g)?.length ?? 0) / joined.length > 0.3) groups.forEach(group => group.reverse());
  const lines = groups.flat();
  if(!lines.length)return prompt;
  mixes[0]=`${mixes[0].replace(/[\s,]+$/, '')}, teXt: ${lines.join('\n\n')}`;
  return mixes.join('|');
}
