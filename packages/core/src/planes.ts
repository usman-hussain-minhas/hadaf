import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export type PlaneName = 'input' | 'product' | 'control' | 'evidence' | 'releases' | 'runtime';

export interface HadafPlanes {
  root: string;
  input: string;
  product: string;
  control: string;
  evidence: string;
  releases: string;
  runtime: string;
}

export function findHadafRoot(startDirectory = process.cwd(), environment: NodeJS.ProcessEnv = process.env): string {
  const configuredRoot = environment['HADAF_ROOT'];
  if (configuredRoot) {
    const candidate = resolve(configuredRoot);
    if (hasStartHere(candidate)) return candidate;
    throw new Error('HADAF_ROOT is set but does not contain START_HERE.md');
  }

  let current = resolve(startDirectory);
  while (true) {
    if (hasStartHere(current)) return current;
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Unable to resolve HADAF_ROOT from START_HERE.md');
}

export function resolvePlanes(root: string): HadafPlanes {
  const resolvedRoot = resolve(root);
  return {
    root: resolvedRoot,
    input: join(resolvedRoot, 'input'),
    product: join(resolvedRoot, 'product', 'hadaf'),
    control: join(resolvedRoot, 'control'),
    evidence: join(resolvedRoot, 'evidence'),
    releases: join(resolvedRoot, 'releases'),
    runtime: join(resolvedRoot, 'runtime'),
  };
}

export function logicalUri(plane: PlaneName, relativePath = ''): string {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '');
  return normalized ? `${plane}://${normalized}` : `${plane}://`;
}

export function assertPortableControlValue(value: string): void {
  if (isAbsolute(value)) {
    throw new Error(`Portable Control value must not be an absolute path: ${value}`);
  }
  if (/^[A-Za-z]:\\/.test(value)) {
    throw new Error(`Portable Control value must not be a Windows absolute path: ${value}`);
  }
}

function hasStartHere(directory: string): boolean {
  return existsSync(join(directory, 'START_HERE.md'));
}
