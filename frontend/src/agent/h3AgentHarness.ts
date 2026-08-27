import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import {
  t2vaSkill,
  i2vaSkill,
  fl2vaSkill,
  ref2vaSkill,
  auditAndRefineSkill
} from '../skills/h3Skills';

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
 * Autonomously selects H3 skills based on tool descriptions and executes multi-step tool calls up to maxSteps.
 */
export const runH3AgentHarness = async (options: RunAgentHarnessOptions): Promise<string> => {
  const {
    apiKey,
    endpoint,
    modelName,
    systemPrompt,
    userPrompt,
    images,
    maxSteps = 5,
    onStepProgress
  } = options;

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

  // Build message content payload with vision support
  let contentPayload: any = userPrompt;
  if (images && images.length > 0) {
    const arr: any[] = [{ type: 'text', text: userPrompt }];
    images.forEach((imgUri) => {
      arr.push({ type: 'image', image: imgUri });
    });
    contentPayload = arr;
  }

  const tools = {
    t2vaSkill,
    i2vaSkill,
    fl2vaSkill,
    ref2vaSkill,
    auditAndRefineSkill
  };

  onStepProgress?.('Agent Harness 启动中', '选择适配的 H3 Skill 工具库...');

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: contentPayload
        }
      ],
      tools,
      maxSteps,
      onStepFinish({ text, toolCalls, toolResults }) {
        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach((call) => {
            onStepProgress?.(
              `Agent 触发 Skill: ${call.toolName}`,
              `工具参数: ${JSON.stringify(call.args).slice(0, 80)}...`
            );
          });
        } else if (text) {
          onStepProgress?.('Agent 完成推演与 Audit 重构', '准备呈献最终分镜 Prompt');
        }
      }
    });

    let finalOutput = result.text;
    if (!finalOutput && result.steps && result.steps.length > 0) {
      // Collect tool results if text was empty in last step
      const lastStep = result.steps[result.steps.length - 1];
      if (lastStep.toolResults && lastStep.toolResults.length > 0) {
        finalOutput = String(lastStep.toolResults[0].result);
      }
    }

    return finalOutput || 'Agent 选型及 Skill 运行完成。';
  } catch (err: any) {
    console.error('Agent Harness execution error:', err);
    throw err;
  }
};
