#!/usr/bin/env node
import { runBundleVerifier, findHadafRoot, resolvePlanes } from '@hadaf/core';

const command = process.argv[2] ?? 'status';

try {
  if (command === 'status') {
    const root = findHadafRoot();
    console.log(JSON.stringify({ status: 'ok', posture: 'PUBLIC_BOOTSTRAP_ACTIVE', planes: resolvePlanes(root) }, null, 2));
  } else if (command === 'verify-bundle') {
    const root = findHadafRoot();
    console.log(JSON.stringify(runBundleVerifier(root), null, 2));
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
