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
  const anchor = imageCount === 1 ? 'For the target video, at 0.00 seconds, Picture 1 is fully referenced.\n\n' : '';
  const end = imageCount === 2 ? ' Picture 2 aligns with the 5.00-second mark.' : '';
  return `${anchor}integrated_multimodal_description: [Shot 1] cinematic medium shot, dolly-in, 0.5m, slow, ${prompt}.${end}\n[Shot 2] At 00:03.500, tracking shot, 2m, fast.\n\noverall_soundscape: Ambient environmental sound and physical action detail.\n\nnon_diegetic_music: Cinematic ambient music with subtle tension.`;
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
