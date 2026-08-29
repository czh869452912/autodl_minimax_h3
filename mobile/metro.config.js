const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const defaultResolver = config.resolver.resolveRequest;

// CopilotKit shared currently imports its Node Segment telemetry client from
// the RN bundle. Telemetry is non-functional UI infrastructure, so replace
// only that Node-only module while keeping the full CopilotKit runtime intact.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@segment/analytics-node') {
    return { filePath: path.resolve(__dirname, 'src/shims/segmentAnalytics.ts'), type: 'sourceFile' };
  }
  // DeepAgents' browser export reaches these packages through a transitive
  // bare import. Force their documented browser entry points so Metro never
  // pulls node:async_hooks or other server-only modules into the APK.
  if (moduleName === 'langchain') {
    return { filePath: path.resolve(__dirname, 'src/shims/langchainBrowser.ts'), type: 'sourceFile' };
  }
  if (moduleName === 'langchain/chat_models/universal' || moduleName === 'langchain/dist/chat_models/universal.js' || moduleName.endsWith('/chat_models/universal.js')) {
    return { filePath: path.resolve(__dirname, 'src/shims/langchainBrowser.ts'), type: 'sourceFile' };
  }
  if (moduleName === '@langchain/langgraph') {
    return { filePath: path.resolve(__dirname, 'node_modules/@langchain/langgraph/dist/web.js'), type: 'sourceFile' };
  }
  if (moduleName === 'langsmith/experimental/sandbox') {
    return { filePath: path.resolve(__dirname, 'src/shims/langsmithSandbox.ts'), type: 'sourceFile' };
  }
  return defaultResolver
    ? defaultResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
