import {useEffect,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {readPromptChunks,savePromptChunks} from './promptChunkStore';
import {expandPromptChunks,mergePromptChunks,type PromptChunk} from './promptChunks';
import {TextAction,SegmentedChoices} from './WorkbenchUI';
import {creativeUI as s} from './creativeUI';
import type {NovelAiDraftInput} from './novelAiProtocol';
export function PromptChunkLibrary({input,update,editable,setTab}:{input:NovelAiDraftInput;update:(patch:Partial<NovelAiDraftInput>)=>void;editable:boolean;setTab:(tab:string)=>void}){
 const [saved,setSaved]=useState<PromptChunk[]>([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
 const [name,setName]=useState(''),[text,setText]=useState(''),[editing,setEditing]=useState<string>(),[target,setTarget]=useState('prompt');
 useEffect(()=>{let live=true;readPromptChunks().then(rows=>{if(live){setSaved(rows);setReady(true);}}).catch(()=>{if(live)setError('片段库读取失败，请关闭后重试');});return()=>{live=false;};},[]);
 const all=mergePromptChunks(saved,input.chunks);
 const persist=async(rows:PromptChunk[])=>{setBusy(true);setError('');try{await savePromptChunks(rows);setSaved(rows);return true;}catch{setError('片段保存失败，输入已保留');return false;}finally{setBusy(false);}};
 const insert=(chunk:PromptChunk)=>{try{if(all.length>50)throw new Error('本次引用的片段不能超过50个');expandPromptChunks(`!macro:${chunk.name}!`,all);const token=`!macro:${chunk.name}!`;
 if(target==='prompt'||target==='negative')update({chunks:all,[target]:[input[target],token].filter(Boolean).join(', ')});
 else {const [index,kind]=target.split(':');update({chunks:all,characters:input.characters.map((c,i)=>i===Number(index)?{...c,[kind]:[c[kind as 'prompt'|'negative'],token].filter(Boolean).join(', ')}:c)});}
 setTab(target==='negative'?'negative':'prompt');}catch(e){setError((e as Error).message);}};
 return <View style={{gap:8}}><Text style={s.muted}>保存到本机片段库，可跨草稿复用。引用随草稿保存，生成时展开；不与 NovelAI 云端同步。</Text>
 <TextInput accessibilityLabel="搜索提示词片段" placeholder="搜索名称或内容" value={query} onChangeText={setQuery} style={s.input}/>
 <SegmentedChoices label="片段插入位置" options={[{id:'prompt',label:'正向'},{id:'negative',label:'负面'},...input.characters.flatMap((_,i)=>[{id:`${i}:prompt`,label:`角色${i+1}正向`},{id:`${i}:negative`,label:`角色${i+1}负面`}])]} value={target} onChange={setTarget}/>
 {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
 {all.filter(c=>`${c.name} ${c.text}`.toLowerCase().includes(query.toLowerCase())).map(c=><View key={c.name} style={s.card}><Text style={s.title}>{c.name}</Text><Text selectable style={s.body}>{c.text}</Text><View style={s.row}>
 <TextAction label={`插入${c.name}`} disabled={!editable||busy} onPress={()=>insert(c)}/><TextAction label={`编辑${c.name}`} disabled={!editable||busy} onPress={()=>{setEditing(c.name);setName(c.name);setText(c.text);}}/>
 <TextAction label={`从本机库移除${c.name}`} disabled={!ready||busy||!saved.some(v=>v.name===c.name)} onPress={()=>{try{const rows=saved.filter(v=>v.name!==c.name);for(const row of rows)expandPromptChunks(`!macro:${row.name}!`,rows);void persist(rows);}catch{setError('其他已保存片段仍引用此片段，请先修改引用');}}}/></View>{input.chunks.some(v=>v.name===c.name)?<Text style={s.muted}>当前草稿已保留此片段；移出库不会破坏已有引用。</Text>:null}</View>)}
 {!all.length?<Text style={s.muted}>还没有片段。保存常用风格、角色或构图后即可插入。</Text>:null}
 <Text style={s.title}>{editing?'编辑片段':'新建片段'}</Text>
 <TextInput accessibilityLabel="片段名称" placeholder="名称（区分大小写）" value={name} maxLength={80} onChangeText={setName} editable={editable&&!busy&&!editing} style={s.input}/>
 <TextInput accessibilityLabel="片段内容" placeholder="提示词；可使用 !macro:名称! 嵌套引用" value={text} maxLength={10000} onChangeText={setText} editable={editable&&!busy} multiline style={[s.input,{minHeight:100,textAlignVertical:'top'}]}/>
 <TextAction label="从当前正向提示词填入" disabled={!editable||busy} onPress={()=>setText(input.prompt)}/>
 <TextAction label="保存到本机片段库" disabled={!editable||!ready||busy||!name.trim()||!text.trim()} onPress={()=>void(async()=>{try{const n=name.trim();if(/[!\r\n]/.test(n))throw new Error('名称不能包含感叹号或换行');if(n!==editing&&all.some(c=>c.name===n))throw new Error('片段名称已存在，请编辑原片段或换一个名称');const chunk={name:n,text};const rows=[...saved.filter(c=>c.name!==editing&&c.name!==n),chunk];if(mergePromptChunks(input.chunks,[chunk]).length>50)throw new Error('当前草稿片段已达50个');if(rows.length>50)throw new Error('本机片段库最多50个');for(const row of rows)expandPromptChunks(`!macro:${row.name}!`,rows);if(await persist(rows)){update({chunks:mergePromptChunks(input.chunks,[chunk])});setName('');setText('');setEditing(undefined);}}catch(e){setError((e as Error).message);}})()}/>
 {editing?<TextAction label="取消编辑片段" onPress={()=>{setEditing(undefined);setName('');setText('');}}/>:null}
 </View>;
}
