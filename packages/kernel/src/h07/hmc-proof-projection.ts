import { createHash } from "node:crypto";

export type H07HmcProofProjectionStatus = "passed" | "failed";
export type H07HmcProofProjectionMaturity =
  | "mocked"
  | "fixture_backed"
  | "api_backed"
  | "persistent"
  | "production_connected";

export interface H07HmcProofProjectionConfig {
  readonly projectionId: string;
  readonly boxId: string;
  readonly productSha: string;
  readonly treeHash: string;
  readonly authority: "derived_view_only";
  readonly maturity: H07HmcProofProjectionMaturity;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly box: H07HmcProofBoxInput;
  readonly proofLevels: readonly H07HmcProofLevelInput[];
  readonly blockedClaims: readonly H07HmcBlockedClaimInput[];
  readonly prerequisiteCloseouts: readonly H07HmcProofPrerequisiteInput[];
  readonly requiredCannotClaim: readonly string[];
  readonly cannotClaim: readonly string[];
  readonly claimAuthority?: boolean;
  readonly claimP8Operational?: boolean;
  readonly claimP9Operational?: boolean;
  readonly claimReleaseReady?: boolean;
  readonly claimProductionReady?: boolean;
  readonly claimMechanicalIndependence?: boolean;
  readonly claimH12Assurance?: boolean;
}

export interface H07HmcProofBoxInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: H07HmcProofProjectionMaturity;
  readonly assuranceStatus: "not_started" | "pending" | "in_progress" | "complete";
}

export interface H07HmcProofLevelInput {
  readonly level: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9";
  readonly title: string;
  readonly status: "verified" | "required" | "blocked" | "non_operational" | "operational";
  readonly maturity: H07HmcProofProjectionMaturity;
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict" | "not_applicable";
  readonly negativeProofStatus: "verified" | "missing" | "stale" | "conflict" | "not_applicable";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
  readonly required?: boolean;
}

export interface H07HmcBlockedClaimInput {
  readonly claimId: string;
  readonly reason: string;
  readonly cannotClaim: string;
}

export interface H07HmcProofPrerequisiteInput {
  readonly id: string;
  readonly status: string;
  readonly closeoutStatus: "not_applicable" | "pending" | "closeout_complete";
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict";
  readonly terminalLearningStatus: "complete" | "missing" | "stale" | "conflict";
}

export interface H07HmcProofProjectionReport {
  readonly status: H07HmcProofProjectionStatus;
  readonly findings: readonly H07HmcProofProjectionFinding[];
  readonly projection: H07HmcDerivedProofProjection;
  readonly cannot_claim: readonly string[];
}

export interface H07HmcProofProjectionFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H07HmcDerivedProofProjection {
  readonly id: string;
  readonly boxId: string;
  readonly authority: "derived_view_only";
  readonly maturity: H07HmcProofProjectionMaturity;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly productSha: string;
  readonly treeHash: string;
  readonly proofProjectionHash: string;
  readonly proofSummary: {
    readonly total: number;
    readonly verified: number;
    readonly blocked: number;
    readonly nonOperational: number;
    readonly staleOrMissing: number;
  };
  readonly blockedClaimCount: number;
  readonly prerequisiteSummary: {
    readonly total: number;
    readonly closeoutComplete: number;
    readonly evidenceVerified: number;
    readonly terminalLearningComplete: number;
  };
}

const SHA40_PATTERN = /^[a-f0-9]{40}$/u;
const ALLOWED_MATURITY = new Set<H07HmcProofProjectionMaturity>(["mocked", "fixture_backed"]);
const FUTURE_OPERATIONAL_LEVELS = new Set(["P8", "P9"]);

export function deriveH07HmcProofProjection(
  config: H07HmcProofProjectionConfig
): H07HmcProofProjectionReport {
  const findings: H07HmcProofProjectionFinding[] = [];

  validateAuthority(config, findings);
  validateMaturity(config.maturity, config.projectionId, findings);
  validateMaturity(config.box.maturity, `box:${config.box.id}`, findings);
  validateShas(config, findings);
  validateFreshness(config, findings);
  validateProofLevels(config, findings);
  validatePrerequisites(config, findings);
  validateClaimBoundaries(config, findings);
  validateCannotClaim(config, findings);

  const projection: H07HmcDerivedProofProjection = {
    id: config.projectionId,
    boxId: config.boxId,
    authority: config.authority,
    maturity: config.maturity,
    freshness: config.freshness,
    productSha: config.productSha,
    treeHash: config.treeHash,
    proofProjectionHash: hashJson({
      box: config.box,
      proofLevels: config.proofLevels,
      blockedClaims: config.blockedClaims,
      prerequisites: config.prerequisiteCloseouts
    }),
    proofSummary: {
      total: config.proofLevels.length,
      verified: config.proofLevels.filter((proof) => proof.status === "verified").length,
      blocked: config.proofLevels.filter((proof) => proof.status === "blocked").length,
      nonOperational: config.proofLevels.filter((proof) => proof.status === "non_operational").length,
      staleOrMissing: config.proofLevels.filter(
        (proof) => proof.freshness !== "fresh" || proof.evidenceStatus === "missing" || proof.evidenceStatus === "stale"
      ).length
    },
    blockedClaimCount: config.blockedClaims.length,
    prerequisiteSummary: {
      total: config.prerequisiteCloseouts.length,
      closeoutComplete: config.prerequisiteCloseouts.filter(
        (prerequisite) => prerequisite.closeoutStatus === "closeout_complete"
      ).length,
      evidenceVerified: config.prerequisiteCloseouts.filter((prerequisite) => prerequisite.evidenceStatus === "verified")
        .length,
      terminalLearningComplete: config.prerequisiteCloseouts.filter(
        (prerequisite) => prerequisite.terminalLearningStatus === "complete"
      ).length
    }
  };

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    projection,
    cannot_claim: [...config.cannotClaim]
  };
}

function validateAuthority(
  config: H07HmcProofProjectionConfig,
  findings: H07HmcProofProjectionFinding[]
): void {
  if (config.authority !== "derived_view_only" || config.claimAuthority === true) {
    findings.push({
      kind: "h07_proof_projection_claims_authority",
      ref: config.projectionId,
      expected: "derived_view_only",
      actual: config.authority
    });
  }
}

function validateMaturity(
  maturity: H07HmcProofProjectionMaturity,
  ref: string,
  findings: H07HmcProofProjectionFinding[]
): void {
  if (!ALLOWED_MATURITY.has(maturity)) {
    findings.push({
      kind: "h07_proof_projection_maturity_overclaim",
      ref,
      expected: "fixture_backed_or_mocked",
      actual: maturity
    });
  }
}

function validateShas(
  config: H07HmcProofProjectionConfig,
  findings: H07HmcProofProjectionFinding[]
): void {
  if (!SHA40_PATTERN.test(config.productSha)) {
    findings.push({ kind: "invalid_product_sha", ref: "productSha", expected: "40 hex", actual: config.productSha });
  }
  if (!SHA40_PATTERN.test(config.treeHash)) {
    findings.push({ kind: "invalid_tree_hash", ref: "treeHash", expected: "40 hex", actual: config.treeHash });
  }
}

function validateFreshness(
  config: H07HmcProofProjectionConfig,
  findings: H07HmcProofProjectionFinding[]
): void {
  if (config.freshness !== "fresh") {
    findings.push({
      kind: "h07_proof_projection_not_fresh",
      ref: config.projectionId,
      expected: "fresh",
      actual: config.freshness
    });
  }
}

function validateProofLevels(
  config: H07HmcProofProjectionConfig,
  findings: H07HmcProofProjectionFinding[]
): void {
  for (const proof of config.proofLevels) {
    validateMaturity(proof.maturity, `proof:${proof.level}`, findings);
    if (proof.required === true && proof.evidenceStatus !== "verified") {
      findings.push({
        kind: "h07_required_proof_evidence_not_verified",
        ref: `proof:${proof.level}`,
        expected: "verified",
        actual: proof.evidenceStatus
      });
    }
    if (proof.required === true && proof.negativeProofStatus !== "verified") {
      findings.push({
        kind: "h07_required_negative_proof_not_verified",
        ref: `proof:${proof.level}`,
        expected: "verified",
        actual: proof.negativeProofStatus
      });
    }
    if (proof.freshness !== "fresh") {
      findings.push({
        kind: "h07_proof_level_not_fresh",
        ref: `proof:${proof.level}`,
        expected: "fresh",
        actual: proof.freshness
      });
    }
    if (FUTURE_OPERATIONAL_LEVELS.has(proof.level) && proof.status === "operational") {
      findings.push({
        kind: "h07_future_proof_level_operational_overclaim",
        ref: `proof:${proof.level}`,
        expected: "non_operational_or_blocked",
        actual: proof.status
      });
    }
  }
}

function validatePrerequisites(
  config: H07HmcProofProjectionConfig,
  findings: H07HmcProofProjectionFinding[]
): void {
  for (const prerequisite of config.prerequisiteCloseouts) {
    if (
      prerequisite.closeoutStatus === "closeout_complete" &&
      prerequisite.evidenceStatus === "verified" &&
      prerequisite.terminalLearningStatus === "complete"
    ) {
      continue;
    }
    findings.push({
      kind: "h07_prerequisite_not_closeout_complete",
      ref: `h07_prerequisite:${prerequisite.id}`,
      expected: "closeout_complete/verified/complete",
      actual: `${prerequisite.closeoutStatus}/${prerequisite.evidenceStatus}/${prerequisite.terminalLearningStatus}`
    });
  }
}

function validateClaimBoundaries(
  config: H07HmcProofProjectionConfig,
  findings: H07HmcProofProjectionFinding[]
): void {
  const claimChecks: readonly [boolean | undefined, string, string][] = [
    [config.claimP8Operational, "h07_p8_operational_overclaim", "release_proof_complete"],
    [config.claimP9Operational, "h07_p9_operational_overclaim", "production_proof_complete"],
    [config.claimReleaseReady, "h07_release_ready_overclaim", "release_candidate"],
    [config.claimProductionReady, "h07_production_ready_overclaim", "production_ready"],
    [config.claimMechanicalIndependence, "h07_mechanical_independence_overclaim", "mechanically_independent_audit"],
    [config.claimH12Assurance, "h07_h12_assurance_overclaim", "H12_box_assurance_engine_implemented"]
  ];
  for (const [enabled, kind, ref] of claimChecks) {
    if (enabled !== true) continue;
    findings.push({ kind, ref, expected: "cannot_claim_preserved", actual: "claimed" });
  }
}

function validateCannotClaim(
  config: H07HmcProofProjectionConfig,
  findings: H07HmcProofProjectionFinding[]
): void {
  for (const cannotClaim of config.requiredCannotClaim) {
    if (config.cannotClaim.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_required_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`
    });
  }
  for (const blockedClaim of config.blockedClaims) {
    if (config.cannotClaim.includes(blockedClaim.cannotClaim)) continue;
    findings.push({
      kind: "blocked_claim_missing_cannot_claim",
      ref: `claim:${blockedClaim.claimId}`,
      expected: blockedClaim.cannotClaim
    });
  }
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
