import { ChatOpenAICompletions, convertMessagesToCompletionsMessageParams } from '@langchain/openai';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type OpenAI from 'openai';

const providerMessages = Symbol('deepseekProviderMessages');
type RequestOptions = OpenAI.RequestOptions & { [providerMessages]?: OpenAI.Chat.ChatCompletionMessageParam[] };

/** @langchain/openai 1.5.10 drops outbound reasoning_content. Keep it per call,
 * including concurrent model/tool calls, through the public completions adapter. */
export class DeepSeekCompletions extends ChatOpenAICompletions {
  private withReasoning(messages: BaseMessage[], options: this['ParsedCallOptions']): this['ParsedCallOptions'] {
    const wire = messages.flatMap(message => convertMessagesToCompletionsMessageParams({ messages: [message], model: this.model }).map(part => {
      const reasoning = message.additional_kwargs.reasoning_content;
      return AIMessage.isInstance(message) && part.role === 'assistant' && typeof reasoning === 'string'
        ? { ...part, reasoning_content: reasoning } : part;
    }));
    // Non-streaming forwards options.options, while streaming forwards options.
    return { ...options, [providerMessages]: wire, options: { ...options.options, [providerMessages]: wire } };
  }

  override _generate(messages: BaseMessage[], options: this['ParsedCallOptions'], manager?: CallbackManagerForLLMRun) {
    return super._generate(messages, this.withReasoning(messages, options), manager);
  }

  override async *_streamResponseChunks(messages: BaseMessage[], options: this['ParsedCallOptions'], manager?: CallbackManagerForLLMRun) {
    yield* super._streamResponseChunks(messages, this.withReasoning(messages, options), manager);
  }

  override async *_streamChatModelEvents(messages: BaseMessage[], options: this['ParsedCallOptions'], manager?: CallbackManagerForLLMRun) {
    yield* super._streamChatModelEvents(messages, this.withReasoning(messages, options), manager);
  }

  override completionWithRetry(request: OpenAI.Chat.ChatCompletionCreateParamsStreaming, options?: OpenAI.RequestOptions): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>>;
  override completionWithRetry(request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, options?: OpenAI.RequestOptions): Promise<OpenAI.Chat.Completions.ChatCompletion>;
  override completionWithRetry(request: OpenAI.Chat.ChatCompletionCreateParams, options: RequestOptions = {}) {
    const { [providerMessages]: messages, ...sdkOptions } = options;
    const next = messages ? { ...request, messages } : request;
    return next.stream ? super.completionWithRetry(next, sdkOptions) : super.completionWithRetry(next as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, sdkOptions);
  }
}
