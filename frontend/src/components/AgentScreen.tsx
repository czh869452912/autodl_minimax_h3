import React from 'react';
import { H3PromptResult } from './H3PromptResult';
import type { AppSettings } from '../types';

interface AgentScreenProps {
  onApplyPrompt: (prompt: string) => void;
  llmConfig: Pick<AppSettings, 'llmApiKey' | 'llmEndpoint' | 'llmModel'>;
}

export const AgentScreen: React.FC<AgentScreenProps> = ({ onApplyPrompt, llmConfig }) => (
  <main className="h-[100dvh] min-h-0 bg-slate-950 px-0 pb-[5.5rem] pt-16 md:pb-0">
    <H3PromptResult onApplyPrompt={onApplyPrompt} llmConfig={llmConfig} />
  </main>
);
