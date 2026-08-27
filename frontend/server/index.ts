import express from 'express';
import cors from 'cors';
import { streamH3Graph } from './graph/h3Graph';
import { discoverH3Skill } from './skills/manifest';
import { readServerConfig } from './config';
import { AgentRunRequest } from './types';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  const config = readServerConfig();
  res.json({ ok: true, providerConfigured: Boolean(config.apiKey), model: config.model });
});

app.post('/api/agent/run', async (req, res) => {
  const body = req.body as AgentRunRequest;
  if (!body || typeof body.prompt !== 'string') return res.status(400).json({ error: 'prompt is required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (type: string, data: Record<string, unknown>) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const imgCount = Array.isArray(body.images) ? body.images.length : 0;
    const discoveredSkill = discoverH3Skill(imgCount);
    let result: Record<string, any> = {};

    for await (const update of streamH3Graph(body.prompt, imgCount)) {
      const [node, state] = Object.entries(update)[0] || [];
      if (!state) continue;
      result = { ...result, ...(state as Record<string, unknown>) };
      if (node === 'discover') {
        send('skill-discovered', {
          skill: result.skill || discoveredSkill.name,
          description: discoveredSkill.description,
          imageCount: imgCount
        });
      }
      if (node === 'generateDraft') {
        send('draft', { draft: result.draft });
      }
      if (node === 'validateDraft') {
        send('validation', {
          errors: result.validationErrors || [],
          valid: (result.validationErrors || []).length === 0
        });
      }
      if (node === 'evaluateDraft') {
        send('evaluation', {
          result: result.evaluation,
          iteration: result.iteration || 0
        });
      }
      if (node === 'refineDraft') {
        send('refinement', {
          draft: result.draft,
          iteration: result.iteration
        });
      }
      if (node === 'finalizePrompt') {
        send('final', { prompt: result.finalPrompt });
      }
    }
    res.end();
  } catch (error) {
    send('error', { message: error instanceof Error ? error.message : 'agent run failed' });
    res.end();
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(Number(process.env.PORT || 8787), () => console.log('Agent backend listening on 8787'));
}

export default app;
