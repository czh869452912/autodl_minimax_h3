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
  return defaultResolver
    ? defaultResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
