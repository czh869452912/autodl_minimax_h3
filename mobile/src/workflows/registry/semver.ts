const parse = (value: string): [number, number, number] => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (!match) throw new Error(`invalid semver: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};
export function compareVersions(left: string, right: string): number { const a = parse(left); const b = parse(right); for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
export function satisfiesVersion(version: string, range: string): boolean {
  const v = parse(version); const normalized = range.trim();
  if (normalized === '*' || normalized === '') return true;
  const op = /^(\^|~|>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+)/.exec(normalized); if (!op) return false;
  const base = op[2]; const relation = op[1] ?? '='; const cmp = compareVersions(version, base);
  if (relation === '=') return cmp === 0;
  if (relation === '>') return cmp > 0; if (relation === '>=') return cmp >= 0; if (relation === '<') return cmp < 0; if (relation === '<=') return cmp <= 0;
  if (relation === '^') return cmp >= 0 && v[0] === parse(base)[0];
  return cmp >= 0 && v[0] === parse(base)[0] && v[1] === parse(base)[1];
}
