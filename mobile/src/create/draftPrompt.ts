export function resolveDraftPrompt(current: string, draft: string | null | undefined): string {
  return current.trim() ? current : draft?.trim() || current;
}
