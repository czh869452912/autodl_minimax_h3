import express from 'express';
import cors from 'cors';
import { readServerConfig } from './config';
import { createH3CopilotRouter } from './copilotkit';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(createH3CopilotRouter(readServerConfig()));

app.get('/api/health', (_req, res) => {
  const config = readServerConfig();
  res.json({ ok: true, providerConfigured: Boolean(config.apiKey), model: config.model });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(Number(process.env.PORT || 8787), () => console.log('Agent backend listening on 8787'));
}

export default app;
