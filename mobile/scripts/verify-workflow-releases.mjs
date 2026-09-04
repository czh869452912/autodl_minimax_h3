import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../src/workflows/definitions/autodl/', import.meta.url);

const encode = (value) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${encode(value[key])}`).join(',')}}`;
  }
  throw new Error('unsupported canonical value');
};

const sha256 = (value) => createHash('sha256').update(encode(value)).digest('hex');

const parseVersion = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`invalid workflow semver: ${value}`);
  return match.slice(1).map(Number);
};

const compareCoordinates = (left, right) => {
  const id = left.id.localeCompare(right.id);
  if (id) return id;
  const a = parseVersion(left.version);
  const b = parseVersion(right.version);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

const manifest = JSON.parse(await readFile(new URL('release-manifest.json', root), 'utf8'));
const history = JSON.parse(await readFile(new URL('release-history.json', root), 'utf8'));
if (manifest.apiVersion !== 'autodl.workflow-release-set/v1' || typeof manifest.releaseId !== 'string') {
  throw new Error('invalid workflow release manifest envelope');
}

const packageNames = (await readdir(root)).filter((value) => value.endsWith('.package.json')).sort();
const packages = new Map();
const seen = new Set();
for (const name of packageNames) {
  const pkg = JSON.parse(await readFile(new URL(name, root), 'utf8'));
  const declared = pkg.metadata?.contentHash;
  const metadata = { ...pkg.metadata };
  delete metadata.contentHash;
  const digest = sha256({ ...pkg, metadata });
  const coordinate = `${pkg.metadata?.id}\u0000${pkg.metadata?.version}`;
  if (seen.has(coordinate)) throw new Error(`duplicate workflow coordinate: ${coordinate.replace('\u0000', '@')}`);
  seen.add(coordinate);
  if (declared !== digest) throw new Error(`workflow digest mismatch: ${name}`);
  packages.set(name, { pkg, digest, id: pkg.metadata.id, version: pkg.metadata.version });
}

const manifestNames = manifest.releases.map((release) => release.packageFile);
if (
  new Set(manifestNames).size !== manifestNames.length
  || JSON.stringify([...manifestNames].sort()) !== JSON.stringify(packageNames)
) {
  throw new Error('release Manifest must reference every pinned package exactly once');
}

const coordinates = manifest.releases.map((release) => {
  const pinned = packages.get(release.packageFile);
  if (
    !pinned
    || release.identity?.scheme !== 'workflow-package/without-declared-hash+sorted-json@1'
    || release.identity.digest !== pinned.digest
  ) {
    throw new Error(`release identity mismatch: ${release.packageFile}`);
  }
  for (const historical of release.acceptedHistorical ?? []) {
    if (
      historical.workflowId !== pinned.id
      || historical.version !== pinned.version
      || ![
        'workflow-definition/sorted-json@1',
        'workflow-package/without-declared-hash+sorted-json@1',
      ].includes(historical.identity?.scheme)
      || !/^[0-9a-f]{64}$/.test(historical.identity?.digest ?? '')
    ) {
      throw new Error(`invalid historical identity: ${release.packageFile}`);
    }
  }
  return { id: pinned.id, version: pinned.version };
});

const sortedCoordinates = [...coordinates].sort(compareCoordinates);
if (coordinates.some((coordinate, index) => compareCoordinates(coordinate, sortedCoordinates[index]) !== 0)) {
  throw new Error('release Manifest coordinates are not sorted');
}

const runtimeSet = {
  apiVersion: manifest.apiVersion,
  releaseId: manifest.releaseId,
  releases: manifest.releases.map(({ packageFile, ...release }) => ({
    ...release,
    package: packages.get(packageFile).pkg,
  })),
  activation: manifest.activation,
};
const manifestHash = sha256(runtimeSet);
if (history[manifest.releaseId] !== manifestHash) throw new Error('release history digest mismatch');

const baseIndex = process.argv.indexOf('--base-ref');
if (baseIndex >= 0) {
  const baseRef = process.argv[baseIndex + 1];
  if (!baseRef) throw new Error('--base-ref requires a Git ref');
  let baseHasHistory = true;
  try {
    execFileSync('git', [
      'cat-file', '-e', `${baseRef}:mobile/src/workflows/definitions/autodl/release-history.json`,
    ], { stdio: 'ignore' });
  } catch {
    baseHasHistory = false;
    console.log(`base ${baseRef} predates the release-history ledger`);
  }
  const priorHistory = baseHasHistory
    ? JSON.parse(execFileSync('git', [
        'show', `${baseRef}:mobile/src/workflows/definitions/autodl/release-history.json`,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
    : {};
  for (const [releaseId, digest] of Object.entries(priorHistory)) {
    if (history[releaseId] !== digest) {
      throw new Error(`release history entry changed or disappeared: ${releaseId}`);
    }
  }
}

console.log(`verified ${seen.size} pinned workflow releases and ${manifest.releaseId}@${manifestHash}`);
