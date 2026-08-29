export function resolveDraftPrompt(current: string, draft: string | null | undefined): string {
  return draft?.trim() || current;
}
