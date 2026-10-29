export const normalizeTagQuery = (value: string) => value.normalize('NFKC').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
export function tagMatchRank(name: string, query: string): number {
 const value = normalizeTagQuery(name), key = normalizeTagQuery(query);
 if (value === key) return 0;
 if (value.startsWith(key)) return 1;
 const words = value.split(' '), parts = key.split(' ');
 if (parts.every(part => words.some(word => word.startsWith(part)))) return 2;
 if (parts.every(part => value.includes(part))) return 3;
 return 4;
}
