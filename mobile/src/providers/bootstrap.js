// Capture the native REST transport before CopilotKit replaces global fetch
// with its LLM/SSE streaming implementation.
const { captureNativeHttpTransport } = require('./httpTransport');
captureNativeHttpTransport();
require('@copilotkit/react-native/polyfills');
