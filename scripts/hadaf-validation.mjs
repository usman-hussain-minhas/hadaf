#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const commands = [
  ['node', ['scripts/scan-public-repo.mjs']],
  ['pnpm', ['typecheck']],
  ['pnpm', ['test']],
  ['pnpm', ['build']],
  ['node', ['scripts/check-license-policy.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
