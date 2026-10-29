export type CompletionToken = {start: number; end: number; query: string};
const escaped = (text: string, at: number) => {
 let count = 0; while (at > 0 && text[--at] === '\\') count++;
 return count % 2 === 1;
};
/** The replacement ends at the caret, never at a later comma or word boundary. */
export function completionToken(text: string, selection: {start: number; end: number}): CompletionToken | undefined {
 const caret = selection.start;
 if (caret !== selection.end || !Number.isInteger(caret) || caret < 0 || caret > text.length) return;
 if (caret > 0 && /[\uD800-\uDBFF]/.test(text[caret - 1]) && /[\uDC00-\uDFFF]/.test(text[caret] ?? '')) return;
 let start = 0, quoted = false;
 for (let i = 0; i < caret; i++) {
  if (escaped(text, i)) continue;
  if (text[i] === '"') quoted = !quoted;
  if (quoted) continue;
  if (/[,，\r\n]/.test(text[i])) start = i + 1;
  if (text.slice(i, i + 2) === '::' && i + 1 < caret) { start = i + 2; i++; }
 }
 if (quoted) return;
 while (start < caret && /[\s{\[]/.test(text[start])) start++;
 if (text.slice(start, start + 7) === 'artist:') start += 7;
 const query = text.slice(start, caret).trim();
 if (query.length < 2 || query.length > 80 || /["{}\[\]|<>\r\n]/.test(query) || /^[+-]?[\d.]+$/.test(query) || query.split(/\s+/).length > 5) return;
 return {start, end: caret, query};
}
export function replaceCompletion(text: string, token: CompletionToken, tag: string) {
 const inserted = tag.replaceAll('_', ' '), suffix = text.slice(token.end);
 const base = text.slice(0, token.start) + inserted;
 if (/^(?:::|[}\]\r\n]|:[+-]?[\d.]+\))/.test(suffix)) return {text: base + suffix, caret: base.length};
 if (/^[,，]/.test(suffix)) return {text: base + suffix, caret: base.length + 1 + (suffix.slice(1).match(/^[ \t]*/)?.[0].length ?? 0)};
 const separator = /^[ \t]/.test(suffix) ? ',' : ', ';
 return {text: base + separator + suffix, caret: base.length + separator.length + (suffix.match(/^[ \t]*/)?.[0].length ?? 0)};
}
