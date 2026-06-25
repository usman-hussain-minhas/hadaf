#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const modulesRoot = join(root, 'node_modules');
const allowed = [
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MIT',
  'Python-2.0',
  'Unicode-DFS-2016',
  'Unlicense',
];
const blockedPattern = /\b(AGPL|GPL|LGPL|SSPL|BUSL|Commons Clause|Non-Commercial|NonCommercial|CC-BY-NC|Proprietary)\b/i;
const packageFiles = [];
const findings = [];
const seen = new Set();

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === '.bin') continue;
      walk(path);
      continue;
    }
    if (name === 'package.json') packageFiles.push(path);
  }
}

function normalizeLicense(value) {
  if (Array.isArray(value)) return value.join(' OR ');
  if (typeof value === 'object' && value?.type) return String(value.type);
  if (typeof value === 'string') return value;
  return '';
}

function isPermissive(expression) {
  if (!expression || blockedPattern.test(expression)) return false;
  const tokens = expression
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND|WITH)\s+|\s+/i)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => allowed.includes(token));
}

if (existsSync(modulesRoot)) {
  walk(modulesRoot);
}

for (const file of packageFiles) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const key = `${pkg.name ?? relative(root, file)}@${pkg.version ?? 'unknown'}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (pkg.private === true || String(pkg.name ?? '').startsWith('@hadaf/')) continue;
  const license = normalizeLicense(pkg.license);
  if (!isPermissive(license)) {
    findings.push({
      package: key,
      path: relative(root, file).replaceAll('\\', '/'),
      license: license || 'missing',
    });
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: 'failed', findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', scanned_packages: seen.size, allowed_licenses: allowed }, null, 2));
