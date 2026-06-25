import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bundleVerifierPath, parseBundleVerifierOutput } from './bundle.js';

describe('bundle verification helpers', () => {
  it('builds the canonical verifier path', () => {
    assert.equal(bundleVerifierPath('/workspace/hadaf'), '/workspace/hadaf/input/planning_bundle/tools/verify_bundle.mjs');
  });

  it('parses verifier output', () => {
    const result = parseBundleVerifierOutput(JSON.stringify({ status: 'passed', source_count: 37 }));
    assert.equal(result.status, 'passed');
    assert.equal(result.source_count, 37);
  });
});
