import assert from "node:assert/strict";
import test from "node:test";

import { compileHadafDogfoodQualityProfile } from "./profile.js";
import {
  assertValidQualityRecord,
  toCanonicalQualityProfileRecord,
  validateQualityRecord,
  type QualitySchemaKind,
  type ValidationIssue
} from "./schemas.js";

const PROFILE_HASH = "sha256:3501e4e3a179c37ef572bd1faca51808d1f1863a6b84b49e211bb1801e8d2688";

test("validates canonical quality schema fixture records", () => {
  const fixtures: ReadonlyArray<readonly [QualitySchemaKind, unknown]> = [
    ["quality_profile", validQualityProfile()],
    ["box_quality_contract", validBoxQualityContract()],
    ["quality_gate_result", validQualityGateResult()],
    ["quality_debt", validQualityDebt()],
    ["quality_review_attestation", validQualityReviewAttestation()],
    ["performance_budget", validPerformanceBudget()]
  ];

  for (const [kind, fixture] of fixtures) {
    const result = validateQualityRecord(kind, fixture);
    assert.deepEqual(result.issues, []);
    assert.equal(result.ok, true);
  }
});

test("adapts the compiled H00-Q00 profile to the canonical quality profile schema", () => {
  const compiled = compileHadafDogfoodQualityProfile();
  const canonical = toCanonicalQualityProfileRecord(compiled);

  assert.equal(canonical.quality_profile_id, "hadaf_dogfood_quality_v1");
  assert.equal(canonical.profile_hash, PROFILE_HASH);
  assert.equal(canonical.testing.changed_line_coverage_min, 0.9);
  assert.equal(canonical.review.implementing_agent_self_attestation_forbidden, true);
  assertValidQualityRecord("quality_profile", canonical);
});

test("rejects a quality profile with a missing required profile hash", () => {
  const invalid = withoutKey(validQualityProfile(), "profile_hash");
  const result = validateQualityRecord("quality_profile", invalid);

  assert.equal(result.ok, false);
  assertIssue(result.issues, "$.profile_hash", "missing_required");
});

test("rejects additional root properties prohibited by canonical schemas", () => {
  const invalid = { ...validBoxQualityContract(), control_plane_note: "not allowed" };
  const result = validateQualityRecord("box_quality_contract", invalid);

  assert.equal(result.ok, false);
  assertIssue(result.issues, "$.control_plane_note", "additional_property");
});

test("rejects duplicate inherited quality profile ancestry", () => {
  const invalid = {
    ...validQualityProfile(),
    inherited_from: [
      "hadaf_quality_constitution_v1",
      "hadaf_quality_constitution_v1"
    ]
  };
  const result = validateQualityRecord("quality_profile", invalid);

  assert.equal(result.ok, false);
  assertIssue(result.issues, "$.inherited_from", "unique_items");
});

test("rejects implementing-agent self-attestation", () => {
  const invalid = {
    ...validQualityReviewAttestation(),
    independent_from_implementer: false
  };
  const result = validateQualityRecord("quality_review_attestation", invalid);

  assert.equal(result.ok, false);
  assertIssue(result.issues, "$.independent_from_implementer", "const");
});

test("rejects quality gate results without independent attestation", () => {
  const invalid = withoutKey(validQualityGateResult(), "independent_attestation_ref");
  const result = validateQualityRecord("quality_gate_result", invalid);

  assert.equal(result.ok, false);
  assertIssue(result.issues, "$.independent_attestation_ref", "missing_required");
});

test("rejects invalid nested quality gate check results", () => {
  const invalid = {
    ...validQualityGateResult(),
    checks: [
      {
        check_id: "unit_tests",
        result: "ignored",
        unexpected: true
      }
    ]
  };
  const result = validateQualityRecord("quality_gate_result", invalid);

  assert.equal(result.ok, false);
  assertIssue(result.issues, "$.checks[0].result", "enum");
  assertIssue(result.issues, "$.checks[0].unexpected", "additional_property");
});

test("rejects date-only strings where canonical schemas require date-time", () => {
  const gateResult = validateQualityRecord("quality_gate_result", {
    ...validQualityGateResult(),
    created_at: "2026-06-25"
  });
  const qualityDebt = validateQualityRecord("quality_debt", {
    ...validQualityDebt(),
    approved_at: "2026-06-25",
    expires_at: "2026-07-25"
  });
  const attestation = validateQualityRecord("quality_review_attestation", {
    ...validQualityReviewAttestation(),
    created_at: "2026-06-25"
  });

  assert.equal(gateResult.ok, false);
  assert.equal(qualityDebt.ok, false);
  assert.equal(attestation.ok, false);
  assertIssue(gateResult.issues, "$.created_at", "format");
  assertIssue(qualityDebt.issues, "$.approved_at", "format");
  assertIssue(qualityDebt.issues, "$.expires_at", "format");
  assertIssue(attestation.issues, "$.created_at", "format");
});

test("rejects impossible date-time calendar dates", () => {
  const result = validateQualityRecord("quality_gate_result", {
    ...validQualityGateResult(),
    created_at: "2026-02-30T00:00:00Z"
  });

  assert.equal(result.ok, false);
  assertIssue(result.issues, "$.created_at", "format");
});

test("rejects performance budgets below canonical minimums", () => {
  const invalid = {
    ...validPerformanceBudget(),
    concurrency: 0,
    sample_count: 0,
    acceptable_variance: -0.1
  };
  const result = validateQualityRecord("performance_budget", invalid);

  assert.equal(result.ok, false);
  assertIssue(result.issues, "$.concurrency", "minimum");
  assertIssue(result.issues, "$.sample_count", "minimum");
  assertIssue(result.issues, "$.acceptable_variance", "minimum");
});

test("assertValidQualityRecord throws with useful issue detail", () => {
  assert.throws(
    () => assertValidQualityRecord("quality_debt", withoutKey(validQualityDebt(), "owner")),
    /quality_debt validation failed: .*owner/
  );
});

function validQualityProfile() {
  return toCanonicalQualityProfileRecord(compileHadafDogfoodQualityProfile());
}

function validBoxQualityContract() {
  return {
    box_quality_contract_id: "BQC-H00-v1",
    box_id: "H00",
    quality_profile_ref: "hadaf_dogfood_quality_v1",
    quality_profile_hash: PROFILE_HASH,
    audit_level: "independent",
    required_dimensions: {
      correctness: "required",
      testing: "required",
      security: "required"
    },
    quality_debt_refs: [],
    release_quality_conditions: [
      "all_required_quality_checks_pass",
      "independent_attestation_present"
    ],
    cannot_claim: []
  };
}

function validQualityGateResult() {
  return {
    quality_gate_result_id: "QGR-H00-Q01-example",
    scope_type: "ffet",
    scope_id: "H00-Q01",
    source_sha: "replace",
    quality_profile_hash: PROFILE_HASH,
    tool_versions: {
      node: "local"
    },
    checks: [
      {
        check_id: "unit_tests",
        result: "passed",
        command: "pnpm test",
        evidence_refs: ["quality-unit-tests"],
        detail: null
      }
    ],
    result: "passed",
    quality_debt_refs: [],
    independent_attestation_ref: "quality-attestation",
    evidence_hashes: ["sha256:replace"],
    cannot_claim: [],
    created_at: "2026-06-25T00:00:00Z"
  };
}

function validQualityDebt() {
  return {
    quality_debt_id: "QD-H00-Q01-example",
    project_id: "hadaf",
    box_id: "H00",
    ffet_id: "H00-Q01",
    quality_profile_hash: PROFILE_HASH,
    standard: "changed_branch_coverage_min",
    actual: 0.76,
    required: 0.8,
    severity: "medium",
    reason: "bounded example",
    owner: "quality.owner",
    approved_by: "human",
    approved_at: "2026-06-25T00:00:00Z",
    expires_at: "2026-07-25T00:00:00Z",
    remediation_ffet: "H00-Q99",
    cannot_claim: ["full_quality_gate_pass"],
    status: "proposed"
  };
}

function validQualityReviewAttestation() {
  return {
    attestation_id: "QRA-H00-Q01-example",
    reviewer_agent_id: "quality.auditor",
    reviewer_agent_version: "0.1.0",
    independent_from_implementer: true,
    scope_type: "ffet",
    scope_id: "H00-Q01",
    source_sha: "replace",
    quality_profile_hash: PROFILE_HASH,
    result: "passed",
    findings: [],
    evidence_refs: ["quality-result"],
    cannot_claim: [],
    created_at: "2026-06-25T00:00:00Z"
  };
}

function validPerformanceBudget() {
  return {
    performance_budget_id: "PERF-HMC-v1",
    scope: "H02",
    environment: {
      runtime: "local",
      cpu: "declared_by_runner",
      memory: "declared_by_runner"
    },
    dataset: "synthetic_hadaf_project_small",
    concurrency: 1,
    state: "warm",
    sample_count: 30,
    measurement_tool: "playwright_lighthouse_or_calibrated_equivalent",
    metrics: {
      lcp_ms_max: 2500,
      cls_max: 0.1
    },
    acceptable_variance: 0.1,
    cannot_claim: ["production_internet_performance"]
  };
}

function withoutKey<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K
): Omit<T, K> {
  const clone = { ...value };
  delete clone[key];
  return clone;
}

function assertIssue(
  issues: readonly ValidationIssue[],
  path: string,
  code: ValidationIssue["code"]
): void {
  assert.equal(
    issues.some((issue) => issue.path === path && issue.code === code),
    true,
    JSON.stringify(issues)
  );
}
