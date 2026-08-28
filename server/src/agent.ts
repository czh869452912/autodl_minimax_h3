import path from 'node:path';
import { ChatOpenAI } from '@langchain/openai';
import { createDeepAgent, FilesystemBackend } from 'deepagents/node';
import type { ServerConfig } from './config.js';

export const AGENT_ID = 'h3-prompt-assistant';

const SYSTEM_PROMPT = [
  'You are the MiniMax H3 Prompt Assistant.',
  'Use the official H3 skills directory before drafting or revising a prompt.',
  'Read complete matching SKILL.md and referenced files through the filesystem tools.',
  'Use real tool calls for filesystem and workflow operations; never claim a tool ran when it did not.',
  'Return a final H3 prompt with integrated_multimodal_description clearly labeled.',
].join(' ');

export function createH3Model(config: ServerConfig) {
  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    temperature: 0.3,
    configuration: { baseURL: config.endpoint },
  });
}

export function createH3Agent(config: ServerConfig): any {
  const skillsParent = path.dirname(config.skillsRoot);
  return createDeepAgent({
    name: AGENT_ID,
    model: createH3Model(config),
    backend: new FilesystemBackend({ rootDir: skillsParent, virtualMode: true }),
    skills: ['/minimax-h3/'],
    systemPrompt: SYSTEM_PROMPT,
    checkpointer: true,
  });
}
