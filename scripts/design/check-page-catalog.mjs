import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(root, 'docs/design/page-catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const errors = [];
const pages = catalog.pages;
const byId = new Map(pages.map(page => [page.id, page]));
const requireValue = (condition, message) => { if (!condition) errors.push(message); };
const sourceLink = source => '../../' + source.replaceAll('(', '%28').replaceAll(')', '%29');
requireValue(catalog.schemaVersion === 1, 'Unknown catalog schema');
requireValue(byId.size === pages.length, 'Duplicate page IDs');
const required = ['id', 'name', 'kind', 'purpose', 'currentIssue', 'recommendation', 'entry', 'back', 'primaryAction', 'priority', 'evidenceLevel', 'proposalStatus'];
for (const page of pages) {
  for (const field of required) requireValue(typeof page[field] === 'string' && page[field].length > 0, `${page.id}: missing ${field}`);
  requireValue(['route', 'surface', 'shell'].includes(page.kind), `${page.id}: invalid kind`);
  requireValue(page.parent === null || byId.has(page.parent), `${page.id}: missing parent ${page.parent}`);
  requireValue(page.targetOwner === null || byId.has(page.targetOwner), `${page.id}: invalid target owner`);
  requireValue(Array.isArray(page.states) && page.states.length > 0, `${page.id}: states missing`);
  requireValue(Array.isArray(page.sources) && page.sources.length > 0, `${page.id}: source missing`);
  for (const source of page.sources ?? []) requireValue(fs.existsSync(path.join(root, source)), `${page.id}: source does not exist: ${source}`);
  for (const ref of page.references ?? []) requireValue(catalog.references.includes(ref), `${page.id}: unknown reference ${ref}`);
  for (const evidence of page.evidence ?? []) requireValue(fs.existsSync(path.join(root, evidence)), `${page.id}: missing evidence ${evidence}`);
  if (page.kind !== 'surface') requireValue(typeof page.route === 'string', `${page.id}: route file required`);
  if (page.route) requireValue(fs.existsSync(path.join(root, page.route)), `${page.id}: missing route file`);
  const seen = new Set([page.id]);
  let cursor = page.parent;
  while (cursor && byId.has(cursor)) {
    if (seen.has(cursor)) { errors.push(`${page.id}: parent cycle`); break; }
    seen.add(cursor); cursor = byId.get(cursor).parent;
  }
}
function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(item => {
    const full = path.join(directory, item.name);
    return item.isDirectory() ? walk(full) : full.endsWith('.tsx') ? [path.relative(root, full).replaceAll('\\', '/')] : [];
  });
}
const actual = walk(path.join(root, 'mobile/app'));
const registered = pages.filter(page => page.route).map(page => page.route);
requireValue(new Set(registered).size === registered.length, 'Duplicate route registration');
for (const route of actual) requireValue(registered.includes(route), `Uncatalogued route: ${route}`);
for (const route of registered) requireValue(actual.includes(route), `Stale route: ${route}`);
for (const edge of catalog.edges) {
  requireValue(byId.has(edge.fromId) && byId.has(edge.toId), `Unknown edge: ${edge.fromId} → ${edge.toId}`);
  requireValue(['navigate', 'open-surface', 'restore-workspace'].includes(edge.type), `Invalid edge type: ${edge.type}`);
  requireValue(Boolean(edge.label), 'Edge label required');
  requireValue(Boolean(edge.source) && fs.existsSync(path.join(root, edge.source ?? '')), `Missing edge source: ${edge.label}`);
}
const changed = Object.entries(catalog.sourceDigests ?? {}).filter(([source, digest]) =>
  !fs.existsSync(path.join(root, source)) || createHash('sha256').update(fs.readFileSync(path.join(root, source))).digest('hex') !== digest);
if (changed.length) {
  const message = 'Design source baseline changed; review before refreshing digests:\n' + changed.map(([source]) => source).join('\n');
  if (process.argv.includes('--check-sources')) errors.push(message);
  else process.stderr.write(`WARNING: ${message}\n`);
}
if (errors.length) { process.stderr.write(errors.join('\n') + '\n'); process.exit(1); }

const lines = [
  '# 现状地图与逐页审查', '',
  `基线：${catalog.baseline.date} / ${catalog.baseline.commit} / ${catalog.baseline.product}。`, '',
  '> 本文件由 page-catalog.json 生成。改目录后执行 node scripts/design/check-page-catalog.mjs --write。', '',
  '## 范围与结论', '',
  `覆盖 ${pages.filter(p => p.kind === 'route').length} 个路由页面、${pages.filter(p => p.kind === 'shell').length} 个壳层、${pages.filter(p => p.kind === 'surface').length} 个重要子表面；记录 ${catalog.edges.length} 条源码确认的关键点击边。非路由清单不宣称穷尽全部 JSX 分支，点击边也不是运行时全图。`, '',
  '当前实现已有四入口、预览、参数抽屉、任务气泡、明确采用和不可变版本，方向不必推倒。但项目概览承担工具目录，镜头列表承担编辑器，技能目录承担多个流程，时间线承担参数表与工程管理，导致正确能力仍难使用。应按对象和状态重组任务，不再给每项能力补一个常驻按钮。', '',
  '目录中的归属是信息组织视角，不等于 Expo 文件嵌套或真实 back 栈。所有“建议”均为 proposed，尚未实施。页面状态是需要覆盖的规格，不能当作已通过的设备测试。', '',
  '## 当前主要跳转：概览的扇出', '',
  '```mermaid', 'flowchart LR', '  project[项目工作区] --> overview[概览]',
  ...catalog.edges.filter(e => e.fromId === 'project-overview').map((e, i) => `  overview --> ov${i}[${byId.get(e.toId).name}]`),
  '```', '',
  '图中箭头为打开入口，不是内容从属。这里的八个工具入口已经足以说明：一张概览不应继续成为所有新增功能的默认落点。', '',
  '## 代码路由清单', '',
  '| 稳定 ID | 页面 | 路由文件 | 信息归属 |', '| --- | --- | --- | --- |',
  ...pages.filter(p => p.route).map(p => `| ${p.id} | [${p.name}](#${p.id}) | [${p.route.replace('mobile/app/', '')}](${sourceLink(p.route)}) | ${byId.get(p.parent)?.name ?? '根'} |`), '',
  '## 当前信息归属清单', '',
  '以下仅为归属视角；辅助路由实际有多个来源，不据此决定 back。route=页面，surface=非路由表面，shell=导航壳。', '',
  '```text',
  ...treeLines(null),
  '```', '',
  '## 逐页建议', ''
];
function treeLines(parent, depth = 0) {
  return pages.filter(p => p.parent === parent).flatMap(p => [
    `${'  '.repeat(depth)}${p.name} [${p.kind}; ${p.id}]`, ...treeLines(p.id, depth + 1)
  ]);
}
for (const page of pages) {
  lines.push(`<a id="${page.id}"></a>`, `### ${page.name} · ${page.id} · ${page.priority}`, '',
    `**任务**：${page.purpose}。`, '',
    `**现状问题**：${page.currentIssue}`, '',
    `**展示与交互建议**：${page.recommendation}`, '',
    `**主操作**：${page.primaryAction}。**目标归属**：${byId.get(page.targetOwner)?.name ?? '根'}。`, '',
    `**进入与返回**：${page.entry} → 本表面；${page.back}。`, '',
    `**应覆盖状态**：${page.states.join(' / ')}。`, '',
    `**依据**：${page.sources.map(source => `[${source.replace('mobile/', '')}](${sourceLink(source)})`).join('、')}；对照 ${page.references.join('、')}（见 [调研](research.md)）。${page.evidence.length ? `本轮截图：${page.evidence.map(e => `[${path.basename(e)}](${sourceLink(e)})`).join('、')}。` : '本表面未单独完成本轮设备采样，结论以源码结构为限。'}`, '');
}
lines.push('## 关键点击关系与上下文', '',
  '以下是当前实现的人工核对边；不是目标路由配置，也不保证全部分支都在设备走通。模态关闭、取消选择和写入后的回流要求见 target-and-flows.md。', '',
  '| 来源 | 触发动作 | 目标 | 必须理解/保留的上下文 | 边类型 |', '| --- | --- | --- | --- | --- |',
  ...catalog.edges.map(e => `| ${byId.get(e.fromId).name} | ${e.label} | ${byId.get(e.toId).name} | ${e.context || '无业务对象参数 / 由当前工作区恢复'} | ${e.type} |`), '',
  '## 审查优先级', '',
  '- P1：直接影响核心创作判断、上下文、授权或造成重复导航；优先重组完整流程。',
  '- P2：列表、管理、历史与兼容入口的组织改进；跟随核心流程收敛。',
  '- P3：低频偏好/诊断的层级优化。', '',
  '此处优先级是 UX 设计优先级，不把每个源码结构问题自动认定为可复现功能 bug。', '');
const result = lines.join('\n');
const reportPath = path.join(root, 'docs/design/page-review.md');
if (process.argv.includes('--write')) {
  fs.writeFileSync(reportPath, result);
  process.stdout.write(`Generated ${path.relative(root, reportPath)}\n`);
} else if (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, 'utf8') !== result) {
  process.stderr.write('Generated report is stale. Run with --write.\n'); process.exit(1);
}
process.stdout.write(`PASS: ${actual.length} route files, ${pages.length} catalog entries, ${catalog.edges.length} click edges. Source/runtime behavior requires separate review.\n`);
