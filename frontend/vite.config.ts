import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { streamH3Graph } from './server/graph/h3Graph';
import { discoverH3Skill } from './server/skills/manifest';

function agentDevPlugin(): Plugin {
  return {
    name: 'agent-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/health' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, devMiddleware: true }));
          return;
        }

        if (req.url === '/api/agent/run' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const prompt = typeof body.prompt === 'string' ? body.prompt : '';
              const imgCount = Array.isArray(body.images) ? body.images.length : 0;
              const discoveredSkill = discoverH3Skill(imgCount);

              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');

              const send = (type: string, data: Record<string, unknown>) => {
                res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
              };

              let result: Record<string, any> = {};
              for await (const update of streamH3Graph(prompt, imgCount)) {
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
            } catch (err: any) {
              res.write(`event: error\ndata: ${JSON.stringify({ message: err.message || 'agent run failed' })}\n\n`);
              res.end();
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), agentDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        }
      }
    },
  };
});

