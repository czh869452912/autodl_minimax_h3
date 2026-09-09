import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mobile = fileURLToPath(new URL('..', import.meta.url));
const evidence = mkdtempSync(join(tmpdir(), 'h3-process-recovery-'));
for (const scenario of ['pending', 'unknown', 'handle', 'redaction', 'part']) {
  const folder = join(evidence, scenario);
  mkdirSync(folder);
  for (const phase of ['seed', 'resume']) {
    const result = spawnSync(process.execPath, [resolve(mobile, 'node_modules/jest/bin/jest.js'), '--runInBand', 'src/workflows/executor/recoveryProcessAcceptance.test.ts'], {
      cwd: mobile,
      stdio: 'inherit',
      env: { ...process.env,
        C_CORE_RECOVERY_CASE: scenario, C_CORE_RECOVERY_PHASE: phase,
        C_CORE_RECOVERY_DB: join(folder, 'app.db'), C_CORE_RECOVERY_COUNTER: join(folder, 'calls.jsonl'),
        C_CORE_RECOVERY_CAPTURE: join(folder, `${phase}.json`), C_CORE_RECOVERY_CAS: join(folder, 'files'),
      },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Recovery failed: ${scenario}/${phase}; evidence: ${folder}`);
  }
}
console.log(`Verified 5 recovery scenarios across 10 separate processes. Evidence: ${evidence}`);
