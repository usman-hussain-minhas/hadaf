import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyH07EvidenceEligibilityConfig,
  type H07EvidenceEligibilityConfig
} from "./evidence-eligibility.js";

const configPath = "fixtures/h07-evidence-eligibility/valid-config.json";

test("verifies H07 claim-to-evidence eligibility policy and calibration fixtures", async () => {
  const { readFileSync } = await import("node:fs");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as H07EvidenceEligibilityConfig;
  const report = verifyH07EvidenceEligibilityConfig(config);

  assert.equal(report.status, "passed");
  assert.equal(report.policy_results.length, 6);
  assert(report.verified_refs.some((ref) => ref.ref === "fixture://policies/valid-policy.json"));
  assert(report.cannot_claim.includes("release_candidate"));
});

test("calibrates negative eligibility policies", async () => {
  const { readFileSync } = await import("node:fs");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as H07EvidenceEligibilityConfig;
  const report = verifyH07EvidenceEligibilityConfig(config);
  const results = new Map(report.policy_results.map((result) => [result.policyId, result]));

  assert.equal(results.get("valid-h07-policy")?.status, "passed");
  assert.equal(results.get("missing-exact-sha")?.status, "failed");
  assert.equal(results.get("unknown-evidence-class")?.status, "failed");
  assert.equal(results.get("missing-negative-fixture")?.status, "failed");
  assert.equal(results.get("production-supported")?.status, "failed");
  assert.equal(results.get("missing-cannot-claim")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "exact_sha_requirement_missing"));
  assert(report.findings.some((finding) => finding.kind === "rule_evidence_class_unknown"));
  assert(report.findings.some((finding) => finding.kind === "negative_fixture_requirement_missing"));
  assert(report.findings.some((finding) => finding.kind === "future_operational_claim_supported"));
  assert(report.findings.some((finding) => finding.kind === "required_cannot_claim_missing"));
});

test("fails when a policy hash is a placeholder", async () => {
  const { readFileSync } = await import("node:fs");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as H07EvidenceEligibilityConfig;
  const firstPolicy = config.policies[0];
  assert(firstPolicy);
  const report = verifyH07EvidenceEligibilityConfig({
    ...config,
    policies: [
      {
        ...firstPolicy,
        sha256: "pending-h07-policy-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "policy_hash_invalid"));
});

test("fails when expected negative finding is absent", async () => {
  const { readFileSync } = await import("node:fs");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as H07EvidenceEligibilityConfig;
  const firstPolicy = config.policies[0];
  assert(firstPolicy);
  const report = verifyH07EvidenceEligibilityConfig({
    ...config,
    policies: [
      {
        ...firstPolicy,
        expectedFindingKinds: ["future_operational_claim_supported"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_policy_finding_missing"));
});
