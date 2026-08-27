import"./index-scr-kKK1.js";import{am as c,r as a,a3 as e,$ as u,a1 as m}from"./index-Cbfdmtbo.js";const g=c({description:"T2VA (Text-to-Video/Audio) Skill: Pure text video and diegetic/non-diegetic audio timeline generator. Use when no reference image is provided.",parameters:a({concept:e().describe("Core visual concept and mood"),shots:u(a({shotIndex:m().describe("Shot number starting from 1"),cutTimestamp:e().optional().describe("Cut timestamp e.g. At 00:03.500 (omitted for Shot 1)"),visualDescription:e().describe("Composition, visual style, subject motion, camera motion triple (type, amplitude, speed)")})),diegeticSoundscape:e().describe("overall_soundscape: Ambient and physical action sound in the scene"),nonDiegeticMusic:e().describe("non_diegetic_music: Audience background music")}),execute:async({concept:i,shots:t,diegeticSoundscape:n,nonDiegeticMusic:o})=>{let s="";return Array.isArray(t)&&t.forEach(r=>{if(r.shotIndex===1)s+=`[Shot 1] ${r.visualDescription} `;else{const d=r.cutTimestamp||`At 00:0${r.shotIndex*3}.000`;s+=`[Shot ${r.shotIndex}] ${d}, ${r.visualDescription} `}}),`integrated_multimodal_description: ${s.trim()||i}

overall_soundscape: ${n}

non_diegetic_music: ${o}`}}),h=c({description:"I2VA (Image-to-Video/Audio) Skill: First-frame reference anchor and forward action development generator. Use when 1 reference image is attached.",parameters:a({pictureRef:e().default("Picture 1").describe("Reference image label"),forwardDevelopment:e().describe("Visual action and scene development extending forward from Picture 1"),overallSoundscape:e().describe("Diegetic ambient sound"),nonDiegeticMusic:e().describe("Audience background music")}),execute:async({pictureRef:i="Picture 1",forwardDevelopment:t,overallSoundscape:n,nonDiegeticMusic:o})=>`For the target video, at 0.00 seconds into the target video, <${i}> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] Starting from <${i}> as the keyframe anchor, ${t}

overall_soundscape: ${n}

non_diegetic_music: ${o}`}),b=c({description:"FL2VA (First & Last Frame) Skill: Interpolation path generator between Picture 1 (first frame) and Picture 2 (last frame). Use when 2 reference images are attached.",parameters:a({effectiveDuration:e().default("5.00").describe("Video duration in seconds e.g. 5.00"),transitionPath:e().describe("Continuous visual, pose, object, and camera transition path from Picture 1 to Picture 2"),overallSoundscape:e().describe("Diegetic ambient sound"),nonDiegeticMusic:e().describe("Audience background music")}),execute:async({effectiveDuration:i="5.00",transitionPath:t,overallSoundscape:n,nonDiegeticMusic:o})=>`How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the ${i}-second mark of the target video.

integrated_multimodal_description: [Shot 1] Beginning from Picture 1, ${t} landing continuously onto Picture 2 at ${i} seconds.

overall_soundscape: ${n}

non_diegetic_music: ${o}`}),v=c({description:"Ref2VA (Full-Reference Mode) Skill: Official 6-Section rewrite format for multi-subject, multi-style, audio, or storyboard assets.",parameters:a({subjectDefinitions:u(e()).describe("List of subject definitions e.g. <Subject 1> is ..., <Picture 1> is ..."),summaryText:e().describe("Single paragraph summary with [reference generation] prefix"),retentionAnalysis:e().describe("How subjects/styles/audio are preserved or transferred"),detailedDescription:e().describe("Multimodal shot timeline description [Shot 1] ... [Shot 2] At ..."),overallSoundscape:e().describe("Ambient and physical action sounds"),nonDiegeticMusic:e().describe("Audience background music")}),execute:async({subjectDefinitions:i=[],summaryText:t,retentionAnalysis:n,detailedDescription:o,overallSoundscape:s,nonDiegeticMusic:r})=>`subject_definitions:
${Array.isArray(i)?i.map(l=>`- ${l}`).join(`
`):""}

summary:
[reference generation] ${t}

retention_analysis:
${n}

detailed_description:
${o}

overall_soundscape:
${s}

non_diegetic_music:
${r}`}),S=c({description:"Self-Refine Audit Skill: Evaluates and polishes candidate H3 prompt against strict official syntax rules (cut timecodes, camera motion triples, soundscape separation, reference alignment headers).",parameters:a({draftPrompt:e().describe("The candidate H3 prompt draft"),auditNotes:e().describe("Notes on format checks, camera language enhancement, or timecode precision fixes"),finalPrompt:e().describe("The polished, production-ready MiniMax-H3 prompt")}),execute:async({auditNotes:i,finalPrompt:t})=>`🎯 [H3 Agent Harness Audit Certified]

${t}

---
💡 *Audit Notes*: ${i}`});export{S as auditAndRefineSkill,b as fl2vaSkill,h as i2vaSkill,v as ref2vaSkill,g as t2vaSkill};
