// A value snapshot detects in-place SDK edits without serializing historical text.
export function recordFields(value: unknown): unknown[] {
  const fields: unknown[] = [];
  const ancestors = new Set<object>();
  const visit = (item: unknown) => {
    if (!item || typeof item !== 'object') { fields.push(item); return; }
    if (ancestors.has(item)) throw new Error('会话数据包含循环引用');
    ancestors.add(item);
    const entries = Object.entries(item).sort(([left], [right]) => left.localeCompare(right));
    fields.push(Array.isArray(item) ? 'array' : 'object', entries.length);
    for (const [key, child] of entries) { fields.push(key); visit(child); }
    ancestors.delete(item);
  };
  visit(value);
  return fields;
}
export function sameRecordFields(left: readonly unknown[] | undefined, right: readonly unknown[]): boolean {
  return !!left && left.length === right.length && left.every((value, index) => value === right[index]);
}
