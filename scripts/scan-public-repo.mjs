#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'coverage', 'playwright-report', 'test-results']);
const ignoredFiles = new Set(['.git']);
const forbiddenRootEntries = ['control', 'evidence', 'releases', 'runtime', 'input'];
const forbiddenLicenseFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'];
const secretPatterns = [
  /(ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i,
  /\bDATABASE_URL\b\s*[:=]\s*["']?\w+:\/\//i,
];
const localPathPatterns = [
  /\/Users\/[A-Za-z0-9._-]+/,
  /\/Volumes\/[A-Za-z0-9._-]+/,
  /\/home\/[A-Za-z0-9._-]+/,
  /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/,
];

const findings = [];

for (const entry of forbiddenRootEntries) {
  if (existsSync(join(root, entry))) {
    findings.push({ type: 'private_plane_contamination', path: entry });
  }
}

for (const entry of forbiddenLicenseFiles) {
  if (existsSync(join(root, entry))) {
    findings.push({ type: 'forbidden_license_file', path: entry });
  }
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (packageJson.private !== true) {
  findings.push({ type: 'publication_guard_missing', path: 'package.json', detail: 'private must be true' });
}
if (packageJson.license !== 'UNLICENSED') {
  findings.push({ type: 'license_posture_invalid', path: 'package.json', detail: 'license must be UNLICENSED' });
}
if (!packageJson.scripts?.prepublishOnly) {
  findings.push({ type: 'publication_guard_missing', path: 'package.json', detail: 'prepublishOnly guard missing' });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path).replaceAll('\\', '/');
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!ignoredDirs.has(name)) walk(path);
      continue;
    }
    if (ignoredFiles.has(name)) continue;
    if (!stat.isFile()) continue;
    const text = readFileSync(path, 'utf8');
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) findings.push({ type: 'secret_like_pattern', path: rel });
    }
    for (const pattern of localPathPatterns) {
      if (pattern.test(text)) findings.push({ type: 'local_absolute_path', path: rel });
    }
    if (rel.startsWith('.github/workflows/') && /pull_request_target\s*:/.test(text)) {
      findings.push({ type: 'unsafe_workflow_trigger', path: rel, detail: 'pull_request_target is forbidden' });
    }
    if (rel.startsWith('.github/workflows/') && /permissions\s*:\s*write-all/.test(text)) {
      findings.push({ type: 'unsafe_workflow_permissions', path: rel, detail: 'write-all is forbidden' });
    }
  }
}

walk(root);

if (findings.length > 0) {
  console.error(JSON.stringify({ status: 'failed', findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', checks: ['secrets', 'local_paths', 'private_planes', 'license_files', 'publication_guard', 'workflow_basics'] }, null, 2));
