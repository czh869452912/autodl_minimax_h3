const unsafe = new Set(['__proto__', 'prototype', 'constructor']);

export function parseJsonPointer(pointer: string): string[] {
  if (typeof pointer !== 'string' || (pointer !== '' && !pointer.startsWith('/'))) throw new Error('invalid JSON Pointer');
  if (pointer.includes('~') && pointer.split('/').some((part) => /~(?![01])/.test(part))) throw new Error('invalid JSON Pointer escape');
  const parts = pointer === '' ? [] : pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (parts.some((part) => unsafe.has(part))) throw new Error('unsafe JSON Pointer segment');
  return parts;
}

export function getByJsonPointer(value: unknown, pointer: string): unknown {
  return parseJsonPointer(pointer).reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || (typeof current !== 'object' && typeof current !== 'function')) return undefined;
    if (Array.isArray(current)) {
      if (!/^0$|^[1-9]\d*$/.test(segment)) return undefined;
      return current[Number(segment)];
    }
    return Object.prototype.hasOwnProperty.call(current, segment) ? (current as Record<string, unknown>)[segment] : undefined;
  }, value);
}

export function setByJsonPointer<T>(value: T, pointer: string, nextValue: unknown): T {
  const parts = parseJsonPointer(pointer);
  if (!parts.length) return nextValue as T;
  const cloneValue = (input: any): any => Array.isArray(input) ? input.map(cloneValue) : input && typeof input === 'object' ? Object.fromEntries(Object.entries(input).map(([key, child]) => [key, cloneValue(child)])) : input;
  const clone = cloneValue(value);
  let current: any = clone;
  parts.forEach((segment, index) => {
    const last = index === parts.length - 1;
    if (last) { if (Array.isArray(current)) current[Number(segment)] = nextValue; else current[segment] = nextValue; return; }
    const child = Array.isArray(current) ? current[Number(segment)] : current[segment];
    if (!child || typeof child !== 'object') throw new Error(`cannot set through JSON Pointer segment ${segment}`);
    current = child;
  });
  return clone;
}
