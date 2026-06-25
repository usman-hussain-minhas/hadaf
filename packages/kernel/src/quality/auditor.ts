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

export interface CompileQualityReviewAttestationInput {
  readonly attestationId: string;
  readonly reviewerAgentId: string;
  readonly reviewerAgentVersion: string;
  readonly implementerAgentId: string;
  readonly expectedQualityProfileHash: string;
  readonly assertedQualityProfileHash: string;
  readonly gateResult: QualityGateResultRecord;
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
  readonly fixtures: readonly QualityAuditorFixtureResult[];
  readonly sample_attestation: QualityReviewAttestationRecord;
  readonly cannot_claim: readonly string[];
}

export function compileQualityReviewAttestation(
  input: CompileQualityReviewAttestationInput
): QualityReviewAttestationRecord {
  if (input.reviewerAgentId === input.implementerAgentId) {
    throw new Error("Quality reviewer must be independent from implementer.");
  }
  if (input.assertedQualityProfileHash !== input.expectedQualityProfileHash) {
    throw new Error("Quality reviewer cannot attest against a weakened or drifted profile hash.");
  }
  if (input.gateResult.quality_profile_hash !== input.expectedQualityProfileHash) {
    throw new Error("Quality gate profile hash does not match the expected profile hash.");
  }

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
    evidence_refs: [...input.evidenceRefs],
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
  const sampleAttestation = compileQualityReviewAttestation({
    attestationId: `${input.scopeId}-quality-auditor-positive`,
    reviewerAgentId: input.candidateAgentId,
    reviewerAgentVersion: input.candidateAgentVersion,
    implementerAgentId: input.implementerAgentId,
    expectedQualityProfileHash: input.qualityProfileHash,
    assertedQualityProfileHash: input.qualityProfileHash,
    gateResult: passingGate,
    findings: [],
    evidenceRefs: ["quality-gate-result"],
    cannotClaim: ["quality_agents_stable", "all_future_quality_audits_complete"],
    createdAt: input.createdAt
  });

  fixtureResults.push({
    fixture_id: "independent_quality_auditor_pass",
    result: sampleAttestation.result === "passed" ? "passed" : "failed",
    detail: "Independent reviewer produced a schema-valid passing attestation."
  });

  fixtureResults.push(selfAttestationFixture(input, passingGate));
  fixtureResults.push(profileWeakeningFixture(input, passingGate));
  fixtureResults.push(knownFailedGateFixture(input));

  const status = fixtureResults.every((fixture) => fixture.result === "passed")
    ? "qualified_for_bounded_use"
    : "fixture_tested";

  return {
    agent_id: input.candidateAgentId,
    agent_version: input.candidateAgentVersion,
    status,
    fixtures: fixtureResults,
    sample_attestation: sampleAttestation,
    cannot_claim: ["quality_agents_stable", "all_future_quality_audits_complete"]
  };
}

function selfAttestationFixture(
  input: QualityAuditorFixtureHarnessInput,
  gateResult: QualityGateResultRecord
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
      findings: [],
      evidenceRefs: ["quality-gate-result"],
      createdAt: input.createdAt
    });
    return {
      fixture_id: "implementer_self_attests",
      result: "failed",
      detail: "Self-attestation was accepted."
    };
  } catch {
    return {
      fixture_id: "implementer_self_attests",
      result: "passed",
      detail: "Self-attestation was rejected."
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
