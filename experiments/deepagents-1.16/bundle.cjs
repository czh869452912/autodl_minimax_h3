const path = require('node:path'), fs = require('node:fs');
const mobile = path.resolve(__dirname, '../../mobile');
const metro = require(path.join(mobile, 'node_modules/metro'));
const { getDefaultConfig } = require(path.join(mobile, 'node_modules/expo/metro-config'));
const config = getDefaultConfig(mobile);
const appConfig = require(path.join(mobile, 'metro.config.js'));
const portable = process.argv.includes('--portable');
const baseline = process.argv.includes('--baseline');
const output = path.resolve(__dirname, '../../build/deepagents-1.16'); fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(mobile, 'src/shims/langchainBrowser.ts'), path.join(output, 'langchainBrowser.ts'));
config.projectRoot = __dirname;
config.watchFolders = [__dirname, mobile, path.resolve(__dirname, '../../build')];
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules'), path.join(mobile, 'node_modules')];
if (baseline) config.resolver.nodeModulesPaths.reverse();
config.resolver.disableHierarchicalLookup = true;
config.resolver.resolveRequest = (context, name, platform) => {
  if (portable && name === 'node:crypto' && context.originModulePath.startsWith(path.join(__dirname, 'node_modules/deepagents/dist') + path.sep)) return { type: 'sourceFile', filePath: path.join(__dirname, 'sha256.cjs') };
  if (portable && name === 'langsmith/traceable' && context.originModulePath.startsWith(path.join(__dirname, 'node_modules/deepagents/dist') + path.sep)) name = 'langsmith/singletons/traceable';
  const resolved = appConfig.resolver.resolveRequest(context, name, platform);
  if (!baseline && resolved.type === 'sourceFile' && resolved.filePath === path.join(mobile, 'src/shims/langchainBrowser.ts')) return { ...resolved, filePath: path.join(output, 'langchainBrowser.ts') };
  if (!baseline && resolved.type === 'sourceFile' && resolved.filePath.startsWith(path.join(mobile, 'node_modules') + path.sep)) {
    const candidate = path.join(__dirname, 'node_modules', path.relative(path.join(mobile, 'node_modules'), resolved.filePath));
    if (fs.existsSync(candidate)) return { ...resolved, filePath: candidate };
  }
  return resolved;
};
config.maxWorkers = 2;
metro.runBuild(config, { entry: path.join(__dirname, 'entry.js'), platform: 'android', dev: false, minify: false, out: path.join(output, baseline ? 'baseline.bundle.js' : portable ? 'portable.bundle.js' : 'raw.bundle.js') }).then(() => { console.log('METRO_PROBE_PASSED'); process.exit(0); }, error => { console.error(error); process.exit(1); });
