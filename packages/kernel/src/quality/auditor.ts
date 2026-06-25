import {
  compileQualityGateResult,
  type QualityGateResultRecord,
  type QualityGateScopeType
} from "./gate.js";
import { assertValidQualityRecord } from "./schemas.js";

export type AgentQualificationStatus =
  | "draft"
  | "fixture_tested"
  | "calibrated"
  | "qualified_for_bounded_use"
  | "stable"
  | "suspended"
  | "retired";

export type QualityReviewIndependenceStatus =
  | "declared"
  | "process_independence_verified"
  | "worktree_session_separation_verified"
  | "independent_transcript_evidence_hash_verified";

export type QualityReviewAttestationResult =
  | "passed"
  | "failed"
  | "blocked"
  | "inconclusive"
  | "passed_with_debt";

export interface QualityReviewAttestationRecord {
  readonly attestation_id: string;
  readonly reviewer_agent_id: string;
  readonly reviewer_agent_version: string;
  readonly independent_from_implementer: true;
  readonly scope_type: QualityGateScopeType;
  readonly scope_id: string;
  readonly source_sha: string;
  readonly quality_profile_hash: string;
  readonly result: QualityReviewAttestationResult;
  readonly findings: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly cannot_claim: readonly string[];
  readonly created_at: string;
}

export interface QualityReviewIndependenceEvidence {
  readonly evidenceRef: string;
  readonly reviewerProcessId: string;
  readonly implementerProcessId: string;
  readonly reviewerSessionId: string;
  readonly implementerSessionId: string;
  readonly reviewerWorktreeRef: string;
  readonly implementerWorktreeRef: string;
  readonly transcriptSha256: string;
  readonly evidenceManifestSha256: string;
  readonly finalProductSha: string;
  readonly freshnessCheckedAt: string;
  readonly freshnessStatus: "fresh" | "stale";
  readonly readOnlyAudit: boolean;
  readonly reviewerCouldMutateImplementation: boolean;
}

export interface CompileQualityReviewAttestationInput {
  readonly attestationId: string;
  readonly reviewerAgentId: string;
  readonly reviewerAgentVersion: string;
  readonly implementerAgentId: string;
  readonly expectedQualityProfileHash: string;
  readonly assertedQualityProfileHash: string;
  readonly gateResult: QualityGateResultRecord;
  readonly independenceEvidence: QualityReviewIndependenceEvidence;
  readonly findings?: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly createdAt: string;
}

export interface QualityAuditorFixtureHarnessInput {
  readonly candidateAgentId: string;
  readonly candidateAgentVersion: string;
  readonly implementerAgentId: string;
  readonly scopeType: QualityGateScopeType;
  readonly scopeId: string;
  readonly sourceSha: string;
  readonly qualityProfileHash: string;
  readonly actualIndependenceEvidence?: QualityReviewIndependenceEvidence;
  readonly createdAt: string;
}

export interface QualityAuditorFixtureResult {
  readonly fixture_id: string;
  readonly result: "passed" | "failed";
  readonly detail: string;
}

export interface QualityAuditorQualificationResult {
  readonly agent_id: string;
  readonly agent_version: string;
  readonly status: AgentQualificationStatus;
  readonly independence_status: QualityReviewIndependenceStatus;
  readonly fixtures: readonly QualityAuditorFixtureResult[];
  readonly sample_attestation: QualityReviewAttestationRecord;
  readonly cannot_claim: readonly string[];
}

const INDEPENDENCE_NOT_PROVEN_CANNOT_CLAIM = [
  "independent_quality_auditor_qualified",
  "independent_process_separation_proven",
  "quality_agents_stable",
  "all_future_quality_audits_complete"
] as const;

export function compileQualityReviewAttestation(
  input: CompileQualityReviewAttestationInput
): QualityReviewAttestationRecord {
  if (input.reviewerAgentId === input.implementerAgentId) {
    throw new Error("Quality reviewer cannot self-promote or self-attest.");
  }
  if (input.assertedQualityProfileHash !== input.expectedQualityProfileHash) {
    throw new Error("Quality reviewer cannot attest against a weakened or drifted profile hash.");
  }
  if (input.gateResult.quality_profile_hash !== input.expectedQualityProfileHash) {
    throw new Error("Quality gate profile hash does not match the expected profile hash.");
  }
  assertMechanicallyIndependentEvidence(
    input.independenceEvidence,
    input.gateResult.source_sha
  );

  const record: QualityReviewAttestationRecord = {
    attestation_id: input.attestationId,
    reviewer_agent_id: input.reviewerAgentId,
    reviewer_agent_version: input.reviewerAgentVersion,
    independent_from_implementer: true,
    scope_type: input.gateResult.scope_type,
    scope_id: input.gateResult.scope_id,
    source_sha: input.gateResult.source_sha,
    quality_profile_hash: input.expectedQualityProfileHash,
    result: attestationResultForGate(input.gateResult.result),
    findings: [...(input.findings ?? [])],
    evidence_refs: uniqueStrings([
      ...input.evidenceRefs,
      input.independenceEvidence.evidenceRef
    ]),
    cannot_claim: [...(input.cannotClaim ?? [])],
    created_at: input.createdAt
  };

  assertValidQualityRecord("quality_review_attestation", record);
  return record;
}

export function runQualityAuditorQualificationFixtures(
  input: QualityAuditorFixtureHarnessInput
): QualityAuditorQualificationResult {
  const fixtureResults: QualityAuditorFixtureResult[] = [];
  const passingGate = buildFixtureGate(input, "passed");
  const fixtureEvidence = buildFixtureIndependenceEvidence(input);
  const sampleAttestation = compileQualityReviewAttestation({
    attestationId: `${input.scopeId}-quality-auditor-positive`,
    reviewerAgentId: input.candidateAgentId,
    reviewerAgentVersion: input.candidateAgentVersion,
    implementerAgentId: input.implementerAgentId,
    expectedQualityProfileHash: input.qualityProfileHash,
    assertedQualityProfileHash: input.qualityProfileHash,
    gateResult: passingGate,
    independenceEvidence: fixtureEvidence,
    findings: [],
    evidenceRefs: ["quality-gate-result"],
    cannotClaim: [...INDEPENDENCE_NOT_PROVEN_CANNOT_CLAIM],
    createdAt: input.createdAt
  });

  fixtureResults.push({
    fixture_id: "process_independent_evidence_can_qualify_for_bounded_use",
    result: sampleAttestation.result === "passed" ? "passed" : "failed",
    detail: "Separate process, session, worktree, transcript, evidence manifest, read-only, and fresh final-SHA evidence produced a schema-valid passing attestation."
  });

  fixtureResults.push(fixtureTestedWithoutProcessProofFixture());
  fixtureResults.push(selfPromotionFixture(input, passingGate, fixtureEvidence));
  fixtureResults.push(sameProcessDifferentLabelFixture(input, passingGate, fixtureEvidence));
  fixtureResults.push(missingEvidenceManifestFixture(input, passingGate, fixtureEvidence));
  fixtureResults.push(staleShaFixture(input, passingGate, fixtureEvidence));
  fixtureResults.push(profileWeakeningFixture(input, passingGate));
  fixtureResults.push(knownFailedGateFixture(input));
  fixtureResults.push(approvedDebtGateFixture(input));

  const allFixturesPassed = fixtureResults.every((fixture) => fixture.result === "passed");
  const independenceStatus = classifyQualityReviewIndependenceEvidence(
    input.actualIndependenceEvidence,
    input.sourceSha
  );
  const status = qualificationStatusForIndependenceStatus(
    independenceStatus,
    allFixturesPassed
  );
  const cannotClaim = status === "qualified_for_bounded_use"
    ? ["quality_agents_stable", "all_future_quality_audits_complete"]
    : [...INDEPENDENCE_NOT_PROVEN_CANNOT_CLAIM];

  return {
    agent_id: input.candidateAgentId,
    agent_version: input.candidateAgentVersion,
    status,
    independence_status: independenceStatus,
    fixtures: fixtureResults,
    sample_attestation: sampleAttestation,
    cannot_claim: cannotClaim
  };
}

export function classifyQualityReviewIndependenceEvidence(
  evidence: QualityReviewIndependenceEvidence | undefined,
  expectedFinalProductSha: string
): QualityReviewIndependenceStatus {
  if (!evidence) return "declared";
  if (
    !isNonEmpty(evidence.evidenceRef) ||
    !isNonEmpty(evidence.reviewerProcessId) ||
    !isNonEmpty(evidence.implementerProcessId)
  ) {
    return "declared";
  }
  if (evidence.reviewerProcessId === evidence.implementerProcessId) {
    return "declared";
  }
  if (
    !isNonEmpty(evidence.reviewerSessionId) ||
    !isNonEmpty(evidence.implementerSessionId) ||
    !isNonEmpty(evidence.reviewerWorktreeRef) ||
    !isNonEmpty(evidence.implementerWorktreeRef) ||
    evidence.reviewerSessionId === evidence.implementerSessionId ||
    evidence.reviewerWorktreeRef === evidence.implementerWorktreeRef
  ) {
    return "process_independence_verified";
  }
  if (
    !isSha256(evidence.transcriptSha256) ||
    !isSha256(evidence.evidenceManifestSha256) ||
    evidence.finalProductSha !== expectedFinalProductSha ||
    !isNonEmpty(evidence.freshnessCheckedAt) ||
    evidence.freshnessStatus !== "fresh" ||
    !evidence.readOnlyAudit ||
    evidence.reviewerCouldMutateImplementation
  ) {
    return "worktree_session_separation_verified";
  }
  return "independent_transcript_evidence_hash_verified";
}

function fixtureTestedWithoutProcessProofFixture(): QualityAuditorFixtureResult {
  const statusWithoutProof = qualificationStatusForIndependenceStatus("declared", true);
  return {
    fixture_id: "fixture_tested_status_when_process_proof_missing",
    result: statusWithoutProof === "fixture_tested" ? "passed" : "failed",
    detail: "Absent actual process evidence is classified as fixture_tested, not qualified."
  };
}

function selfPromotionFixture(
  input: QualityAuditorFixtureHarnessInput,
  gateResult: QualityGateResultRecord,
  independenceEvidence: QualityReviewIndependenceEvidence
): QualityAuditorFixtureResult {
  try {
    compileQualityReviewAttestation({
      attestationId: `${input.scopeId}-self-attestation-negative`,
      reviewerAgentId: input.implementerAgentId,
      reviewerAgentVersion: input.candidateAgentVersion,
      implementerAgentId: input.implementerAgentId,
      expectedQualityProfileHash: input.qualityProfileHash,
      assertedQualityProfileHash: input.qualityProfileHash,
      gateResult,
      independenceEvidence,
      findings: [],
      evidenceRefs: ["quality-gate-result"],
      createdAt: input.createdAt
    });
    return {
      fixture_id: "self_promotion_rejected",
      result: "failed",
      detail: "Self-promotion was accepted."
    };
  } catch {
    return {
      fixture_id: "self_promotion_rejected",
      result: "passed",
      detail: "Self-promotion was rejected."
    };
  }
}

function sameProcessDifferentLabelFixture(
  input: QualityAuditorFixtureHarnessInput,
  gateResult: QualityGateResultRecord,
  independenceEvidence: QualityReviewIndependenceEvidence
): QualityAuditorFixtureResult {
  try {
    compileQualityReviewAttestation({
      attestationId: `${input.scopeId}-same-process-different-label-negative`,
      reviewerAgentId: input.candidateAgentId,
      reviewerAgentVersion: input.candidateAgentVersion,
      implementerAgentId: input.implementerAgentId,
      expectedQualityProfileHash: input.qualityProfileHash,
      assertedQualityProfileHash: input.qualityProfileHash,
      gateResult,
      independenceEvidence: {
        ...independenceEvidence,
        reviewerProcessId: independenceEvidence.implementerProcessId
      },
      findings: [],
      evidenceRefs: ["quality-gate-result"],
      createdAt: input.createdAt
    });
    return {
      fixture_id: "same_process_different_label_rejected",
      result: "failed",
      detail: "Same-process reviewer with a different agent label was accepted."
    };
  } catch {
    return {
      fixture_id: "same_process_different_label_rejected",
      result: "passed",
      detail: "Same-process reviewer with a different agent label was rejected."
    };
  }
}

function missingEvidenceManifestFixture(
  input: QualityAuditorFixtureHarnessInput,
  gateResult: QualityGateResultRecord,
  independenceEvidence: QualityReviewIndependenceEvidence
): QualityAuditorFixtureResult {
  try {
    compileQualityReviewAttestation({
      attestationId: `${input.scopeId}-missing-evidence-manifest-negative`,
      reviewerAgentId: input.candidateAgentId,
      reviewerAgentVersion: input.candidateAgentVersion,
      implementerAgentId: input.implementerAgentId,
      expectedQualityProfileHash: input.qualityProfileHash,
      assertedQualityProfileHash: input.qualityProfileHash,
      gateResult,
      independenceEvidence: {
        ...independenceEvidence,
        evidenceManifestSha256: ""
      },
      findings: [],
      evidenceRefs: ["quality-gate-result"],
      createdAt: input.createdAt
    });
    return {
      fixture_id: "missing_evidence_manifest_rejected",
      result: "failed",
      detail: "Missing evidence manifest hash was accepted."
    };
  } catch {
    return {
      fixture_id: "missing_evidence_manifest_rejected",
      result: "passed",
      detail: "Missing evidence manifest hash was rejected."
    };
  }
}

function staleShaFixture(
  input: QualityAuditorFixtureHarnessInput,
  gateResult: QualityGateResultRecord,
  independenceEvidence: QualityReviewIndependenceEvidence
): QualityAuditorFixtureResult {
  try {
    compileQualityReviewAttestation({
      attestationId: `${input.scopeId}-stale-sha-negative`,
      reviewerAgentId: input.candidateAgentId,
      reviewerAgentVersion: input.candidateAgentVersion,
      implementerAgentId: input.implementerAgentId,
      expectedQualityProfileHash: input.qualityProfileHash,
      assertedQualityProfileHash: input.qualityProfileHash,
      gateResult,
      independenceEvidence: {
        ...independenceEvidence,
        finalProductSha: "stale-product-sha"
      },
      findings: [],
      evidenceRefs: ["quality-gate-result"],
      createdAt: input.createdAt
    });
    return {
      fixture_id: "stale_sha_rejected",
      result: "failed",
      detail: "Stale final product SHA was accepted."
    };
  } catch {
    return {
      fixture_id: "stale_sha_rejected",
      result: "passed",
      detail: "Stale final product SHA was rejected."
    };
  }
}

function profileWeakeningFixture(
  input: QualityAuditorFixtureHarnessInput,
  gateResult: QualityGateResultRecord
): QualityAuditorFixtureResult {
  try {
    compileQualityReviewAttestation({
      attestationId: `${input.scopeId}-profile-weakening-negative`,
      reviewerAgentId: input.candidateAgentId,
      reviewerAgentVersion: input.candidateAgentVersion,
      implementerAgentId: input.implementerAgentId,
      expectedQualityProfileHash: input.qualityProfileHash,
      assertedQualityProfileHash: "sha256:weakened-profile-hash",
      gateResult,
      independenceEvidence: buildFixtureIndependenceEvidence(input),
      findings: [],
      evidenceRefs: ["quality-gate-result"],
      createdAt: input.createdAt
    });
    return {
      fixture_id: "auditor_weakens_profile",
      result: "failed",
      detail: "Profile weakening was accepted."
    };
  } catch {
    return {
      fixture_id: "auditor_weakens_profile",
      result: "passed",
      detail: "Profile weakening was rejected."
    };
  }
}

function knownFailedGateFixture(
  input: QualityAuditorFixtureHarnessInput
): QualityAuditorFixtureResult {
  const failedGate = buildFixtureGate(input, "failed");
  const attestation = compileQualityReviewAttestation({
    attestationId: `${input.scopeId}-known-failed-calibration`,
    reviewerAgentId: input.candidateAgentId,
    reviewerAgentVersion: input.candidateAgentVersion,
    implementerAgentId: input.implementerAgentId,
    expectedQualityProfileHash: input.qualityProfileHash,
    assertedQualityProfileHash: input.qualityProfileHash,
    gateResult: failedGate,
    independenceEvidence: buildFixtureIndependenceEvidence(input),
    findings: ["Known failed quality gate remains failed."],
    evidenceRefs: ["quality-gate-result"],
    createdAt: input.createdAt
  });

  return {
    fixture_id: "known_failed_quality_gate_remains_failed",
    result: attestation.result === "failed" ? "passed" : "failed",
    detail: `Known failed gate attested as ${attestation.result}.`
  };
}

function approvedDebtGateFixture(
  input: QualityAuditorFixtureHarnessInput
): QualityAuditorFixtureResult {
  const debtGate = compileQualityGateResult({
    qualityGateResultId: `${input.scopeId}-approved-debt-calibration`,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    sourceSha: input.sourceSha,
    qualityProfileHash: input.qualityProfileHash,
    toolVersions: {
      quality_auditor_fixture: "0.1.0"
    },
    checks: [
      {
        checkId: "auditor_fixture",
        result: "passed",
        evidenceRefs: ["auditor-fixture"],
        detail: "Auditor fixture passed with approved debt."
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
    createdAt: input.createdAt,
    cannotClaim: ["full_quality_gate_pass"]
  });
  const attestation = compileQualityReviewAttestation({
    attestationId: `${input.scopeId}-approved-debt-attestation-calibration`,
    reviewerAgentId: input.candidateAgentId,
    reviewerAgentVersion: input.candidateAgentVersion,
    implementerAgentId: input.implementerAgentId,
    expectedQualityProfileHash: input.qualityProfileHash,
    assertedQualityProfileHash: input.qualityProfileHash,
    gateResult: debtGate,
    independenceEvidence: buildFixtureIndependenceEvidence(input),
    findings: [],
    evidenceRefs: ["quality-gate-result"],
    cannotClaim: ["full_quality_gate_pass"],
    createdAt: input.createdAt
  });

  return {
    fixture_id: "approved_debt_maps_to_passed_with_debt",
    result: attestation.result === "passed_with_debt" ? "passed" : "failed",
    detail: `Approved-debt gate attested as ${attestation.result}.`
  };
}

function buildFixtureGate(
  input: QualityAuditorFixtureHarnessInput,
  mode: "passed" | "failed"
): QualityGateResultRecord {
  return compileQualityGateResult({
    qualityGateResultId: `${input.scopeId}-quality-gate-${mode}`,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    sourceSha: input.sourceSha,
    qualityProfileHash: input.qualityProfileHash,
    toolVersions: {
      quality_auditor_fixture: "0.1.0"
    },
    checks: [
      {
        checkId: "auditor_fixture",
        result: mode,
        evidenceRefs: ["auditor-fixture"],
        detail: `Auditor fixture ${mode}.`
      }
    ],
    requiredCheckIds: ["auditor_fixture"],
    independentAttestationRef: "meta-review-present",
    evidenceHashes: ["sha256:fixture"],
    qualityDebt: [],
    createdAt: input.createdAt,
    cannotClaim: []
  });
}

function buildFixtureIndependenceEvidence(
  input: QualityAuditorFixtureHarnessInput
): QualityReviewIndependenceEvidence {
  return {
    evidenceRef: `${input.scopeId}-fixture-independence-evidence`,
    reviewerProcessId: `${input.candidateAgentId}:process:readonly`,
    implementerProcessId: `${input.implementerAgentId}:process:implementation`,
    reviewerSessionId: `${input.candidateAgentId}:session:readonly`,
    implementerSessionId: `${input.implementerAgentId}:session:implementation`,
    reviewerWorktreeRef: `${input.scopeId}:review-worktree`,
    implementerWorktreeRef: `${input.scopeId}:implementation-worktree`,
    transcriptSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    evidenceManifestSha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    finalProductSha: input.sourceSha,
    freshnessCheckedAt: input.createdAt,
    freshnessStatus: "fresh",
    readOnlyAudit: true,
    reviewerCouldMutateImplementation: false
  };
}

function assertMechanicallyIndependentEvidence(
  evidence: QualityReviewIndependenceEvidence,
  expectedFinalProductSha: string
): void {
  if (!evidence) {
    throw new Error("Independence evidence is required.");
  }
  expectNonEmpty(evidence.evidenceRef, "Independence evidence ref is required.");
  expectNonEmpty(evidence.reviewerProcessId, "Reviewer process identity is required.");
  expectNonEmpty(evidence.implementerProcessId, "Implementer process identity is required.");
  expectNonEmpty(evidence.reviewerSessionId, "Reviewer session identity is required.");
  expectNonEmpty(evidence.implementerSessionId, "Implementer session identity is required.");
  expectNonEmpty(evidence.reviewerWorktreeRef, "Reviewer worktree identity is required.");
  expectNonEmpty(evidence.implementerWorktreeRef, "Implementer worktree identity is required.");
  expectNonEmpty(evidence.freshnessCheckedAt, "Independence evidence freshness timestamp is required.");

  if (evidence.reviewerProcessId === evidence.implementerProcessId) {
    throw new Error("Reviewer and implementer must not share the same process identity.");
  }
  if (evidence.reviewerSessionId === evidence.implementerSessionId) {
    throw new Error("Reviewer and implementer must not share the same session identity.");
  }
  if (evidence.reviewerWorktreeRef === evidence.implementerWorktreeRef) {
    throw new Error("Reviewer and implementer must not share the same worktree identity.");
  }
  if (!isSha256(evidence.transcriptSha256)) {
    throw new Error("Independent audit transcript hash is required.");
  }
  if (!isSha256(evidence.evidenceManifestSha256)) {
    throw new Error("Independent audit evidence manifest hash is required.");
  }
  if (evidence.finalProductSha !== expectedFinalProductSha) {
    throw new Error("Independent audit evidence is stale for the final product SHA.");
  }
  if (evidence.freshnessStatus !== "fresh") {
    throw new Error("Independent audit evidence freshness must be fresh.");
  }
  if (!evidence.readOnlyAudit || evidence.reviewerCouldMutateImplementation) {
    throw new Error("Independent audit must be read-only and unable to mutate implementation.");
  }
}

function expectNonEmpty(value: string, message: string): void {
  if (!isNonEmpty(value)) {
    throw new Error(message);
  }
}

function isNonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/u.test(value);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function qualificationStatusForIndependenceStatus(
  independenceStatus: QualityReviewIndependenceStatus,
  allFixturesPassed: boolean
): AgentQualificationStatus {
  return allFixturesPassed && independenceStatus === "independent_transcript_evidence_hash_verified"
    ? "qualified_for_bounded_use"
    : "fixture_tested";
}

function attestationResultForGate(
  gateResult: QualityGateResultRecord["result"]
): QualityReviewAttestationResult {
  switch (gateResult) {
    case "passed":
      return "passed";
    case "passed_with_approved_debt":
      return "passed_with_debt";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "inconclusive":
      return "inconclusive";
  }
}
