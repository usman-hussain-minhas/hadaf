import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH06ResourceQuotaConfig,
  type H06ResourceQuotaConfig
} from "./resource-quotas.js";

const configPath = "fixtures/h06-resource-quotas/valid-config.json";

function loadConfig(): H06ResourceQuotaConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H06ResourceQuotaConfig;
}

test("verifies H06 resource quota runtime records and boundaries", () => {
  const report = verifyH06ResourceQuotaConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.quota_results.length, 7);
  assert.equal(report.final_posture_recommendation, "H06_F00_RESOURCE_QUOTAS_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "schema_ref"));
  assert(report.verified_refs.some((ref) => ref.source === "quota"));
  assert(report.cannot_claim.includes("production_resource_orchestration"));
});

test("calibrates resource quota negative fixtures", () => {
  const report = verifyH06ResourceQuotaConfig(loadConfig());
  const results = new Map(report.quota_results.map((result) => [result.quotaId, result]));

  assert.equal(results.get("quota-worktree-valid")?.status, "passed");
  assert.equal(results.get("quota-soft-warning")?.status, "failed");
  assert.equal(results.get("quota-hard-breach")?.status, "failed");
  assert.equal(results.get("quota-unknown-kind")?.status, "failed");
  assert.equal(results.get("quota-missing-cannot-claim")?.status, "failed");
  assert.equal(results.get("quota-private-path")?.status, "failed");
  assert.equal(results.get("quota-overclaim")?.status, "failed");

  for (const kind of [
    "soft_or_advisory_limit_breached",
    "hard_limit_breached",
    "schema_validation_failed",
    "production_orchestration_cannot_claim_missing",
    "private_path_in_quota_record",
    "production_orchestration_boundary_missing"
  ]) {
    assert(report.classified_mismatches.some((finding) => finding.kind === kind), kind);
  }
});

test("fails when the configured schema hash is a placeholder", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schema: {
      ...loaded.schema,
      sha256: "pending-resource-quota-schema-hash"
    }
  };

  const report = verifyH06ResourceQuotaConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_invalid_placeholder"));
});

test("fails when a quota record hash drifts", () => {
  const loaded = loadConfig();
  const [validQuota] = loaded.quotas;
  assert(validQuota);
  const config = {
    ...loaded,
    quotas: [
      {
        ...validQuota,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  };

  const report = verifyH06ResourceQuotaConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "quota_record_hash_mismatch"));
});

test("fails when an expected resource-quota negative finding is not observed", () => {
  const loaded = loadConfig();
  const [validQuota] = loaded.quotas;
  assert(validQuota);
  const config = {
    ...loaded,
    quotas: [
      {
        ...validQuota,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["hard_limit_breached"]
      }
    ]
  };

  const report = verifyH06ResourceQuotaConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "quota_status_unexpected"));
  assert(report.findings.some((finding) => finding.kind === "expected_negative_finding_missing"));
});
