import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { h3SkillManifest } from '../skills/manifest';

export function createH3McpServer() {
  const server = new McpServer({ name: 'minimax-h3-skills', version: '0.1.0' });
  for (const skill of h3SkillManifest) {
    server.registerTool(
      `h3_${skill.name}`,
      {
        title: skill.name,
        description: skill.description,
        inputSchema: { prompt: z.string(), imageCount: z.number().int().min(0).max(9) }
      },
      async ({ prompt, imageCount }) => ({
        content: [{ type: 'text', text: JSON.stringify({ skill: skill.name, prompt, imageCount }) }]
      })
    );
  }
  return server;
}
