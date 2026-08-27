import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { discoverH3Skill } from '../skills/manifest';
import { validateH3Prompt } from '../skills/validator';

export const H3State = Annotation.Root({
  prompt: Annotation<string>,
  imageCount: Annotation<number>,
  skill: Annotation<string>,
  draft: Annotation<string>,
  validationErrors: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  evaluation: Annotation<string>,
  iteration: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  finalPrompt: Annotation<string>
});

function templateDraft(prompt: string, imageCount: number): string {
  const p = (prompt || 'cinematic visual development').trim();

  if (imageCount === 0) {
    // T2VA: Text-to-Video/Audio
    return `integrated_multimodal_description: [Shot 1] cinematic medium shot, dolly-in, 0.5m, slow, ${p}.\n[Shot 2] At 00:03.500, dynamic tracking shot, 2m, fast, transitioning into wide perspective.\n\noverall_soundscape: Ambient environmental acoustics, realistic footsteps and physical movement.\n\nnon_diegetic_music: Cinematic ambient music with subtle atmospheric tension.`;
  }

  if (imageCount === 1) {
    // I2VA: Image-to-Video/Audio (First Frame Anchor)
    return `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] Starting from <Picture 1> as keyframe anchor, slow pan-right, 0.3m, steady, extending ${p}.\n[Shot 2] At 00:03.500, smooth dolly-back, 1.2m, normal, revealing surrounding environment.\n\noverall_soundscape: Diegetic ambient sound matching the reference visual context.\n\nnon_diegetic_music: Subtle emotional orchestral background score.`;
  }

  if (imageCount === 2) {
    // FL2VA: First and Last Frame Interpolation
    return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 5.00-second mark of the target video.\n\nintegrated_multimodal_description: [Shot 1] Beginning from <Picture 1>, cinematic push-in, 0.8m, continuous motion smoothly evolving ${p}.\n[Shot 2] At 00:03.000, morphing tracking shot, 1.5m, smooth, landing continuously onto <Picture 2> at 5.00 seconds.\n\noverall_soundscape: Seamless ambient audio transition across timeframes.\n\nnon_diegetic_music: Evolving cinematic rhythm connecting first and last frames.`;
  }

  // Ref2VA (>= 3): Full reference 6-section rewrite
  return `subject_definitions:\n- <Picture 1> is the primary subject anchor\n- <Picture 2> is the style and lighting reference\n- <Picture 3> is secondary environmental asset\n\nsummary:\n[reference generation] ${p}\n\nretention_analysis:\nPreserve visual identity from <Picture 1> and color grading from <Picture 2>.\n\nintegrated_multimodal_description:\n[Shot 1] Establishing shot with <Picture 1> subject, pan-left, 1m, smooth.\n[Shot 2] At 00:03.500, tracking shot, 2m, fast, merging elements in high fidelity.\n\noverall_soundscape:\nLayered spatial sound effects and environmental resonance.\n\nnon_diegetic_music:\nFull dynamic cinematic soundtrack.`;
}

export function createH3Graph() {
  const graph = new StateGraph(H3State)
    .addNode('discover', (state) => ({ skill: discoverH3Skill(state.imageCount).name }))
    .addNode('generateDraft', (state) => ({ draft: templateDraft(state.prompt, state.imageCount) }))
    .addNode('validateDraft', (state) => ({ validationErrors: validateH3Prompt(state.draft).errors }))
    .addNode('evaluateDraft', (state) => ({ evaluation: state.validationErrors.length ? 'needs_refinement' : 'accepted' }))
    .addNode('refineDraft', (state) => ({
      draft: state.draft.replace('cinematic medium shot', 'cinematic controlled medium shot'),
      iteration: state.iteration + 1
    }))
    .addNode('finalizePrompt', (state) => ({ finalPrompt: state.draft }))
    .addEdge(START, 'discover')
    .addEdge('discover', 'generateDraft')
    .addEdge('generateDraft', 'validateDraft')
    .addEdge('validateDraft', 'evaluateDraft')
    .addConditionalEdges('evaluateDraft', (state) => state.evaluation === 'accepted' || state.iteration >= 2 ? 'finalizePrompt' : 'refineDraft')
    .addEdge('refineDraft', 'validateDraft')
    .addEdge('finalizePrompt', END);
  return graph.compile();
}

export async function runH3Graph(prompt: string, imageCount: number) {
  return createH3Graph().invoke({ prompt, imageCount, iteration: 0 });
}

export async function* streamH3Graph(prompt: string, imageCount: number) {
  const graph = createH3Graph();
  for await (const update of await graph.stream(
    { prompt, imageCount, iteration: 0 },
    { streamMode: 'updates' }
  )) {
    yield update as unknown as Record<string, unknown>;
  }
}
