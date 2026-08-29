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
  // react-native-streamdown 0.2 schedules remend across a Worklets runtime,
  // which is incompatible with Expo 57 / Worklets 0.10. Keep CopilotKit's
  // complete chat UI and enriched-markdown renderer, but process remend on JS.
  if (moduleName === 'react-native-streamdown') {
    return { filePath: path.resolve(__dirname, 'src/shims/reactNativeStreamdown.tsx'), type: 'sourceFile' };
  }
  // CopilotKit's bundled XHR fetch can race a consumer cancellation with
  // onload and close Expo's ReadableStream controller twice. Use the small
  // idempotent adapter for Android while retaining CopilotKit's public API.
  if (moduleName.includes('streaming-fetch-') && context.originModulePath.includes(`${path.sep}node_modules${path.sep}@copilotkit${path.sep}react-native${path.sep}dist`)) {
    return { filePath: path.resolve(__dirname, 'src/shims/copilotKitStreamingFetch.ts'), type: 'sourceFile' };
  }
  return defaultResolver
    ? defaultResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
