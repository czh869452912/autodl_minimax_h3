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
 * Uses AI SDK native multi-step tool execution loop (maxSteps) with ModelMessage compliant formatting.
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

  const { createOpenAI } = await import('@ai-sdk/openai');
  const { generateText, stepCountIs } = await import('ai');
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

  onStepProgress?.('Agent Harness 启动中', '选择适配的 H3 Skill 工具库...');

  // Build standard CoreMessage payload for Vercel AI SDK
  const initialMessage: any = {
    role: 'user',
    content:
      images && images.length > 0
        ? [
            { type: 'text', text: userPrompt },
            ...images.map((imgUri) => {
              try {
                return { type: 'image', image: new URL(imgUri) };
              } catch {
                return { type: 'image', image: imgUri };
              }
            })
          ]
        : userPrompt
  };

  try {
    // Execute native multi-step Tool Calling loop in Vercel AI SDK
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [initialMessage],
      tools,
      stopWhen: stepCountIs(maxSteps),
      onStepFinish({ text, toolCalls, toolResults }) {
        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach((call: any) => {
            const name = call.toolName || call.name || 'H3 Skill Tool';
            const args = call.args || call.input || {};
            onStepProgress?.(
              `Agent 触发 Skill [${name}]`,
              `参数: ${JSON.stringify(args).slice(0, 70)}...`
            );
          });
        } else if (text) {
          onStepProgress?.('Agent 完成推演与 Audit 重构', '准备呈献最终分镜 Prompt');
        }
      }
    });

    let output = result.text;
    if (!output && result.steps && result.steps.length > 0) {
      for (let i = result.steps.length - 1; i >= 0; i--) {
        const step = result.steps[i];
        if (step.toolResults && step.toolResults.length > 0) {
          const lastRes = step.toolResults[step.toolResults.length - 1];
          output = String(lastRes.output || '');
          if (output) break;
        }
      }
    }

    return output || 'MiniMax-H3 Agent Harness 推演完成。';
  } catch (err: any) {
    console.error('Agent Harness execution error:', err);
    throw err;
  }
};
