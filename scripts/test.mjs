import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { root, resolvePiRoot } from './lib.mjs';

const env = { ...process.env, PI_MODULE_ROOT: resolvePiRoot(), PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' };
for (const test of ['tests/setup.test.mjs', 'extensions/chatgpt-fast/tests.mjs', 'extensions/latency-throughput/tests.mjs', 'extensions/parallel/tests.mjs']) {
  console.log('\nRunning ' + test);
  const result = spawnSync(process.execPath, [join(root, test)], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nAll offline tests passed. No provider requests or paid research jobs.');
