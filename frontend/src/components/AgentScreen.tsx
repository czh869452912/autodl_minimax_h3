import React from 'react';
import { H3PromptResult } from './H3PromptResult';
import type { AppSettings } from '../types';

interface AgentScreenProps {
  onApplyPrompt: (prompt: string) => void;
  llmConfig: Pick<AppSettings, 'llmApiKey' | 'llmEndpoint' | 'llmModel'>;
}

export const AgentScreen: React.FC<AgentScreenProps> = ({ onApplyPrompt, llmConfig }) => (
  <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 pb-28 pt-24 md:px-8">
    <div>
      <h1 className="text-2xl font-bold text-slate-100">Prompt 助手</h1>
      <p className="text-sm text-slate-400">Deep Agents 自主选择官方 MiniMax H3 skills，并通过多轮调用迭代提示词</p>
    </div>
    <H3PromptResult onApplyPrompt={onApplyPrompt} llmConfig={llmConfig} />
  </main>
);
