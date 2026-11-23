import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const electronPath = require(
  require.resolve('electron', { paths: [path.join(repoRoot, 'apps', 'desktop')] }),
);
const vitestBin = require.resolve('vitest/vitest.mjs', { paths: [repoRoot] });

const extraArgs = process.argv.slice(2);
const hasPool = extraArgs.some((arg) => arg === '--pool' || arg.startsWith('--pool='));
const vitestArgs = [vitestBin, 'run', ...(hasPool ? [] : ['--pool=threads']), ...extraArgs];

const child = spawn(electronPath, vitestArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
