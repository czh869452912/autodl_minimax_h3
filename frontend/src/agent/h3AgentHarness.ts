export interface RunAgentHarnessOptions {
  apiKey: string;
  endpoint: string;
  modelName?: string;
  systemPrompt: string;
  userPrompt: string;
  images?: string[];
  maxSteps?: number;
  onStepProgress?: (stepName: string, detail?: string) => void;
}

/**
 * Standard Vercel AI SDK Agent Harness for MiniMax-H3.
 * Uses dynamic imports to keep browser component loading 100% lightweight and crash-safe.
 */
export const runH3AgentHarness = async (options: RunAgentHarnessOptions): Promise<string> => {
  const {
    apiKey,
    endpoint,
    modelName,
    systemPrompt,
    userPrompt,
    images,
    maxSteps = 4,
    onStepProgress
  } = options;

  // Dynamic import Vercel AI SDK to prevent top-level module load errors in WebViews
  const { createOpenAI } = await import('@ai-sdk/openai');
  const { generateText } = await import('ai');
  const {
    t2vaSkill,
    i2vaSkill,
    fl2vaSkill,
    ref2vaSkill,
    auditAndRefineSkill
  } = await import('../skills/h3Skills');

  let baseURL = (endpoint || '').trim();
  if (!baseURL) baseURL = 'https://api.minimax.chat/v1';
  baseURL = baseURL.replace(/\/+$/, '');
  if (baseURL.endsWith('/chat/completions')) {
    baseURL = baseURL.replace(/\/chat\/completions$/, '');
  } else if (baseURL.endsWith('/chatcompletion_v2')) {
    baseURL = baseURL.replace(/\/chatcompletion_v2$/, '');
  }

  const customOpenAI = createOpenAI({
    apiKey,
    baseURL
  });

  const model = customOpenAI(modelName || 'abab6.5s-chat');

  const tools = {
    t2vaSkill,
    i2vaSkill,
    fl2vaSkill,
    ref2vaSkill,
    auditAndRefineSkill
  };

  onStepProgress?.('Agent Harness 启动中', '准备匹配 H3 Skill 工具...');

  let currentMessages: any[] = [
    {
      role: 'user',
      content:
        images && images.length > 0
          ? [
              { type: 'text', text: userPrompt },
              ...images.map((imgUri) => ({ type: 'image', image: imgUri }))
            ]
          : userPrompt
    }
  ];

  let stepCount = 0;
  let finalOutput = '';

  while (stepCount < maxSteps) {
    stepCount++;
    const res = await generateText({
      model,
      system: systemPrompt,
      messages: currentMessages,
      tools
    });

    const { text, toolCalls, toolResults } = res as any;

    if (toolCalls && toolCalls.length > 0) {
      for (const call of toolCalls) {
        const toolName = call.toolName || call.name || 'H3 Skill Tool';
        const argsData = call.args || call.input || {};
        onStepProgress?.(
          `Step ${stepCount}: 触发 Skill [${toolName}]`,
          `参数: ${JSON.stringify(argsData).slice(0, 70)}...`
        );
      }

      currentMessages.push({ role: 'assistant', content: toolCalls });

      if (toolResults && toolResults.length > 0) {
        for (const tr of toolResults) {
          const resultStr = String(tr.result || tr.output || '');
          finalOutput = resultStr;
          currentMessages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: tr.toolCallId || tr.id,
                toolName: tr.toolName || tr.name,
                result: resultStr
              }
            ]
          });
        }
      }
    } else {
      if (text) finalOutput = text;
      break;
    }
  }

  onStepProgress?.('Agent Harness 审计校准完成', '呈献最终分镜 Prompt');
  return finalOutput || 'MiniMax-H3 Agent Harness 推演完成。';
};
