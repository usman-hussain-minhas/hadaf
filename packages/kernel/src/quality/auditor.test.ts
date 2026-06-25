import assert from "node:assert/strict";
import test from "node:test";

import { compileQualityGateResult } from "./gate.js";
import { validateQualityReviewAttestationRecord } from "./schemas.js";
import {
  compileQualityReviewAttestation,
  runQualityAuditorQualificationFixtures
} from "./auditor.js";

const PROFILE_HASH = "sha256:3501e4e3a179c37ef572bd1faca51808d1f1863a6b84b49e211bb1801e8d2688";
const CREATED_AT = "2026-06-25T00:00:00Z";

test("qualifies quality.auditor@0.1 for bounded use with required fixtures", () => {
  const result = runQualityAuditorQualificationFixtures(harnessInput());

  assert.equal(result.agent_id, "quality.auditor");
  assert.equal(result.agent_version, "0.1.0");
  assert.equal(result.status, "qualified_for_bounded_use");
  assert.deepEqual(
    result.fixtures.map((fixture) => [fixture.fixture_id, fixture.result]),
    [
      ["independent_quality_auditor_pass", "passed"],
      ["implementer_self_attests", "passed"],
      ["auditor_weakens_profile", "passed"],
      ["known_failed_quality_gate_remains_failed", "passed"]
    ]
  );
  assert.equal(result.sample_attestation.independent_from_implementer, true);
  assert.deepEqual(validateQualityReviewAttestationRecord(result.sample_attestation).issues, []);
});

test("does not promote the bounded quality auditor to stable", () => {
  const result = runQualityAuditorQualificationFixtures(harnessInput());

  assert.notEqual(result.status, "stable");
  assert.deepEqual(result.cannot_claim, [
    "quality_agents_stable",
    "all_future_quality_audits_complete"
  ]);
});

test("rejects implementer self-attestation", () => {
  assert.throws(
    () =>
      compileQualityReviewAttestation({
        attestationId: "self-attestation-negative",
        reviewerAgentId: "implementer.agent",
        reviewerAgentVersion: "0.1.0",
        implementerAgentId: "implementer.agent",
        expectedQualityProfileHash: PROFILE_HASH,
        assertedQualityProfileHash: PROFILE_HASH,
        gateResult: passingGate(),
        findings: [],
        evidenceRefs: ["quality-gate-result"],
        createdAt: CREATED_AT
      }),
    /independent/
  );
});

test("rejects profile weakening or drift", () => {
  assert.throws(
    () =>
      compileQualityReviewAttestation({
        attestationId: "profile-drift-negative",
        reviewerAgentId: "quality.auditor",
        reviewerAgentVersion: "0.1.0",
        implementerAgentId: "implementer.agent",
        expectedQualityProfileHash: PROFILE_HASH,
        assertedQualityProfileHash: "sha256:weakened-profile-hash",
        gateResult: passingGate(),
        findings: [],
        evidenceRefs: ["quality-gate-result"],
        createdAt: CREATED_AT
      }),
    /profile hash/
  );
});

test("preserves a known failed quality gate as a failed attestation", () => {
  const attestation = compileQualityReviewAttestation({
    attestationId: "known-failed-calibration",
    reviewerAgentId: "quality.auditor",
    reviewerAgentVersion: "0.1.0",
    implementerAgentId: "implementer.agent",
    expectedQualityProfileHash: PROFILE_HASH,
    assertedQualityProfileHash: PROFILE_HASH,
    gateResult: failedGate(),
    findings: ["Known failed quality gate remains failed."],
    evidenceRefs: ["quality-gate-result"],
    createdAt: CREATED_AT
  });

  assert.equal(attestation.result, "failed");
});

test("maps approved-debt gate results to passed_with_debt attestations", () => {
  const gateResult = compileQualityGateResult({
    qualityGateResultId: "approved-debt-gate",
    scopeType: "ffet",
    scopeId: "H00-Q03",
    sourceSha: "source-sha",
    qualityProfileHash: PROFILE_HASH,
    toolVersions: {
      quality_auditor_fixture: "0.1.0"
    },
    checks: [
      {
        checkId: "auditor_fixture",
        result: "passed",
        evidenceRefs: ["auditor-fixture"],
        detail: "Auditor fixture passed."
      }
    ],
    requiredCheckIds: ["auditor_fixture"],
    independentAttestationRef: "meta-review-present",
    evidenceHashes: ["sha256:fixture"],
    qualityDebt: [
      {
        ref: "quality-debt-approved",
        status: "approved",
        expiresAt: "2026-06-26T00:00:00Z"
      }
    ],
    createdAt: CREATED_AT,
    cannotClaim: ["full_quality_gate_pass"]
  });
  const attestation = compileQualityReviewAttestation({
    attestationId: "approved-debt-attestation",
    reviewerAgentId: "quality.auditor",
    reviewerAgentVersion: "0.1.0",
    implementerAgentId: "implementer.agent",
    expectedQualityProfileHash: PROFILE_HASH,
    assertedQualityProfileHash: PROFILE_HASH,
    gateResult,
    findings: [],
    evidenceRefs: ["quality-gate-result"],
    cannotClaim: ["full_quality_gate_pass"],
    createdAt: CREATED_AT
  });

  assert.equal(attestation.result, "passed_with_debt");
  assert.deepEqual(validateQualityReviewAttestationRecord(attestation).issues, []);
});

function harnessInput() {
  return {
    candidateAgentId: "quality.auditor",
    candidateAgentVersion: "0.1.0",
    implementerAgentId: "implementer.agent",
    scopeType: "ffet" as const,
    scopeId: "H00-Q03",
    sourceSha: "source-sha",
    qualityProfileHash: PROFILE_HASH,
    createdAt: CREATED_AT
  };
}

function passingGate() {
  return compileQualityGateResult({
    qualityGateResultId: "passing-gate",
    scopeType: "ffet",
    scopeId: "H00-Q03",
    sourceSha: "source-sha",
    qualityProfileHash: PROFILE_HASH,
    toolVersions: {
      quality_auditor_fixture: "0.1.0"
    },
    checks: [
      {
        checkId: "auditor_fixture",
        result: "passed",
        evidenceRefs: ["auditor-fixture"],
        detail: "Auditor fixture passed."
      }
    ],
    requiredCheckIds: ["auditor_fixture"],
    independentAttestationRef: "meta-review-present",
    evidenceHashes: ["sha256:fixture"],
    qualityDebt: [],
    createdAt: CREATED_AT,
    cannotClaim: []
  });
}

function failedGate() {
  return compileQualityGateResult({
    qualityGateResultId: "failed-gate",
    scopeType: "ffet",
    scopeId: "H00-Q03",
    sourceSha: "source-sha",
    qualityProfileHash: PROFILE_HASH,
    toolVersions: {
      quality_auditor_fixture: "0.1.0"
    },
    checks: [
      {
        checkId: "auditor_fixture",
        result: "failed",
        evidenceRefs: ["auditor-fixture"],
        detail: "Auditor fixture failed."
      }
    ],
    requiredCheckIds: ["auditor_fixture"],
    independentAttestationRef: "meta-review-present",
    evidenceHashes: ["sha256:fixture"],
    qualityDebt: [],
    createdAt: CREATED_AT,
    cannotClaim: []
  });
}
