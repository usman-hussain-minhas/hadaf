import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export interface BundleVerificationResult {
  status: 'passed' | 'failed';
  version?: string;
  source_count?: number;
  schema_count?: number;
  template_count?: number;
  project_pack_count?: number;
  entry_count?: number;
  compendium_sha256?: string;
  failures?: unknown[];
}

export function bundleVerifierPath(hadafRoot: string): string {
  return join(hadafRoot, 'input', 'planning_bundle', 'tools', 'verify_bundle.mjs');
}

export function parseBundleVerifierOutput(output: string): BundleVerificationResult {
  const parsed = JSON.parse(output) as BundleVerificationResult;
  if (parsed.status !== 'passed' && parsed.status !== 'failed') {
    throw new Error('Bundle verifier output did not contain a valid status');
  }
  return parsed;
}

export function runBundleVerifier(hadafRoot: string): BundleVerificationResult {
  const result = spawnSync(process.execPath, [bundleVerifierPath(hadafRoot)], {
    encoding: 'utf8',
  });
  const output = result.stdout.trim() || result.stderr.trim();
  if (!output) {
    throw new Error('Bundle verifier produced no output');
  }
  const parsed = parseBundleVerifierOutput(output);
  if (result.status !== 0 || parsed.status !== 'passed') {
    return { ...parsed, status: 'failed' };
  }
  return parsed;
}
