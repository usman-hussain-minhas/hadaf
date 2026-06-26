import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  canonicalizeJsonForHash,
  verifyH03ConstitutionReadinessConfig,
  type H03ConstitutionReadinessConfig
} from "./constitution-readiness.js";
import { verifyH03ConstitutionReadinessConfig as exportedVerifier } from "../index.js";

type MutableConfig = Record<string, any>;

function loadValidConfig(): H03ConstitutionReadinessConfig {
  return JSON.parse(readFileSync("fixtures/h03-constitution-readiness/valid-config.json", "utf8"));
}

function loadMutableConfig(): MutableConfig {
  return JSON.parse(readFileSync("fixtures/h03-constitution-readiness/valid-config.json", "utf8"));
}

function verifyMutableConfig(config: MutableConfig) {
  return verifyH03ConstitutionReadinessConfig(config as H03ConstitutionReadinessConfig);
}

test("verifies an H03 constitution for human review without execution authorization", () => {
  const report = verifyH03ConstitutionReadinessConfig(loadValidConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.constitution_id, "hadaf-h03-fixture-constitution");
  assert.equal(report.constitution_content_hash, "8c886f9bd7ff0e660232dfeb3545e83e67c59e33aa4674d43df32459261ad1d2");
  assert.equal(report.approval_state, "for_human_review");
  assert.equal(report.execution_authorization_state, "not_authorized");
  assert.equal(report.execution_authorized, false);
  assert.equal(report.verified_predecessors.length, 1);
  assert.deepEqual(report.verified_records, []);
  assert.equal(report.cannot_claim.includes("execution_authorization_granted"), true);
  assert.equal(report.final_posture_recommendation, "H03_F05_CONSTITUTION_READINESS_BOUNDARY_VERIFIED");
});

test("canonicalizes JSON objects deterministically for constitution content hashing", () => {
  assert.equal(canonicalizeJsonForHash({ z: 1, a: true, nested: { b: "x", a: null } }), "{\"a\":true,\"nested\":{\"a\":null,\"b\":\"x\"},\"z\":1}");
  assert.throws(() => canonicalizeJsonForHash(Number.NaN), /non_finite_number_not_supported/u);
});

test("hashes constitution content without the approval envelope", () => {
  const validReport = verifyH03ConstitutionReadinessConfig(loadValidConfig());
  assert.equal(validReport.status, "passed");
  const deliveryConfig = loadMutableConfig();
  delete deliveryConfig.expectedConstitutionContentHash;
  const secondReport = verifyMutableConfig(deliveryConfig);
  assert.equal(secondReport.constitution_content_hash, validReport.constitution_content_hash);
});

test("rejects stale product SHAs", () => {
  const config = loadMutableConfig();
  config.currentProduct.actualSha = "0".repeat(40);

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "stale_product_sha"), true);
});

test("rejects predecessor closeout hash drift", () => {
  const config = loadMutableConfig();
  config.predecessorCloseouts[0].sha256 = "0".repeat(64);

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "ref_hash_mismatch"), true);
});

test("rejects constitution approval hash mismatches", () => {
  const config = loadMutableConfig();
  config.deliveryConstitutionOverrides.constitutionHash = "0".repeat(64);

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "constitution_content_hash_mismatch"), true);
});

test("rejects approval status overclaims from the Delivery Constitution input", () => {
  const config = loadMutableConfig();
  config.deliveryConstitutionOverrides.approvalStatus = "approved";

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "delivery_constitution_compilation_failed"), true);
});

test("rejects mismatched approval records", () => {
  const config = loadMutableConfig();
  config.approvalRecord = {
    ref: "fixture://h03-constitution-readiness/artifacts/approval-record-mismatch.json",
    sha256: "3910616856516fcee93befdff97b7f0e022e108d5aa3a12662c7443a80f2b2ad",
    schemaRef: "fixture://h03-constitution-readiness/schemas/constitution-approval-record.json",
    schemaSha256: "74b2b39be4d443182df3af12f929a4a57533f1a8023ee01c91c630a1e979f3eb"
  };

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "approval_record_constitution_hash_mismatch"), true);
});

test("rejects execution authorization without a valid approved constitution", () => {
  const config = loadMutableConfig();
  config.executionAuthorizationRecord = {
    ref: "fixture://h03-constitution-readiness/artifacts/execution-authorization-mismatch.json",
    sha256: "8c484e44f83d613de4f7d2b3917d30ea795f82a116fc11d13da39bf9e5bf19e7",
    schemaRef: "fixture://h03-constitution-readiness/schemas/execution-authorization-record.json",
    schemaSha256: "c136dc3709894af1e4ef07dd08be0017bf80357cbc3b85520b6f685fb76ab024"
  };

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "execution_authorization_without_approved_constitution"), true);
});

test("rejects missing required completion gates", () => {
  const config = loadMutableConfig();
  config.completionGates[0].status = "failed";

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "required_completion_gate_not_passed"), true);
});

test("rejects private paths introduced through Delivery Constitution overrides", () => {
  const config = loadMutableConfig();
  config.deliveryConstitutionOverrides.targetLocation = ["", "Users", "example", "private-target"].join("/");

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "private_path_in_constitution"), true);
});

test("rejects unsupported canonicalization expectations", () => {
  const config = loadMutableConfig();
  config.expectedCanonicalization = "JCS";

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "unsupported_expected_canonicalization"), true);
});

test("rejects expected constitution content hash drift", () => {
  const config = loadMutableConfig();
  config.expectedConstitutionContentHash = "f".repeat(64);

  const report = verifyMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "expected_constitution_content_hash_mismatch"), true);
});

test("exports H03 constitution readiness APIs from the kernel barrel", () => {
  assert.equal(exportedVerifier, verifyH03ConstitutionReadinessConfig);
});
