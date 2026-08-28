/** RN-safe no-op replacement for CopilotKit's optional Node telemetry sink. */
export class Analytics {
  track() {}
  closeAndFlush() { return Promise.resolve(); }
}
