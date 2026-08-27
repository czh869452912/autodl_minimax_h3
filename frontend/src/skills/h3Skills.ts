import { tool } from 'ai';
import { z } from 'zod';

/**
 * Official MiniMax-H3 Skill Definitions for Vercel AI SDK Agent Harness.
 * Each tool provides specific directives and schema guidelines from GitHub MiniMax-AI/MiniMax-H3.
 */

export const t2vaSkill = tool({
  description: 'T2VA (Text-to-Video/Audio) Skill: Pure text video and diegetic/non-diegetic audio timeline generator. Use when no reference image is provided.',
  parameters: z.object({
    concept: z.string().describe('Core visual concept and mood'),
    shots: z.array(
      z.object({
        shotIndex: z.number().describe('Shot number starting from 1'),
        cutTimestamp: z.string().optional().describe('Cut timestamp e.g. At 00:03.500 (omitted for Shot 1)'),
        visualDescription: z.string().describe('Composition, visual style, subject motion, camera motion triple (type, amplitude, speed)'),
      })
    ),
    diegeticSoundscape: z.string().describe('overall_soundscape: Ambient and physical action sound in the scene'),
    nonDiegeticMusic: z.string().describe('non_diegetic_music: Audience background music')
  }),
  execute: async ({ concept, shots, diegeticSoundscape, nonDiegeticMusic }) => {
    let shotText = '';
    shots.forEach((s) => {
      if (s.shotIndex === 1) {
        shotText += `[Shot 1] ${s.visualDescription} `;
      } else {
        const timestamp = s.cutTimestamp || `At 00:0${s.shotIndex * 3}.000`;
        shotText += `[Shot ${s.shotIndex}] ${timestamp}, ${s.visualDescription} `;
      }
    });

    return `integrated_multimodal_description: ${shotText.trim()}

overall_soundscape: ${diegeticSoundscape}

non_diegetic_music: ${nonDiegeticMusic}`;
  }
});

export const i2vaSkill = tool({
  description: 'I2VA (Image-to-Video/Audio) Skill: First-frame reference anchor and forward action development generator. Use when 1 reference image is attached.',
  parameters: z.object({
    pictureRef: z.string().default('Picture 1').describe('Reference image label'),
    forwardDevelopment: z.string().describe('Visual action and scene development extending forward from Picture 1'),
    overallSoundscape: z.string().describe('Diegetic ambient sound'),
    nonDiegeticMusic: z.string().describe('Audience background music')
  }),
  execute: async ({ pictureRef, forwardDevelopment, overallSoundscape, nonDiegeticMusic }) => {
    return `For the target video, at 0.00 seconds into the target video, <${pictureRef}> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] Starting from <${pictureRef}> as the keyframe anchor, ${forwardDevelopment}

overall_soundscape: ${overallSoundscape}

non_diegetic_music: ${nonDiegeticMusic}`;
  }
});

export const fl2vaSkill = tool({
  description: 'FL2VA (First & Last Frame) Skill: Interpolation path generator between Picture 1 (first frame) and Picture 2 (last frame). Use when 2 reference images are attached.',
  parameters: z.object({
    effectiveDuration: z.string().default('5.00').describe('Video duration in seconds e.g. 5.00'),
    transitionPath: z.string().describe('Continuous visual, pose, object, and camera transition path from Picture 1 to Picture 2'),
    overallSoundscape: z.string().describe('Diegetic ambient sound'),
    nonDiegeticMusic: z.string().describe('Audience background music')
  }),
  execute: async ({ effectiveDuration, transitionPath, overallSoundscape, nonDiegeticMusic }) => {
    return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the ${effectiveDuration}-second mark of the target video.

integrated_multimodal_description: [Shot 1] Beginning from Picture 1, ${transitionPath} landing continuously onto Picture 2 at ${effectiveDuration} seconds.

overall_soundscape: ${overallSoundscape}

non_diegetic_music: ${nonDiegeticMusic}`;
  }
});

export const ref2vaSkill = tool({
  description: 'Ref2VA (Full-Reference Mode) Skill: Official 6-Section rewrite format for multi-subject, multi-style, audio, or storyboard assets.',
  parameters: z.object({
    subjectDefinitions: z.array(z.string()).describe('List of subject definitions e.g. <Subject 1> is ..., <Picture 1> is ...'),
    summaryText: z.string().describe('Single paragraph summary with [reference generation] prefix'),
    retentionAnalysis: z.string().describe('How subjects/styles/audio are preserved or transferred'),
    detailedDescription: z.string().describe('Multimodal shot timeline description [Shot 1] ... [Shot 2] At ...'),
    overallSoundscape: z.string().describe('Ambient and physical action sounds'),
    nonDiegeticMusic: z.string().describe('Audience background music')
  }),
  execute: async ({
    subjectDefinitions,
    summaryText,
    retentionAnalysis,
    detailedDescription,
    overallSoundscape,
    nonDiegeticMusic
  }) => {
    const subjects = subjectDefinitions.map((s) => `- ${s}`).join('\n');
    return `subject_definitions:
${subjects}

summary:
[reference generation] ${summaryText}

retention_analysis:
${retentionAnalysis}

detailed_description:
${detailedDescription}

overall_soundscape:
${overallSoundscape}

non_diegetic_music:
${nonDiegeticMusic}`;
  }
});

export const auditAndRefineSkill = tool({
  description: 'Self-Refine Audit Skill: Evaluates and polishes candidate H3 prompt against strict official syntax rules (cut timecodes, camera motion triples, soundscape separation, reference alignment headers).',
  parameters: z.object({
    draftPrompt: z.string().describe('The candidate H3 prompt draft'),
    auditNotes: z.string().describe('Notes on format checks, camera language enhancement, or timecode precision fixes'),
    finalPrompt: z.string().describe('The polished, production-ready MiniMax-H3 prompt')
  }),
  execute: async ({ draftPrompt, auditNotes, finalPrompt }) => {
    return `🎯 [H3 Agent Harness Audit Certified]

${finalPrompt}

---
💡 *Audit Notes*: ${auditNotes}`;
  }
});
