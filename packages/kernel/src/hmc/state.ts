export type HmcStateStatus = "passed" | "failed";
export type HmcMaturity =
  | "mocked"
  | "fixture_backed"
  | "api_backed"
  | "persistent"
  | "production_connected";

export interface HmcStateConfig {
  readonly project: HmcProjectInput;
  readonly boxes: readonly HmcBoxInput[];
  readonly ffets: readonly HmcFfetInput[];
  readonly quality: readonly HmcQualityInput[];
  readonly evidence: readonly HmcEvidenceInput[];
  readonly decisions: readonly HmcDecisionInput[];
  readonly h03Projection?: HmcH03ProjectionInput;
  readonly h04Projection?: HmcH04ProjectionInput;
  readonly h05Projection?: HmcH05ProjectionInput;
  readonly git?: HmcGitTruthInput;
  readonly github?: HmcGitHubTruthInput;
  readonly generatedState?: readonly HmcGeneratedStateInput[];
  readonly classifiedMismatches?: readonly HmcClassifiedMismatchInput[];
  readonly productionConnectionVerified?: boolean;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface HmcProjectInput {
  readonly id: string;
  readonly name: string;
  readonly posture: string;
  readonly maturity: HmcMaturity;
}

export interface HmcBoxInput {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly debt?: readonly string[];
}

export interface HmcFfetInput {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
}

export interface HmcQualityInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly cannotClaim?: readonly string[];
}

export interface HmcEvidenceInput {
  readonly id: string;
  readonly status: "verified" | "missing" | "stale" | "conflict";
  readonly maturity: HmcMaturity;
  readonly required?: boolean;
}

export interface HmcDecisionInput {
  readonly id: string;
  readonly status: "ready" | "blocked" | "empty";
  readonly maturity: HmcMaturity;
}

export interface HmcGitTruthInput {
  readonly expectedMainSha?: string;
  readonly actualMainSha?: string;
  readonly originMainSha?: string;
}

export interface HmcGitHubTruthInput {
  readonly openPullRequests?: number;
  readonly currentHeadSha?: string;
  readonly expectedHeadSha?: string;
}

export interface HmcGeneratedStateInput {
  readonly id: string;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly claimsAuthority?: boolean;
  readonly maturity: HmcMaturity;
}

export interface HmcH03ProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly authority: "derived_view_only";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly claimsAuthority?: boolean;
  readonly compilerStages: readonly HmcH03CompilerStageInput[];
  readonly deliveryConstitution: HmcH03DeliveryConstitutionProjectionInput;
  readonly continuation: HmcH03ContinuationProjectionInput;
}

export interface HmcH03CompilerStageInput {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly closeoutStatus?: "not_applicable" | "pending" | "closeout_complete";
}

export interface HmcH03DeliveryConstitutionProjectionInput {
  readonly readinessStatus: "not_ready" | "boundary_verified" | "ready_for_human_ratification";
  readonly approvalStatus: "for_human_review" | "approved" | "rejected";
  readonly executionAuthorized: boolean;
  readonly humanRatificationRequired: boolean;
  readonly maturity: HmcMaturity;
  readonly constitutionHash?: string;
  readonly readinessEvidenceVerified?: boolean;
}

export interface HmcH03ContinuationProjectionInput {
  readonly status: "not_authorized" | "draft_only";
  readonly h04H05H06ExecutionAuthorized: boolean;
  readonly maturity: HmcMaturity;
}

export interface HmcH04ProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly authority: "derived_view_only";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly claimsAuthority?: boolean;
  readonly box: HmcH04BoxProjectionInput;
  readonly ffets: readonly HmcH04FfetProjectionInput[];
  readonly truthLedger: HmcH04TruthLedgerProjectionInput;
  readonly finalizer: HmcH04FinalizerProjectionInput;
}

export interface HmcH04BoxProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly assuranceStatus: "not_started" | "pending" | "in_progress" | "complete";
}

export interface HmcH04FfetProjectionInput {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly truthSource: "fixture" | "verified_evidence" | "generated" | "unknown";
  readonly closeoutStatus?: "not_applicable" | "pending" | "closeout_complete";
  readonly freshness?: "fresh" | "stale" | "missing" | "conflict";
}

export interface HmcH04TruthLedgerProjectionInput {
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly authority: "derived_view_only";
  readonly eventCount: number;
  readonly freshness: "fresh" | "stale" | "unknown";
}

export interface HmcH04FinalizerProjectionInput {
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly successorGate: "not_ready" | "conditional_go" | "go";
  readonly blockingDebt: readonly string[];
}

export interface HmcH05ProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly authority: "derived_view_only";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly claimsAuthority?: boolean;
  readonly box: HmcH05BoxProjectionInput;
  readonly agents: readonly HmcH05AgentProjectionInput[];
  readonly prerequisiteCloseouts: readonly HmcH05PrerequisiteProjectionInput[];
  readonly claimStableAgents?: boolean;
  readonly claimMechanicalIndependence?: boolean;
  readonly claimRuntimeEnforcement?: boolean;
  readonly claimLiveAdapter?: boolean;
  readonly claimPersistence?: boolean;
}

export interface HmcH05BoxProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly assuranceStatus: "not_started" | "pending" | "in_progress" | "complete";
}

export interface HmcH05AgentProjectionInput {
  readonly agentId: string;
  readonly title: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly qualificationStatus: string;
  readonly boundedUseStatus: string;
  readonly registryStatus: "verified" | "missing" | "stale" | "conflict";
  readonly capabilityStatus: "verified" | "missing" | "stale" | "conflict";
  readonly circuitBreakerStatus: "verified" | "missing" | "stale" | "conflict" | "runtime_enforced";
  readonly upskillStatus: "verified" | "missing" | "stale" | "conflict" | "runtime_enforced";
  readonly truthSource: "fixture" | "verified_evidence" | "generated" | "unknown";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
}

export interface HmcH05PrerequisiteProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly closeoutStatus: "not_applicable" | "pending" | "closeout_complete";
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict";
  readonly terminalLearningStatus: "complete" | "missing" | "stale" | "conflict";
}

export interface HmcClassifiedMismatchInput {
  readonly kind: string;
  readonly ref: string;
  readonly classification: "stale" | "missing" | "incomplete" | "conflict";
  readonly detail: string;
}

export interface HmcStateReport {
  readonly status: HmcStateStatus;
  readonly findings: readonly HmcStateFinding[];
  readonly classified_mismatches: readonly HmcClassifiedMismatch[];
  readonly verified_refs: readonly HmcVerifiedRef[];
  readonly view: HmcDerivedView;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface HmcStateFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface HmcClassifiedMismatch {
  readonly kind: string;
  readonly ref: string;
  readonly classification: "stale" | "missing" | "incomplete" | "conflict";
  readonly detail: string;
}

export interface HmcVerifiedRef {
  readonly ref: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
}

export interface HmcDerivedView {
  readonly project: HmcProjectInput;
  readonly boxes: readonly HmcBoxInput[];
  readonly ffets: readonly HmcFfetInput[];
  readonly quality: readonly HmcQualityInput[];
  readonly evidence: readonly HmcEvidenceInput[];
  readonly decisions: readonly HmcDecisionInput[];
  readonly h03Projection?: HmcH03ProjectionInput;
  readonly h04Projection?: HmcH04ProjectionInput;
  readonly h05Projection?: HmcH05ProjectionInput;
  readonly truthPrecedence: readonly string[];
  readonly maturitySummary: Record<HmcMaturity, number>;
}

const MATURITY_VALUES: readonly HmcMaturity[] = [
  "mocked",
  "fixture_backed",
  "api_backed",
  "persistent",
  "production_connected"
];
const MATURITY_SET = new Set(MATURITY_VALUES);
const PRIVATE_PATH_PATTERNS: readonly RegExp[] = [
  /\/Volumes\/[^\s"'`<>)\]}]+/iu,
  /\/Users\/[^\s"'`<>)\]}]+/iu,
  /file:\/\/\/?(Users|Volumes)\//iu,
  /\binput:\/\/[^\s"'`<>)\]}]+/iu
];
const STABLE_AGENT_PATTERN = /\bstable(?:[_\s-]+agent|[_\s-]+agents)?\b|^stable$/iu;
const MECHANICAL_INDEPENDENCE_PATTERN =
  /\b(?:mechanically[_\s-]+independent|independent[_\s-]+quality[_\s-]+auditor|independent[_\s-]+process)(?:\b|[_\s-])/iu;

export function deriveHmcStateConfig(config: HmcStateConfig): HmcStateReport {
  const findings: HmcStateFinding[] = [];
  const classified = [...(config.classifiedMismatches ?? [])];

  scanPrivateValues(config, findings);
  validateMaturity("project", config.project.maturity, config, findings);
  validateCollection("box", config.boxes, config, findings);
  validateCollection("ffet", config.ffets, config, findings);
  validateCollection("quality", config.quality, config, findings);
  validateCollection("evidence", config.evidence, config, findings);
  validateCollection("decision", config.decisions, config, findings);
  validateGitTruth(config, classified, findings);
  validateGitHubTruth(config, classified, findings);
  validateEvidence(config, classified, findings);
  validateGeneratedState(config, classified, findings);
  validateH03Projection(config, classified, findings);
  validateH04Projection(config, classified, findings);
  validateH05Projection(config, classified, findings);

  const verifiedRefs: HmcVerifiedRef[] = [
    ...config.boxes.map((box) => ({ ref: `box:${box.id}`, status: box.status, maturity: box.maturity })),
    ...config.ffets.map((ffet) => ({ ref: `ffet:${ffet.id}`, status: ffet.status, maturity: ffet.maturity })),
    ...config.evidence.map((evidence) => ({
      ref: `evidence:${evidence.id}`,
      status: evidence.status,
      maturity: evidence.maturity
    })),
    ...h03VerifiedRefs(config.h03Projection),
    ...h04VerifiedRefs(config.h04Projection),
    ...h05VerifiedRefs(config.h05Projection)
  ];

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: classified,
    verified_refs: verifiedRefs,
    view: {
      project: config.project,
      boxes: config.boxes,
      ffets: config.ffets,
      quality: config.quality,
      evidence: config.evidence,
      decisions: config.decisions,
      truthPrecedence: [
        "verified_git_github_truth",
        "verified_evidence_closeout_records",
        "accepted_control_authority",
        "fresh_runtime_state",
        "generated_ui_state",
        "fixtures_and_mocks"
      ],
      maturitySummary: summarizeMaturity(config),
      ...(config.h03Projection ? { h03Projection: config.h03Projection } : {}),
      ...(config.h04Projection ? { h04Projection: config.h04Projection } : {}),
      ...(config.h05Projection ? { h05Projection: config.h05Projection } : {})
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function validateCollection(
  kind: string,
  values: readonly { readonly id: string; readonly maturity: HmcMaturity }[],
  config: HmcStateConfig,
  findings: HmcStateFinding[]
): void {
  for (const value of values) {
    validateMaturity(`${kind}:${value.id}`, value.maturity, config, findings);
  }
}

function validateMaturity(
  ref: string,
  maturity: HmcMaturity,
  config: HmcStateConfig,
  findings: HmcStateFinding[]
): void {
  if (!MATURITY_SET.has(maturity)) {
    findings.push({ kind: "invalid_maturity", ref, actual: maturity });
    return;
  }
  if (maturity === "production_connected" && config.productionConnectionVerified !== true) {
    findings.push({
      kind: "production_connected_without_proof",
      ref,
      expected: "productionConnectionVerified=true",
      actual: "missing"
    });
  }
}

function validateGitTruth(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const git = config.git;
  if (!git?.expectedMainSha) return;
  if (git.actualMainSha && git.actualMainSha !== git.expectedMainSha) {
    requireClassification("git_main_sha_mismatch", "git:main", classified, findings, {
      expected: git.expectedMainSha,
      actual: git.actualMainSha
    });
  }
  if (git.originMainSha && git.originMainSha !== git.expectedMainSha) {
    requireClassification("git_origin_main_sha_mismatch", "git:origin/main", classified, findings, {
      expected: git.expectedMainSha,
      actual: git.originMainSha
    });
  }
}

function validateGitHubTruth(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const github = config.github;
  if (!github?.expectedHeadSha || !github.currentHeadSha) return;
  if (github.currentHeadSha !== github.expectedHeadSha) {
    requireClassification("github_head_sha_mismatch", "github:head", classified, findings, {
      expected: github.expectedHeadSha,
      actual: github.currentHeadSha
    });
  }
}

function validateEvidence(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  for (const evidence of config.evidence) {
    if (evidence.required !== true || evidence.status === "verified") continue;
    requireClassification("required_evidence_not_verified", `evidence:${evidence.id}`, classified, findings, {
      expected: "verified",
      actual: evidence.status
    });
  }
}

function validateGeneratedState(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  for (const state of config.generatedState ?? []) {
    validateMaturity(`generated:${state.id}`, state.maturity, config, findings);
    if (state.claimsAuthority === true) {
      findings.push({
        kind: "generated_state_claims_authority",
        ref: `generated:${state.id}`,
        detail: "Generated state cannot override verified Git/GitHub/Control/Evidence truth."
      });
    }
    if (state.freshness !== "fresh") {
      requireClassification(
        "generated_state_not_fresh",
        `generated:${state.id}`,
        classified,
        findings,
        { expected: "fresh", actual: state.freshness }
      );
    }
  }
}

function validateH03Projection(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const projection = config.h03Projection;
  if (!projection) return;

  validateMaturity(`h03:${projection.id}`, projection.maturity, config, findings);
  for (const stage of projection.compilerStages) {
    validateMaturity(`h03_stage:${stage.id}`, stage.maturity, config, findings);
  }
  validateMaturity("h03:delivery_constitution", projection.deliveryConstitution.maturity, config, findings);
  validateMaturity("h03:continuation", projection.continuation.maturity, config, findings);

  if (projection.authority !== "derived_view_only" || projection.claimsAuthority === true) {
    findings.push({
      kind: "h03_projection_claims_authority",
      ref: `h03:${projection.id}`,
      detail: "HMC may project H03 state, but cannot create lifecycle authority."
    });
  }

  if (projection.freshness !== "fresh") {
    requireClassification("h03_projection_not_fresh", `h03:${projection.id}`, classified, findings, {
      expected: "fresh",
      actual: projection.freshness
    });
  }

  if (projection.deliveryConstitution.approvalStatus !== "for_human_review") {
    findings.push({
      kind: "h03_constitution_approval_overclaim",
      ref: "h03:delivery_constitution",
      expected: "for_human_review",
      actual: projection.deliveryConstitution.approvalStatus
    });
  }

  if (projection.deliveryConstitution.executionAuthorized !== false) {
    findings.push({
      kind: "h03_execution_authorization_overclaim",
      ref: "h03:delivery_constitution",
      expected: "false",
      actual: String(projection.deliveryConstitution.executionAuthorized)
    });
  }

  if (projection.deliveryConstitution.humanRatificationRequired !== true) {
    findings.push({
      kind: "h03_human_ratification_not_required",
      ref: "h03:delivery_constitution",
      expected: "true",
      actual: String(projection.deliveryConstitution.humanRatificationRequired)
    });
  }

  if (
    projection.deliveryConstitution.readinessStatus === "ready_for_human_ratification" &&
    projection.deliveryConstitution.readinessEvidenceVerified !== true
  ) {
    findings.push({
      kind: "h03_readiness_claim_without_evidence",
      ref: "h03:delivery_constitution",
      expected: "readinessEvidenceVerified=true",
      actual: "missing"
    });
  }

  if (projection.continuation.h04H05H06ExecutionAuthorized !== false) {
    findings.push({
      kind: "h04_h06_execution_authorization_overclaim",
      ref: "h03:continuation",
      expected: "false",
      actual: String(projection.continuation.h04H05H06ExecutionAuthorized)
    });
  }

  for (const cannotClaim of [
    "HMC_authoritative_state",
    "live_h03_control_adapter_implemented",
    "constitution_approved_by_human",
    "execution_authorization_granted",
    "h04_h05_h06_execution_authorized"
  ]) {
    if (config.cannotClaim?.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_h03_projection_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`,
      detail: "H03 HMC projection must preserve precise cannot_claim boundaries."
    });
  }
}

function validateH04Projection(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const projection = config.h04Projection;
  if (!projection) return;

  validateMaturity(`h04:${projection.id}`, projection.maturity, config, findings);
  validateMaturity(`h04_box:${projection.box.id}`, projection.box.maturity, config, findings);
  validateMaturity("h04:truth_ledger", projection.truthLedger.maturity, config, findings);
  validateMaturity("h04:finalizer", projection.finalizer.maturity, config, findings);
  for (const ffet of projection.ffets) {
    validateMaturity(`h04_ffet:${ffet.id}`, ffet.maturity, config, findings);
  }

  if (projection.authority !== "derived_view_only" || projection.claimsAuthority === true) {
    findings.push({
      kind: "h04_projection_claims_authority",
      ref: `h04:${projection.id}`,
      detail: "HMC may project H04 lifecycle state, but cannot create lifecycle authority."
    });
  }

  if (projection.truthLedger.authority !== "derived_view_only") {
    findings.push({
      kind: "h04_truth_ledger_projection_claims_authority",
      ref: "h04:truth_ledger",
      detail: "Projected Truth Ledger state remains a derived HMC view."
    });
  }

  if (projection.freshness !== "fresh") {
    requireClassification("h04_projection_not_fresh", `h04:${projection.id}`, classified, findings, {
      expected: "fresh",
      actual: projection.freshness
    });
  }

  if (projection.truthLedger.freshness !== "fresh") {
    requireClassification("h04_truth_ledger_not_fresh", "h04:truth_ledger", classified, findings, {
      expected: "fresh",
      actual: projection.truthLedger.freshness
    });
  }

  if (projection.maturity === "api_backed" || projection.maturity === "persistent" || projection.maturity === "production_connected") {
    findings.push({
      kind: "h04_projection_maturity_overclaim",
      ref: `h04:${projection.id}`,
      expected: "fixture_backed",
      actual: projection.maturity
    });
  }

  for (const ffet of projection.ffets) {
    if (ffet.closeoutStatus === "closeout_complete" && ffet.status !== "closeout_complete") {
      findings.push({
        kind: "h04_ffet_closeout_status_conflict",
        ref: `h04_ffet:${ffet.id}`,
        expected: "closeout_complete",
        actual: ffet.status
      });
    }
    if (ffet.freshness && ffet.freshness !== "fresh") {
      requireClassification("h04_ffet_not_fresh", `h04_ffet:${ffet.id}`, classified, findings, {
        expected: "fresh",
        actual: ffet.freshness
      });
    }
  }

  if (projection.finalizer.successorGate === "go" && projection.finalizer.blockingDebt.length > 0) {
    findings.push({
      kind: "h04_finalizer_go_with_blocking_debt",
      ref: "h04:finalizer",
      expected: "no blocking debt",
      actual: projection.finalizer.blockingDebt.join(",")
    });
  }

  for (const cannotClaim of [
    "HMC_authoritative_state",
    "live_github_adapter_implemented",
    "persistent_state_store_implemented",
    "h04_assurance_complete",
    "h04_fully_implemented"
  ]) {
    if (config.cannotClaim?.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_h04_projection_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`,
      detail: "H04 HMC projection must preserve precise cannot_claim boundaries."
    });
  }
}

function validateH05Projection(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const projection = config.h05Projection;
  if (!projection) return;

  validateMaturity(`h05:${projection.id}`, projection.maturity, config, findings);
  validateMaturity(`h05_box:${projection.box.id}`, projection.box.maturity, config, findings);
  for (const agent of projection.agents) {
    validateMaturity(`h05_agent:${agent.agentId}`, agent.maturity, config, findings);
  }

  if (projection.authority !== "derived_view_only" || projection.claimsAuthority === true) {
    findings.push({
      kind: "h05_projection_claims_authority",
      ref: `h05:${projection.id}`,
      detail: "HMC may project H05 agent state, but cannot create agent authority."
    });
  }

  if (projection.freshness !== "fresh") {
    requireClassification("h05_projection_not_fresh", `h05:${projection.id}`, classified, findings, {
      expected: "fresh",
      actual: projection.freshness
    });
  }

  if (projection.maturity === "api_backed" || projection.maturity === "persistent" || projection.maturity === "production_connected") {
    findings.push({
      kind: "h05_projection_maturity_overclaim",
      ref: `h05:${projection.id}`,
      expected: "fixture_backed",
      actual: projection.maturity
    });
  }

  for (const prerequisite of projection.prerequisiteCloseouts) {
    if (
      prerequisite.closeoutStatus !== "closeout_complete" ||
      prerequisite.evidenceStatus !== "verified" ||
      prerequisite.terminalLearningStatus !== "complete"
    ) {
      findings.push({
        kind: "h05_prerequisite_not_closeout_complete",
        ref: `h05_prerequisite:${prerequisite.id}`,
        expected: "closeout_complete/verified/complete",
        actual: `${prerequisite.closeoutStatus}/${prerequisite.evidenceStatus}/${prerequisite.terminalLearningStatus}`
      });
    }
  }

  for (const agent of projection.agents) {
    if (agent.freshness !== "fresh") {
      requireClassification("h05_agent_projection_not_fresh", `h05_agent:${agent.agentId}`, classified, findings, {
        expected: "fresh",
        actual: agent.freshness
      });
    }
    if (agent.registryStatus !== "verified") {
      findings.push({
        kind: "h05_agent_registry_not_verified",
        ref: `h05_agent:${agent.agentId}`,
        expected: "verified",
        actual: agent.registryStatus
      });
    }
    if (agent.capabilityStatus !== "verified") {
      findings.push({
        kind: "h05_agent_capability_not_verified",
        ref: `h05_agent:${agent.agentId}`,
        expected: "verified",
        actual: agent.capabilityStatus
      });
    }
    if (agent.circuitBreakerStatus !== "verified") {
      findings.push({
        kind:
          agent.circuitBreakerStatus === "runtime_enforced"
            ? "h05_runtime_circuit_breaker_enforcement_overclaim"
            : "h05_agent_circuit_breaker_not_verified",
        ref: `h05_agent:${agent.agentId}`,
        expected: "verified",
        actual: agent.circuitBreakerStatus
      });
    }
    if (agent.upskillStatus !== "verified") {
      findings.push({
        kind:
          agent.upskillStatus === "runtime_enforced"
            ? "h05_runtime_upskill_enforcement_overclaim"
            : "h05_agent_upskill_not_verified",
        ref: `h05_agent:${agent.agentId}`,
        expected: "verified",
        actual: agent.upskillStatus
      });
    }
    if (STABLE_AGENT_PATTERN.test(agent.status) || STABLE_AGENT_PATTERN.test(agent.qualificationStatus)) {
      findings.push({
        kind: "h05_stable_agent_projection_overclaim",
        ref: `h05_agent:${agent.agentId}`,
        expected: "fixture_tested_or_bounded",
        actual: `${agent.status}/${agent.qualificationStatus}`
      });
    }
    if (MECHANICAL_INDEPENDENCE_PATTERN.test(agent.status) || MECHANICAL_INDEPENDENCE_PATTERN.test(agent.qualificationStatus)) {
      findings.push({
        kind: "h05_mechanical_independence_projection_overclaim",
        ref: `h05_agent:${agent.agentId}`,
        expected: "cannot_claim_preserved",
        actual: `${agent.status}/${agent.qualificationStatus}`
      });
    }
  }

  const claimChecks: readonly [boolean | undefined, string, string][] = [
    [projection.claimStableAgents, "h05_stable_agent_projection_overclaim", "stable_agents"],
    [projection.claimMechanicalIndependence, "h05_mechanical_independence_projection_overclaim", "mechanically_independent_agents"],
    [projection.claimRuntimeEnforcement, "h05_runtime_enforcement_projection_overclaim", "runtime_enforcement"],
    [projection.claimLiveAdapter, "h05_live_adapter_overclaim", "live_github_adapter_implemented"],
    [projection.claimPersistence, "h05_persistence_overclaim", "persistent_state_store_implemented"]
  ];
  for (const [enabled, kind, ref] of claimChecks) {
    if (enabled !== true) continue;
    findings.push({ kind, ref, expected: "cannot_claim_preserved", actual: "claimed" });
  }

  for (const cannotClaim of [
    "stable_agents",
    "mechanically_independent_agents",
    "independent_quality_auditor_qualified",
    "runtime_circuit_breaker_enforcement",
    "runtime_upskill_enforcement",
    "HMC_authoritative_state",
    "live_github_adapter_implemented",
    "persistent_state_store_implemented"
  ]) {
    if (config.cannotClaim?.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_h05_projection_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`,
      detail: "H05 HMC agent projection must preserve precise cannot_claim boundaries."
    });
  }
}

function h03VerifiedRefs(projection: HmcH03ProjectionInput | undefined): HmcVerifiedRef[] {
  if (!projection) return [];
  return [
    {
      ref: `h03:${projection.id}`,
      status: projection.status,
      maturity: projection.maturity
    },
    ...projection.compilerStages.map((stage) => ({
      ref: `h03_stage:${stage.id}`,
      status: stage.status,
      maturity: stage.maturity
    })),
    {
      ref: "h03:delivery_constitution",
      status: projection.deliveryConstitution.readinessStatus,
      maturity: projection.deliveryConstitution.maturity
    },
    {
      ref: "h03:continuation",
      status: projection.continuation.status,
      maturity: projection.continuation.maturity
    }
  ];
}

function h04VerifiedRefs(projection: HmcH04ProjectionInput | undefined): HmcVerifiedRef[] {
  if (!projection) return [];
  return [
    {
      ref: `h04:${projection.id}`,
      status: projection.status,
      maturity: projection.maturity
    },
    {
      ref: `h04_box:${projection.box.id}`,
      status: projection.box.status,
      maturity: projection.box.maturity
    },
    ...projection.ffets.map((ffet) => ({
      ref: `h04_ffet:${ffet.id}`,
      status: ffet.status,
      maturity: ffet.maturity
    })),
    {
      ref: "h04:truth_ledger",
      status: projection.truthLedger.status,
      maturity: projection.truthLedger.maturity
    },
    {
      ref: "h04:finalizer",
      status: projection.finalizer.status,
      maturity: projection.finalizer.maturity
    }
  ];
}

function h05VerifiedRefs(projection: HmcH05ProjectionInput | undefined): HmcVerifiedRef[] {
  if (!projection) return [];
  return [
    {
      ref: `h05:${projection.id}`,
      status: projection.status,
      maturity: projection.maturity
    },
    {
      ref: `h05_box:${projection.box.id}`,
      status: projection.box.status,
      maturity: projection.box.maturity
    },
    ...projection.agents.map((agent) => ({
      ref: `h05_agent:${agent.agentId}`,
      status: agent.status,
      maturity: agent.maturity
    })),
    ...projection.prerequisiteCloseouts.map((prerequisite) => ({
      ref: `h05_prerequisite:${prerequisite.id}`,
      status: prerequisite.closeoutStatus,
      maturity: projection.maturity
    }))
  ];
}

function requireClassification(
  kind: string,
  ref: string,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[],
  detail: Pick<HmcStateFinding, "expected" | "actual">
): void {
  if (classified.some((mismatch) => mismatch.kind === kind && mismatch.ref === ref)) return;
  findings.push({
    kind: "unclassified_state_mismatch",
    ref,
    detail: kind,
    ...detail
  });
}

function scanPrivateValues(value: unknown, findings: HmcStateFinding[], path = "config"): void {
  if (typeof value === "string") {
    for (const pattern of PRIVATE_PATH_PATTERNS) {
      if (pattern.test(value)) {
        findings.push({
          kind: "private_or_forbidden_path_in_state_config",
          ref: path,
          detail: String(pattern)
        });
      }
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPrivateValues(item, findings, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    scanPrivateValues(nested, findings, `${path}.${key}`);
  }
}

function summarizeMaturity(config: HmcStateConfig): Record<HmcMaturity, number> {
  const summary = Object.fromEntries(MATURITY_VALUES.map((maturity) => [maturity, 0])) as Record<HmcMaturity, number>;
  for (const maturity of [
    config.project.maturity,
    ...config.boxes.map((box) => box.maturity),
    ...config.ffets.map((ffet) => ffet.maturity),
    ...config.quality.map((quality) => quality.maturity),
    ...config.evidence.map((evidence) => evidence.maturity),
    ...config.decisions.map((decision) => decision.maturity),
    ...h03Maturities(config.h03Projection),
    ...h04Maturities(config.h04Projection),
    ...h05Maturities(config.h05Projection),
    ...(config.generatedState ?? []).map((state) => state.maturity)
  ]) {
    summary[maturity] += 1;
  }
  return summary;
}

function h04Maturities(projection: HmcH04ProjectionInput | undefined): HmcMaturity[] {
  if (!projection) return [];
  return [
    projection.maturity,
    projection.box.maturity,
    ...projection.ffets.map((ffet) => ffet.maturity),
    projection.truthLedger.maturity,
    projection.finalizer.maturity
  ];
}

function h05Maturities(projection: HmcH05ProjectionInput | undefined): HmcMaturity[] {
  if (!projection) return [];
  return [
    projection.maturity,
    projection.box.maturity,
    ...projection.agents.map((agent) => agent.maturity)
  ];
}

function h03Maturities(projection: HmcH03ProjectionInput | undefined): HmcMaturity[] {
  if (!projection) return [];
  return [
    projection.maturity,
    ...projection.compilerStages.map((stage) => stage.maturity),
    projection.deliveryConstitution.maturity,
    projection.continuation.maturity
  ];
}
