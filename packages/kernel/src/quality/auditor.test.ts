import assert from "node:assert/strict";
import test from "node:test";

import { compileQualityGateResult } from "./gate.js";
import { validateQualityReviewAttestationRecord } from "./schemas.js";
import {
  classifyQualityReviewIndependenceEvidence,
  compileQualityReviewAttestation,
  type QualityReviewIndependenceEvidence,
  runQualityAuditorQualificationFixtures
} from "./auditor.js";

const PROFILE_HASH = "sha256:3501e4e3a179c37ef572bd1faca51808d1f1863a6b84b49e211bb1801e8d2688";
const TRANSCRIPT_HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EVIDENCE_MANIFEST_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CREATED_AT = "2026-06-25T00:00:00Z";

test("keeps quality.auditor@0.1 fixture-tested when actual independence proof is absent", () => {
  const result = runQualityAuditorQualificationFixtures(harnessInput());

  assert.equal(result.agent_id, "quality.auditor");
  assert.equal(result.agent_version, "0.1.0");
  assert.equal(result.status, "fixture_tested");
  assert.equal(result.independence_status, "declared");
  assert.deepEqual(
    result.fixtures.map((fixture) => [fixture.fixture_id, fixture.result]),
    [
      ["process_independent_evidence_can_qualify_for_bounded_use", "passed"],
      ["fixture_tested_status_when_process_proof_missing", "passed"],
      ["self_promotion_rejected", "passed"],
      ["same_process_different_label_rejected", "passed"],
      ["missing_evidence_manifest_rejected", "passed"],
      ["stale_sha_rejected", "passed"],
      ["auditor_weakens_profile", "passed"],
      ["known_failed_quality_gate_remains_failed", "passed"],
      ["approved_debt_maps_to_passed_with_debt", "passed"]
    ]
  );
  assert.equal(result.sample_attestation.independent_from_implementer, true);
  assert.deepEqual(result.cannot_claim, [
    "independent_quality_auditor_qualified",
    "independent_process_separation_proven",
    "quality_agents_stable",
    "all_future_quality_audits_complete"
  ]);
  assert.deepEqual(validateQualityReviewAttestationRecord(result.sample_attestation).issues, []);
});

test("can qualify for bounded use only when actual mechanical independence evidence is provided", () => {
  const result = runQualityAuditorQualificationFixtures({
    ...harnessInput(),
    actualIndependenceEvidence: independenceEvidence()
  });

  assert.equal(result.status, "qualified_for_bounded_use");
  assert.equal(result.independence_status, "independent_transcript_evidence_hash_verified");
  assert.deepEqual(result.cannot_claim, [
    "quality_agents_stable",
    "all_future_quality_audits_complete"
  ]);
});

test("keeps actual incomplete independence evidence fixture-tested", () => {
  const result = runQualityAuditorQualificationFixtures({
    ...harnessInput(),
    actualIndependenceEvidence: independenceEvidence({
      evidenceRef: "",
      freshnessCheckedAt: ""
    })
  });

  assert.equal(result.status, "fixture_tested");
  assert.equal(result.independence_status, "declared");
  assert.deepEqual(result.cannot_claim, [
    "independent_quality_auditor_qualified",
    "independent_process_separation_proven",
    "quality_agents_stable",
    "all_future_quality_audits_complete"
  ]);
});

test("does not promote the bounded quality auditor to stable", () => {
  const result = runQualityAuditorQualificationFixtures(harnessInput());

  assert.notEqual(result.status, "stable");
  assert.deepEqual(result.cannot_claim, [
    "independent_quality_auditor_qualified",
    "independent_process_separation_proven",
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
        independenceEvidence: independenceEvidence(),
        findings: [],
        evidenceRefs: ["quality-gate-result"],
        createdAt: CREATED_AT
      }),
    /self-promote|self-attest/
  );
});

test("rejects same-process reviewers even when agent labels differ", () => {
  assert.throws(
    () =>
      compileQualityReviewAttestation({
        attestationId: "same-process-different-label-negative",
        reviewerAgentId: "quality.auditor",
        reviewerAgentVersion: "0.1.0",
        implementerAgentId: "implementer.agent",
        expectedQualityProfileHash: PROFILE_HASH,
        assertedQualityProfileHash: PROFILE_HASH,
        gateResult: passingGate(),
        independenceEvidence: independenceEvidence({
          reviewerProcessId: "shared-process",
          implementerProcessId: "shared-process"
        }),
        findings: [],
        evidenceRefs: ["quality-gate-result"],
        createdAt: CREATED_AT
      }),
    /same process/
  );
});

test("rejects missing evidence manifest proof", () => {
  assert.throws(
    () =>
      compileQualityReviewAttestation({
        attestationId: "missing-evidence-manifest-negative",
        reviewerAgentId: "quality.auditor",
        reviewerAgentVersion: "0.1.0",
        implementerAgentId: "implementer.agent",
        expectedQualityProfileHash: PROFILE_HASH,
        assertedQualityProfileHash: PROFILE_HASH,
        gateResult: passingGate(),
        independenceEvidence: independenceEvidence({
          evidenceManifestSha256: ""
        }),
        findings: [],
        evidenceRefs: ["quality-gate-result"],
        createdAt: CREATED_AT
      }),
    /evidence manifest hash/
  );
});

test("rejects stale final SHA evidence", () => {
  assert.throws(
    () =>
      compileQualityReviewAttestation({
        attestationId: "stale-sha-negative",
        reviewerAgentId: "quality.auditor",
        reviewerAgentVersion: "0.1.0",
        implementerAgentId: "implementer.agent",
        expectedQualityProfileHash: PROFILE_HASH,
        assertedQualityProfileHash: PROFILE_HASH,
        gateResult: passingGate(),
        independenceEvidence: independenceEvidence({
          finalProductSha: "stale-product-sha"
        }),
        findings: [],
        evidenceRefs: ["quality-gate-result"],
        createdAt: CREATED_AT
      }),
    /stale/
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
        independenceEvidence: independenceEvidence(),
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
    independenceEvidence: independenceEvidence(),
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
    independenceEvidence: independenceEvidence(),
    findings: [],
    evidenceRefs: ["quality-gate-result"],
    cannotClaim: ["full_quality_gate_pass"],
    createdAt: CREATED_AT
  });

  assert.equal(attestation.result, "passed_with_debt");
  assert.deepEqual(validateQualityReviewAttestationRecord(attestation).issues, []);
});

test("classifies independence evidence maturity levels", () => {
  assert.equal(
    classifyQualityReviewIndependenceEvidence(undefined, "source-sha"),
    "declared"
  );
  assert.equal(
    classifyQualityReviewIndependenceEvidence(independenceEvidence({ evidenceRef: "" }), "source-sha"),
    "declared"
  );
  assert.equal(
    classifyQualityReviewIndependenceEvidence(
      independenceEvidence({ reviewerSessionId: "shared-session", implementerSessionId: "shared-session" }),
      "source-sha"
    ),
    "process_independence_verified"
  );
  assert.equal(
    classifyQualityReviewIndependenceEvidence(
      independenceEvidence({ evidenceManifestSha256: "" }),
      "source-sha"
    ),
    "worktree_session_separation_verified"
  );
  assert.equal(
    classifyQualityReviewIndependenceEvidence(
      independenceEvidence({ freshnessCheckedAt: "" }),
      "source-sha"
    ),
    "worktree_session_separation_verified"
  );
  assert.equal(
    classifyQualityReviewIndependenceEvidence(independenceEvidence(), "source-sha"),
    "independent_transcript_evidence_hash_verified"
  );
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

function independenceEvidence(
  overrides: Partial<QualityReviewIndependenceEvidence> = {}
): QualityReviewIndependenceEvidence {
  return {
    evidenceRef: "independence-evidence",
    reviewerProcessId: "quality.auditor:process:readonly",
    implementerProcessId: "implementer.agent:process:implementation",
    reviewerSessionId: "quality.auditor:session:readonly",
    implementerSessionId: "implementer.agent:session:implementation",
    reviewerWorktreeRef: "review-worktree",
    implementerWorktreeRef: "implementation-worktree",
    transcriptSha256: TRANSCRIPT_HASH,
    evidenceManifestSha256: EVIDENCE_MANIFEST_HASH,
    finalProductSha: "source-sha",
    freshnessCheckedAt: CREATED_AT,
    freshnessStatus: "fresh",
    readOnlyAudit: true,
    reviewerCouldMutateImplementation: false,
    ...overrides
  };
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
