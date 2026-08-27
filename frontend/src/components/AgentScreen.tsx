import React from 'react';
import { AssistantChatSurface } from './AssistantChatSurface';

interface AgentScreenProps { onApplyPrompt: (prompt: string) => void; }

export const AgentScreen: React.FC<AgentScreenProps> = ({ onApplyPrompt }) => (
  <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 pb-28 pt-24 md:px-8">
    <div>
      <h1 className="text-2xl font-bold text-slate-100">Prompt 助手</h1>
      <p className="text-sm text-slate-400">LangGraph 状态图工作流 · 多模态分镜路由 · 流式轨迹推演</p>
    </div>
    <AssistantChatSurface onApplyPrompt={onApplyPrompt} />
  </main>
);
