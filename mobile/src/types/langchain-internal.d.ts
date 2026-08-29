declare module 'langchain/dist/agents/index.js' {
  export const createAgent: any;
  export const createMiddleware: any;
  export const createSubagentTransformer: any;
  export const createToolCallTransformer: any;
}
declare module 'langchain/dist/agents/middleware/utils.js' {
  export const countTokensApproximately: any;
}
declare module 'langchain/dist/agents/middleware/hitl.js' {
  export const humanInTheLoopMiddleware: any;
}
declare module 'langchain/dist/agents/middleware/todoListMiddleware.js' {
  export const todoListMiddleware: any;
}
declare module 'langchain/dist/agents/middleware/provider/anthropic/promptCaching.js' {
  export const anthropicPromptCachingMiddleware: any;
}
declare module 'langchain/dist/agents/middleware/provider/aws/promptCaching.js' {
  export const bedrockPromptCachingMiddleware: any;
}
declare module 'langchain/dist/tools/headless.js' {
  export const tool: any;
}
