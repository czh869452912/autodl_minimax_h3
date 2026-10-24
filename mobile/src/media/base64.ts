/** Bound regex work: mobile JS engines can reject multi-megabyte greedy matches. */
export function isImageBase64(value: string): boolean {
  if (!value.length || value.length % 4 !== 0) return false;
  const end = value.length - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  if (!end) return false;
  for (let offset = 0; offset < end; offset += 4096) {
    if (!/^[A-Za-z0-9+/]+$/.test(value.slice(offset, Math.min(end, offset + 4096)))) return false;
  }
  return true;
}
