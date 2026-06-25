import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertPortableControlValue, findHadafRoot, logicalUri, resolvePlanes } from './planes.js';

describe('plane resolver', () => {
  it('finds HADAF_ROOT from START_HERE.md', () => {
    const root = join(tmpdir(), `hadaf-root-${Date.now()}`);
    const nested = join(root, 'product', 'hadaf');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, 'START_HERE.md'), '# Start');

    assert.equal(findHadafRoot(nested, {}), root);
  });

  it('resolves all workspace planes', () => {
    const planes = resolvePlanes('/workspace/hadaf');
    assert.equal(planes.product, '/workspace/hadaf/product/hadaf');
    assert.equal(planes.control, '/workspace/hadaf/control');
  });

  it('creates logical URIs and rejects absolute Control values', () => {
    assert.equal(logicalUri('control', '03_boxes/h00/box.yaml'), 'control://03_boxes/h00/box.yaml');
    assert.throws(() => assertPortableControlValue('/not/portable'), /absolute path/);
  });
});
