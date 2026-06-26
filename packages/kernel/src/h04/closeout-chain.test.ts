import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH04CloseoutChainConfig,
  type H04CloseoutChainConfig
} from "./closeout-chain.js";

const configPath = "fixtures/h04-closeout-chain/valid-config.json";

function loadConfig(): H04CloseoutChainConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H04CloseoutChainConfig;
}

test("verifies a schema-backed H04 closeout hash-chain fixture pack", () => {
  const report = verifyH04CloseoutChainConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.chain_results.length, 6);
  assert.equal(report.final_posture_recommendation, "H04_F03_CLOSEOUT_CHAIN_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "chain"));
  assert(report.cannot_claim.includes("h04_record_generator_implemented"));
});

test("calibrates negative closeout-chain fixtures without failing the suite config", () => {
  const report = verifyH04CloseoutChainConfig(loadConfig());
  const results = new Map(report.chain_results.map((result) => [result.chainId, result]));

  assert.equal(results.get("H04-F03-valid-chain")?.status, "passed");
  assert.equal(results.get("H04-F03-missing-learning")?.status, "failed");
  assert.equal(results.get("H04-F03-placeholder-hash")?.status, "failed");
  assert.equal(results.get("H04-F03-overclaim")?.status, "failed");
  assert.equal(results.get("H04-F03-artifact-bundle-hash-mismatch")?.status, "failed");
  assert.equal(results.get("H04-F03-stale-link-marked-valid")?.status, "failed");

  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "terminal_learning_missing"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "link_sha256_invalid"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "cannot_claim_missing_required"
    )
  );
});

test("fails when the configured schema hash drifts", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schema: {
      ...loaded.schema,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  };

  const report = verifyH04CloseoutChainConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const config = {
    ...loadConfig(),
    chains: [
      {
        chainId: "H04-F03-valid-chain",
        ref: "fixture://closeouts/valid-chain.json",
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["terminal_learning_missing"]
      }
    ]
  };

  const report = verifyH04CloseoutChainConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "chain_status_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "expected_finding_missing"));
});
