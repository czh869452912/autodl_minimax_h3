export function canonicalizeDefinition(value: unknown): string {
  const encode = (item: unknown): string => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(encode).join(',')}]`;
    if (item && typeof item === 'object') return `{${Object.keys(item as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${encode((item as Record<string, unknown>)[key])}`).join(',')}}`;
    throw new Error('unsupported canonical value');
  };
  return encode(value);
}
