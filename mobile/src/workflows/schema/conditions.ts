function getPath(inputs: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, inputs);
}

export function evaluateCondition(predicate: { field: string; equals?: unknown; in?: unknown[]; exists?: boolean }, inputs: Record<string, unknown>): boolean {
  const value = getPath(inputs, predicate.field);
  if ('equals' in predicate) return Object.is(value, predicate.equals);
  if ('in' in predicate) return Array.isArray(predicate.in) && predicate.in.some((item) => Object.is(item, value));
  if ('exists' in predicate) return (value !== undefined) === Boolean(predicate.exists);
  return false;
}
