import { readdirSync, readFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import ts from 'typescript';

const root = resolve(__dirname, '..');
function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(folder, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(path) && !/\.(test|spec)\./.test(path) ? [path] : [];
  });
}

test('application imports preserve storage capabilities and the extracted domain boundaries', () => {
  const violations: string[] = [];
  for (const file of [...sources(root), ...sources(resolve(root, '../app'))]) {
    const from = relative(root, file).replace(/\\/g, '/');
    if (from.startsWith('test/')) continue;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const imports: Array<{ specifier: string; typeOnly: boolean }> = [];
    function visit(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push({ specifier: node.moduleSpecifier.text, typeOnly: Boolean(ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly) });
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument)) imports.push({ specifier: argument.text, typeOnly: false });
        else violations.push(`${from} -> nonliteral dynamic module (requires explicit review)`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const { specifier, typeOnly } of imports) {
      const target = specifier.startsWith('.') ? relative(root, resolve(dirname(file), specifier)).replace(/\\/g, '/') : specifier;
      const forbidden =
        (!from.startsWith('storage/') && target === 'storage/databaseAccess') ||
        (!from.startsWith('storage/') && target === 'expo-sqlite' && !typeOnly) ||
        (/^(media|handoff)\//.test(from) && target.startsWith('agent/')) ||
        (from.startsWith('media/') && target.startsWith('handoff/')) ||
        (from.startsWith('config/') && /^(agent|storage|settings)\//.test(target)) ||
        (from === 'workflows/executor/errorPolicy.ts' && target.includes('providers/autodl/')) ||
        (from === 'workflows/executor/jobStateRepository.ts' && /^tasks\/(projection|repository)/.test(target)) ||
        (/\.(tsx)$/.test(from) && target === 'tasks/executorRuntime') ||
        (/^workflows\/registry\/(builtin|releaseManifest)\.ts$/.test(from) && /^workflows\/registry\/(service|crypto)$/.test(target));
      if (forbidden) violations.push(`${from} -> ${target}`);
    }
  }
  expect(violations).toEqual([]);
});
