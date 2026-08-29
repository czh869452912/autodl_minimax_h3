// Runtime compatibility shim for local Android agent execution.
// LangSmith's runtime detection assumes every global navigator has a string
// userAgent. React Native exposes navigator without that browser-only field.
const runtimeNavigator = globalThis.navigator;
if (runtimeNavigator && typeof runtimeNavigator.userAgent !== 'string') {
  Object.defineProperty(runtimeNavigator, 'userAgent', {
    configurable: true,
    value: 'ReactNative',
  });
}

// React Native's AbortSignal predates the web `throwIfAborted()` helper used
// by LangChain's async stream wrapper. Keep the standard behavior local to the
// app so cancellation remains safe without forking LangChain.
const abortSignalPrototype = globalThis.AbortSignal?.prototype;
if (abortSignalPrototype && typeof abortSignalPrototype.throwIfAborted !== 'function') {
  Object.defineProperty(abortSignalPrototype, 'throwIfAborted', {
    configurable: true,
    value() {
      if (this.aborted) throw this.reason ?? new Error('The operation was aborted');
    },
  });
}
