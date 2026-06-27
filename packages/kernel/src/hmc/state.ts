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
  readonly h06Projection?: HmcH06ProjectionInput;
  readonly h07Projection?: HmcH07ProjectionInput;
  readonly h08Projection?: HmcH08ProjectionInput;
  readonly h09Projection?: HmcH09ProjectionInput;
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

export interface HmcH06ProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly authority: "derived_view_only";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly claimsAuthority?: boolean;
  readonly box: HmcH06BoxProjectionInput;
  readonly runtime: HmcH06RuntimeProjectionInput;
  readonly worktrees: readonly HmcH06RuntimeRefProjectionInput[];
  readonly locks: readonly HmcH06RuntimeRefProjectionInput[];
  readonly checkpoints: readonly HmcH06RuntimeRefProjectionInput[];
  readonly quarantines: readonly HmcH06RuntimeRefProjectionInput[];
  readonly pods: readonly HmcH06RuntimeRefProjectionInput[];
  readonly runner: HmcH06RunnerProjectionInput;
  readonly prerequisiteCloseouts: readonly HmcH06PrerequisiteProjectionInput[];
  readonly claimLiveRuntime?: boolean;
  readonly claimPersistence?: boolean;
  readonly claimH08Conductor?: boolean;
  readonly claimMechanicalIndependence?: boolean;
  readonly claimProductionOrchestration?: boolean;
}

export interface HmcH06BoxProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly assuranceStatus: "not_started" | "pending" | "in_progress" | "complete";
}

export interface HmcH06RuntimeProjectionInput {
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly layoutStatus: "verified" | "missing" | "stale" | "conflict";
  readonly recordStatus: "verified" | "missing" | "stale" | "conflict";
  readonly cleanupStatus: "verified" | "missing" | "stale" | "conflict";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
}

export interface HmcH06RuntimeRefProjectionInput {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict";
  readonly truthSource: "fixture" | "verified_evidence" | "generated" | "unknown";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
  readonly required?: boolean;
}

export interface HmcH06RunnerProjectionInput {
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly emissionStatus: "verified" | "missing" | "stale" | "conflict";
  readonly restartReconcileStatus: "verified" | "missing" | "stale" | "conflict";
  readonly liveProviderStatus: "not_claimed" | "claimed";
  readonly productionActivationStatus: "not_claimed" | "claimed";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
}

export interface HmcH06PrerequisiteProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly closeoutStatus: "not_applicable" | "pending" | "closeout_complete";
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict";
  readonly terminalLearningStatus: "complete" | "missing" | "stale" | "conflict";
}

export interface HmcH07ProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly authority: "derived_view_only";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly box: HmcH07BoxProjectionInput;
  readonly proofLevels: readonly HmcH07ProofLevelProjectionInput[];
  readonly blockedClaims: readonly HmcH07BlockedClaimProjectionInput[];
  readonly prerequisiteCloseouts: readonly HmcH07PrerequisiteProjectionInput[];
  readonly claimsAuthority?: boolean;
  readonly claimP8Operational?: boolean;
  readonly claimP9Operational?: boolean;
  readonly claimReleaseReady?: boolean;
  readonly claimProductionReady?: boolean;
  readonly claimMechanicalIndependence?: boolean;
  readonly claimH12Assurance?: boolean;
}

export interface HmcH07BoxProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly assuranceStatus: "not_started" | "pending" | "in_progress" | "complete";
}

export interface HmcH07ProofLevelProjectionInput {
  readonly level: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9";
  readonly title: string;
  readonly status: "verified" | "required" | "blocked" | "non_operational" | "operational";
  readonly maturity: HmcMaturity;
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict" | "not_applicable";
  readonly negativeProofStatus: "verified" | "missing" | "stale" | "conflict" | "not_applicable";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
  readonly required?: boolean;
}

export interface HmcH07BlockedClaimProjectionInput {
  readonly claimId: string;
  readonly reason: string;
  readonly cannotClaim: string;
}

export interface HmcH07PrerequisiteProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly closeoutStatus: "not_applicable" | "pending" | "closeout_complete";
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict";
  readonly terminalLearningStatus: "complete" | "missing" | "stale" | "conflict";
}

export interface HmcH08ProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly authority: "derived_view_only";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly box: HmcH08BoxProjectionInput;
  readonly components: readonly HmcH08ComponentProjectionInput[];
  readonly githubSettings: HmcH08GitHubSettingsProjectionInput;
  readonly conductor: HmcH08ConductorProjectionInput;
  readonly dogfood: HmcH08DogfoodProjectionInput;
  readonly blockedClaims: readonly HmcH08BlockedClaimProjectionInput[];
  readonly prerequisiteCloseouts: readonly HmcH08PrerequisiteProjectionInput[];
  readonly claimsAuthority?: boolean;
  readonly claimFullConductor?: boolean;
  readonly claimSettingsMutation?: boolean;
  readonly claimBranchProtectionMutation?: boolean;
  readonly claimLiveAdapter?: boolean;
  readonly claimPersistence?: boolean;
  readonly claimProductionConnected?: boolean;
  readonly claimH13SystemAssurance?: boolean;
}

export interface HmcH08BoxProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly assuranceStatus: "not_started" | "pending" | "in_progress" | "complete";
}

export interface HmcH08ComponentProjectionInput {
  readonly id: "git_truth" | "pr_lifecycle" | "ci_watcher" | "merge_readiness" | "conductor";
  readonly title: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict";
  readonly truthSource: "fixture" | "verified_evidence" | "generated" | "unknown";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
  readonly required?: boolean;
}

export interface HmcH08GitHubSettingsProjectionInput {
  readonly inspectionStatus: "verified" | "missing" | "stale" | "conflict";
  readonly settingsMutationAuthorized: boolean;
  readonly branchProtectionMutationAuthorized: boolean;
  readonly platformShaPinningRequiredClaimed: boolean;
}

export interface HmcH08ConductorProjectionInput {
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly boundedEnvelopeVerified: boolean;
  readonly dryRunDefault: boolean;
  readonly fullConductorImplemented: boolean;
  readonly liveMutationPermitted: boolean;
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
}

export interface HmcH08DogfoodProjectionInput {
  readonly mode: "fixture" | "dry_run" | "limited_current_repo" | "live";
  readonly limitedCurrentRepoMergeAllowed: boolean;
  readonly liveGithubAdapterImplemented: boolean;
  readonly persistentStateStoreImplemented: boolean;
  readonly productionConnected: boolean;
}

export interface HmcH08BlockedClaimProjectionInput {
  readonly claimId: string;
  readonly reason: string;
  readonly cannotClaim: string;
}

export interface HmcH08PrerequisiteProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly closeoutStatus: "not_applicable" | "pending" | "closeout_complete";
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict";
  readonly terminalLearningStatus: "complete" | "missing" | "stale" | "conflict";
}

export interface HmcH09ProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly authority: "derived_view_only";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly box: HmcH09BoxProjectionInput;
  readonly components: readonly HmcH09ComponentProjectionInput[];
  readonly selfHealBudget: HmcH09SelfHealBudgetProjectionInput;
  readonly recovery: HmcH09RecoveryProjectionInput;
  readonly blockedClaims: readonly HmcH09BlockedClaimProjectionInput[];
  readonly prerequisiteCloseouts: readonly HmcH09PrerequisiteProjectionInput[];
  readonly claimsAuthority?: boolean;
  readonly claimLiveAutonomousRecovery?: boolean;
  readonly claimProductionRollback?: boolean;
  readonly claimH10LearningEngine?: boolean;
  readonly claimH11ImpactGraph?: boolean;
  readonly claimH12BoxAssurance?: boolean;
  readonly claimH13SystemAssurance?: boolean;
  readonly claimStableAgents?: boolean;
  readonly claimIndependentAudit?: boolean;
}

export interface HmcH09BoxProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly assuranceStatus: "not_started" | "pending" | "in_progress" | "complete";
}

export interface HmcH09ComponentProjectionInput {
  readonly id:
    | "recovery_policy"
    | "self_heal_budget"
    | "hard_stop_detector"
    | "self_heal_planner"
    | "recovery_execution"
    | "quarantine"
    | "rollback"
    | "anti_theatre";
  readonly title: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly evidenceStatus: "verified" | "missing" | "stale" | "conflict";
  readonly truthSource: "fixture" | "verified_evidence" | "generated" | "unknown";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
  readonly required?: boolean;
}

export interface HmcH09SelfHealBudgetProjectionInput {
  readonly maxSelfHealsPerFfet: number;
  readonly maxSelfHealsPerBox: number;
  readonly maxSelfHealsForFullRun: number;
  readonly usedForFfet: number;
  readonly usedForBox: number;
  readonly usedForFullRun: number;
  readonly exhausted: boolean;
  readonly exhaustionClassification: "hard_stop" | "accepted_debt" | "not_exhausted";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
}

export interface HmcH09RecoveryProjectionInput {
  readonly policyStatus: string;
  readonly hardStopStatus: string;
  readonly plannerStatus: string;
  readonly executionStatus: string;
  readonly quarantineStatus: string;
  readonly rollbackStatus: string;
  readonly antiTheatreStatus: string;
  readonly liveAutonomousRecovery: boolean;
  readonly productionRollbackExecuted: boolean;
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
}

export interface HmcH09BlockedClaimProjectionInput {
  readonly claimId: string;
  readonly reason: string;
  readonly cannotClaim: string;
}

export interface HmcH09PrerequisiteProjectionInput {
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
  readonly h06Projection?: HmcH06ProjectionInput;
  readonly h07Projection?: HmcH07ProjectionInput;
  readonly h08Projection?: HmcH08ProjectionInput;
  readonly h09Projection?: HmcH09ProjectionInput;
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
  validateH06Projection(config, classified, findings);
  validateH07Projection(config, classified, findings);
  validateH08Projection(config, classified, findings);
  validateH09Projection(config, classified, findings);

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
    ...h05VerifiedRefs(config.h05Projection),
    ...h06VerifiedRefs(config.h06Projection),
    ...h07VerifiedRefs(config.h07Projection),
    ...h08VerifiedRefs(config.h08Projection),
    ...h09VerifiedRefs(config.h09Projection)
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
      ...(config.h05Projection ? { h05Projection: config.h05Projection } : {}),
      ...(config.h06Projection ? { h06Projection: config.h06Projection } : {}),
      ...(config.h07Projection ? { h07Projection: config.h07Projection } : {}),
      ...(config.h08Projection ? { h08Projection: config.h08Projection } : {}),
      ...(config.h09Projection ? { h09Projection: config.h09Projection } : {})
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

function validateH06Projection(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const projection = config.h06Projection;
  if (!projection) return;

  validateMaturity(`h06:${projection.id}`, projection.maturity, config, findings);
  validateMaturity(`h06_box:${projection.box.id}`, projection.box.maturity, config, findings);
  validateMaturity("h06:runtime", projection.runtime.maturity, config, findings);
  validateMaturity("h06:runner", projection.runner.maturity, config, findings);
  for (const item of h06RuntimeRefs(projection)) {
    validateMaturity(`h06_runtime:${item.id}`, item.maturity, config, findings);
  }

  if (projection.authority !== "derived_view_only" || projection.claimsAuthority === true) {
    findings.push({
      kind: "h06_projection_claims_authority",
      ref: `h06:${projection.id}`,
      detail: "HMC may project H06 runtime state, but cannot create runtime authority."
    });
  }

  if (projection.freshness !== "fresh") {
    requireClassification("h06_projection_not_fresh", `h06:${projection.id}`, classified, findings, {
      expected: "fresh",
      actual: projection.freshness
    });
  }

  if (projection.maturity === "api_backed" || projection.maturity === "persistent" || projection.maturity === "production_connected") {
    findings.push({
      kind: "h06_projection_maturity_overclaim",
      ref: `h06:${projection.id}`,
      expected: "fixture_backed",
      actual: projection.maturity
    });
  }

  if (projection.runtime.freshness !== "fresh") {
    requireClassification("h06_runtime_projection_not_fresh", "h06:runtime", classified, findings, {
      expected: "fresh",
      actual: projection.runtime.freshness
    });
  }
  for (const [status, ref] of [
    [projection.runtime.layoutStatus, "h06_runtime:layout"],
    [projection.runtime.recordStatus, "h06_runtime:records"],
    [projection.runtime.cleanupStatus, "h06_runtime:cleanup"]
  ] as const) {
    if (status === "verified") continue;
    requireClassification("h06_runtime_control_not_verified", ref, classified, findings, {
      expected: "verified",
      actual: status
    });
  }

  for (const item of h06RuntimeRefs(projection)) {
    if (item.required === true && item.evidenceStatus !== "verified") {
      requireClassification("h06_runtime_ref_not_verified", `h06_runtime:${item.id}`, classified, findings, {
        expected: "verified",
        actual: item.evidenceStatus
      });
    }
    if (item.freshness !== "fresh") {
      requireClassification("h06_runtime_ref_not_fresh", `h06_runtime:${item.id}`, classified, findings, {
        expected: "fresh",
        actual: item.freshness
      });
    }
  }

  if (projection.runner.emissionStatus !== "verified") {
    findings.push({
      kind: "h06_runner_emission_not_verified",
      ref: "h06:runner",
      expected: "verified",
      actual: projection.runner.emissionStatus
    });
  }
  if (projection.runner.restartReconcileStatus !== "verified") {
    findings.push({
      kind: "h06_runner_restart_reconcile_not_verified",
      ref: "h06:runner",
      expected: "verified",
      actual: projection.runner.restartReconcileStatus
    });
  }
  if (projection.runner.freshness !== "fresh") {
    requireClassification("h06_runner_not_fresh", "h06:runner", classified, findings, {
      expected: "fresh",
      actual: projection.runner.freshness
    });
  }
  if (projection.runner.liveProviderStatus !== "not_claimed") {
    findings.push({
      kind: "h06_live_provider_overclaim",
      ref: "h06:runner",
      expected: "not_claimed",
      actual: projection.runner.liveProviderStatus
    });
  }
  if (projection.runner.productionActivationStatus !== "not_claimed") {
    findings.push({
      kind: "h06_production_activation_overclaim",
      ref: "h06:runner",
      expected: "not_claimed",
      actual: projection.runner.productionActivationStatus
    });
  }

  for (const prerequisite of projection.prerequisiteCloseouts) {
    if (
      prerequisite.closeoutStatus !== "closeout_complete" ||
      prerequisite.evidenceStatus !== "verified" ||
      prerequisite.terminalLearningStatus !== "complete"
    ) {
      findings.push({
        kind: "h06_prerequisite_not_closeout_complete",
        ref: `h06_prerequisite:${prerequisite.id}`,
        expected: "closeout_complete/verified/complete",
        actual: `${prerequisite.closeoutStatus}/${prerequisite.evidenceStatus}/${prerequisite.terminalLearningStatus}`
      });
    }
  }

  const claimChecks: readonly [boolean | undefined, string, string][] = [
    [projection.claimLiveRuntime, "h06_live_runtime_overclaim", "live_lifecycle_runner_execution"],
    [projection.claimPersistence, "h06_persistence_overclaim", "persistent_state_store_implemented"],
    [projection.claimH08Conductor, "h06_h08_conductor_overclaim", "H08_git_ci_pr_merge_conductor_implemented"],
    [projection.claimMechanicalIndependence, "h06_mechanical_independence_overclaim", "mechanically_independent_agents"],
    [projection.claimProductionOrchestration, "h06_production_orchestration_overclaim", "production_resource_orchestration"]
  ];
  for (const [enabled, kind, ref] of claimChecks) {
    if (enabled !== true) continue;
    findings.push({ kind, ref, expected: "cannot_claim_preserved", actual: "claimed" });
  }

  for (const cannotClaim of [
    "HMC_authoritative_state",
    "live_github_adapter_implemented",
    "persistent_state_store_implemented",
    "live_autonomous_worktree_orchestration",
    "live_parallel_pod_execution",
    "live_lifecycle_runner_execution",
    "H08_git_ci_pr_merge_conductor_implemented",
    "mechanically_independent_agents",
    "production_resource_orchestration",
    "h06_box_assurance_complete"
  ]) {
    if (config.cannotClaim?.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_h06_projection_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`,
      detail: "H06 HMC runtime projection must preserve precise cannot_claim boundaries."
    });
  }
}

function validateH07Projection(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const projection = config.h07Projection;
  if (!projection) return;

  validateMaturity(`h07:${projection.id}`, projection.maturity, config, findings);
  validateMaturity(`h07_box:${projection.box.id}`, projection.box.maturity, config, findings);
  for (const proof of projection.proofLevels) {
    validateMaturity(`h07_proof:${proof.level}`, proof.maturity, config, findings);
  }

  if (projection.authority !== "derived_view_only" || projection.claimsAuthority === true) {
    findings.push({
      kind: "h07_projection_claims_authority",
      ref: `h07:${projection.id}`,
      detail: "HMC may project H07 proof state, but cannot create proof authority."
    });
  }

  if (projection.freshness !== "fresh") {
    requireClassification("h07_projection_not_fresh", `h07:${projection.id}`, classified, findings, {
      expected: "fresh",
      actual: projection.freshness
    });
  }

  if (projection.maturity === "api_backed" || projection.maturity === "persistent" || projection.maturity === "production_connected") {
    findings.push({
      kind: "h07_projection_maturity_overclaim",
      ref: `h07:${projection.id}`,
      expected: "fixture_backed",
      actual: projection.maturity
    });
  }

  for (const prerequisite of projection.prerequisiteCloseouts) {
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

  for (const proof of projection.proofLevels) {
    if (proof.required === true && proof.evidenceStatus !== "verified") {
      requireClassification("h07_required_proof_not_verified", `h07_proof:${proof.level}`, classified, findings, {
        expected: "verified",
        actual: proof.evidenceStatus
      });
    }
    if (proof.required === true && proof.negativeProofStatus !== "verified") {
      requireClassification("h07_required_negative_proof_not_verified", `h07_proof:${proof.level}`, classified, findings, {
        expected: "verified",
        actual: proof.negativeProofStatus
      });
    }
    if (proof.freshness !== "fresh") {
      requireClassification("h07_proof_level_not_fresh", `h07_proof:${proof.level}`, classified, findings, {
        expected: "fresh",
        actual: proof.freshness
      });
    }
    if ((proof.level === "P8" || proof.level === "P9") && proof.status === "operational") {
      findings.push({
        kind: "h07_future_proof_level_operational_overclaim",
        ref: `h07_proof:${proof.level}`,
        expected: "non_operational_or_blocked",
        actual: proof.status
      });
    }
  }

  const claimChecks: readonly [boolean | undefined, string, string][] = [
    [projection.claimP8Operational, "h07_p8_operational_overclaim", "release_proof_complete"],
    [projection.claimP9Operational, "h07_p9_operational_overclaim", "production_proof_complete"],
    [projection.claimReleaseReady, "h07_release_ready_overclaim", "release_candidate"],
    [projection.claimProductionReady, "h07_production_ready_overclaim", "production_ready"],
    [projection.claimMechanicalIndependence, "h07_mechanical_independence_overclaim", "mechanically_independent_audit"],
    [projection.claimH12Assurance, "h07_h12_assurance_overclaim", "H12_box_assurance_engine_implemented"]
  ];
  for (const [enabled, kind, ref] of claimChecks) {
    if (enabled !== true) continue;
    findings.push({ kind, ref, expected: "cannot_claim_preserved", actual: "claimed" });
  }

  for (const blocked of projection.blockedClaims) {
    if (config.cannotClaim?.includes(blocked.cannotClaim)) continue;
    findings.push({
      kind: "h07_blocked_claim_missing_cannot_claim",
      ref: `h07_claim:${blocked.claimId}`,
      expected: blocked.cannotClaim
    });
  }

  for (const cannotClaim of [
    "HMC_authoritative_state",
    "release_candidate",
    "production_ready",
    "self_hosting_ready",
    "mechanically_independent_audit",
    "release_proof_complete",
    "production_proof_complete",
    "H12_box_assurance_engine_implemented"
  ]) {
    if (config.cannotClaim?.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_h07_projection_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`,
      detail: "H07 HMC proof projection must preserve precise cannot_claim boundaries."
    });
  }
}

function validateH08Projection(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const projection = config.h08Projection;
  if (!projection) return;

  validateMaturity(`h08:${projection.id}`, projection.maturity, config, findings);
  validateMaturity(`h08_box:${projection.box.id}`, projection.box.maturity, config, findings);
  validateMaturity("h08:conductor", projection.conductor.maturity, config, findings);
  for (const component of projection.components) {
    validateMaturity(`h08_component:${component.id}`, component.maturity, config, findings);
  }

  if (projection.authority !== "derived_view_only" || projection.claimsAuthority === true) {
    findings.push({
      kind: "h08_projection_claims_authority",
      ref: `h08:${projection.id}`,
      detail: "HMC may project H08 Git/CI/PR/conductor state, but cannot create lifecycle authority."
    });
  }

  if (projection.freshness !== "fresh") {
    requireClassification("h08_projection_not_fresh", `h08:${projection.id}`, classified, findings, {
      expected: "fresh",
      actual: projection.freshness
    });
  }

  if (projection.maturity === "api_backed" || projection.maturity === "persistent" || projection.maturity === "production_connected") {
    findings.push({
      kind: "h08_projection_maturity_overclaim",
      ref: `h08:${projection.id}`,
      expected: "fixture_backed",
      actual: projection.maturity
    });
  }

  for (const component of projection.components) {
    if (component.required === true && component.evidenceStatus !== "verified") {
      requireClassification("h08_component_not_verified", `h08_component:${component.id}`, classified, findings, {
        expected: "verified",
        actual: component.evidenceStatus
      });
    }
    if (component.freshness !== "fresh") {
      requireClassification("h08_component_not_fresh", `h08_component:${component.id}`, classified, findings, {
        expected: "fresh",
        actual: component.freshness
      });
    }
  }

  if (projection.githubSettings.inspectionStatus !== "verified") {
    requireClassification("h08_github_settings_not_verified", "h08:github_settings", classified, findings, {
      expected: "verified",
      actual: projection.githubSettings.inspectionStatus
    });
  }
  if (projection.githubSettings.settingsMutationAuthorized === true) {
    findings.push({
      kind: "h08_settings_mutation_overclaim",
      ref: "h08:github_settings",
      expected: "false",
      actual: "true"
    });
  }
  if (projection.githubSettings.branchProtectionMutationAuthorized === true) {
    findings.push({
      kind: "h08_branch_protection_mutation_overclaim",
      ref: "h08:github_settings",
      expected: "false",
      actual: "true"
    });
  }
  if (projection.githubSettings.platformShaPinningRequiredClaimed === true) {
    findings.push({
      kind: "h08_platform_sha_pinning_overclaim",
      ref: "h08:github_settings",
      expected: "scanner_or_policy_report_only",
      actual: "claimed"
    });
  }

  if (projection.conductor.freshness !== "fresh") {
    requireClassification("h08_conductor_not_fresh", "h08:conductor", classified, findings, {
      expected: "fresh",
      actual: projection.conductor.freshness
    });
  }
  if (projection.conductor.boundedEnvelopeVerified !== true) {
    findings.push({
      kind: "h08_conductor_envelope_not_verified",
      ref: "h08:conductor",
      expected: "boundedEnvelopeVerified=true",
      actual: String(projection.conductor.boundedEnvelopeVerified)
    });
  }
  if (projection.conductor.dryRunDefault !== true) {
    findings.push({
      kind: "h08_conductor_dry_run_default_missing",
      ref: "h08:conductor",
      expected: "dryRunDefault=true",
      actual: String(projection.conductor.dryRunDefault)
    });
  }
  if (projection.conductor.fullConductorImplemented === true) {
    findings.push({
      kind: "h08_full_conductor_overclaim",
      ref: "h08:conductor",
      expected: "false",
      actual: "true"
    });
  }
  if (projection.conductor.liveMutationPermitted === true) {
    findings.push({
      kind: "h08_live_mutation_overclaim",
      ref: "h08:conductor",
      expected: "false",
      actual: "true"
    });
  }

  if (projection.dogfood.mode === "live") {
    findings.push({
      kind: "h08_live_dogfood_overclaim",
      ref: "h08:dogfood",
      expected: "fixture_or_dry_run_or_limited_current_repo",
      actual: projection.dogfood.mode
    });
  }
  if (projection.dogfood.liveGithubAdapterImplemented === true) {
    findings.push({
      kind: "h08_live_adapter_overclaim",
      ref: "h08:dogfood",
      expected: "false",
      actual: "true"
    });
  }
  if (projection.dogfood.persistentStateStoreImplemented === true) {
    findings.push({
      kind: "h08_persistence_overclaim",
      ref: "h08:dogfood",
      expected: "false",
      actual: "true"
    });
  }
  if (projection.dogfood.productionConnected === true) {
    findings.push({
      kind: "h08_production_connected_overclaim",
      ref: "h08:dogfood",
      expected: "false",
      actual: "true"
    });
  }

  for (const prerequisite of projection.prerequisiteCloseouts) {
    if (
      prerequisite.closeoutStatus === "closeout_complete" &&
      prerequisite.evidenceStatus === "verified" &&
      prerequisite.terminalLearningStatus === "complete"
    ) {
      continue;
    }
    findings.push({
      kind: "h08_prerequisite_not_closeout_complete",
      ref: `h08_prerequisite:${prerequisite.id}`,
      expected: "closeout_complete/verified/complete",
      actual: `${prerequisite.closeoutStatus}/${prerequisite.evidenceStatus}/${prerequisite.terminalLearningStatus}`
    });
  }

  const claimChecks: readonly [boolean | undefined, string, string][] = [
    [projection.claimFullConductor, "h08_full_conductor_overclaim", "H08_git_ci_pr_merge_conductor_implemented"],
    [projection.claimSettingsMutation, "h08_settings_mutation_overclaim", "github_settings_mutation_authorized"],
    [projection.claimBranchProtectionMutation, "h08_branch_protection_mutation_overclaim", "branch_protection_mutation_authorized"],
    [projection.claimLiveAdapter, "h08_live_adapter_overclaim", "live_github_adapter_implemented"],
    [projection.claimPersistence, "h08_persistence_overclaim", "persistent_state_store_implemented"],
    [projection.claimProductionConnected, "h08_production_connected_overclaim", "production_ready"],
    [projection.claimH13SystemAssurance, "h08_h13_system_assurance_overclaim", "H13_system_assurance_engine_implemented"]
  ];
  for (const [enabled, kind, ref] of claimChecks) {
    if (enabled !== true) continue;
    findings.push({ kind, ref, expected: "cannot_claim_preserved", actual: "claimed" });
  }

  for (const blocked of projection.blockedClaims) {
    if (config.cannotClaim?.includes(blocked.cannotClaim)) continue;
    findings.push({
      kind: "h08_blocked_claim_missing_cannot_claim",
      ref: `h08_claim:${blocked.claimId}`,
      expected: blocked.cannotClaim
    });
  }

  for (const cannotClaim of [
    "HMC_authoritative_state",
    "H08_git_ci_pr_merge_conductor_implemented",
    "github_settings_mutation_authorized",
    "branch_protection_mutation_authorized",
    "live_github_adapter_implemented",
    "persistent_state_store_implemented",
    "H13_system_assurance_engine_implemented",
    "self_hosting_ready",
    "production_ready"
  ]) {
    if (config.cannotClaim?.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_h08_projection_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`,
      detail: "H08 HMC Git/CI/PR/conductor projection must preserve precise cannot_claim boundaries."
    });
  }
}

function validateH09Projection(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const projection = config.h09Projection;
  if (!projection) return;

  validateMaturity(`h09:${projection.id}`, projection.maturity, config, findings);
  validateMaturity(`h09_box:${projection.box.id}`, projection.box.maturity, config, findings);
  for (const component of projection.components) {
    validateMaturity(`h09_component:${component.id}`, component.maturity, config, findings);
  }

  if (projection.authority !== "derived_view_only" || projection.claimsAuthority === true) {
    findings.push({
      kind: "h09_projection_claims_authority",
      ref: `h09:${projection.id}`,
      detail: "HMC may project H09 recovery state, but cannot create recovery authority."
    });
  }

  if (projection.freshness !== "fresh") {
    requireClassification("h09_projection_not_fresh", `h09:${projection.id}`, classified, findings, {
      expected: "fresh",
      actual: projection.freshness
    });
  }

  if (projection.maturity === "api_backed" || projection.maturity === "persistent" || projection.maturity === "production_connected") {
    findings.push({
      kind: "h09_projection_maturity_overclaim",
      ref: `h09:${projection.id}`,
      expected: "fixture_backed",
      actual: projection.maturity
    });
  }

  for (const component of projection.components) {
    if (component.required === true && component.evidenceStatus !== "verified") {
      requireClassification("h09_component_not_verified", `h09_component:${component.id}`, classified, findings, {
        expected: "verified",
        actual: component.evidenceStatus
      });
    }
    if (component.freshness !== "fresh") {
      requireClassification("h09_component_not_fresh", `h09_component:${component.id}`, classified, findings, {
        expected: "fresh",
        actual: component.freshness
      });
    }
  }

  if (projection.selfHealBudget.maxSelfHealsPerFfet !== 3) {
    findings.push({
      kind: "h09_self_heal_ffet_budget_invalid",
      ref: "h09:self_heal_budget",
      expected: "3",
      actual: String(projection.selfHealBudget.maxSelfHealsPerFfet)
    });
  }
  if (projection.selfHealBudget.maxSelfHealsPerBox !== 10) {
    findings.push({
      kind: "h09_self_heal_box_budget_invalid",
      ref: "h09:self_heal_budget",
      expected: "10",
      actual: String(projection.selfHealBudget.maxSelfHealsPerBox)
    });
  }
  if (projection.selfHealBudget.maxSelfHealsForFullRun !== 30) {
    findings.push({
      kind: "h09_self_heal_full_run_budget_invalid",
      ref: "h09:self_heal_budget",
      expected: "30",
      actual: String(projection.selfHealBudget.maxSelfHealsForFullRun)
    });
  }
  if (projection.selfHealBudget.usedForFfet > projection.selfHealBudget.maxSelfHealsPerFfet) {
    findings.push({ kind: "h09_self_heal_ffet_budget_exceeded", ref: "h09:self_heal_budget" });
  }
  if (projection.selfHealBudget.usedForBox > projection.selfHealBudget.maxSelfHealsPerBox) {
    findings.push({ kind: "h09_self_heal_box_budget_exceeded", ref: "h09:self_heal_budget" });
  }
  if (projection.selfHealBudget.usedForFullRun > projection.selfHealBudget.maxSelfHealsForFullRun) {
    findings.push({ kind: "h09_self_heal_full_run_budget_exceeded", ref: "h09:self_heal_budget" });
  }
  if (projection.selfHealBudget.exhausted === true && projection.selfHealBudget.exhaustionClassification === "not_exhausted") {
    findings.push({ kind: "h09_exhausted_budget_classification_conflict", ref: "h09:self_heal_budget" });
  }
  if (projection.selfHealBudget.freshness !== "fresh") {
    requireClassification("h09_self_heal_budget_not_fresh", "h09:self_heal_budget", classified, findings, {
      expected: "fresh",
      actual: projection.selfHealBudget.freshness
    });
  }

  for (const [status, ref] of [
    [projection.recovery.policyStatus, "recovery_policy"],
    [projection.recovery.hardStopStatus, "hard_stop_detector"],
    [projection.recovery.plannerStatus, "self_heal_planner"],
    [projection.recovery.executionStatus, "recovery_execution"],
    [projection.recovery.quarantineStatus, "quarantine"],
    [projection.recovery.rollbackStatus, "rollback"],
    [projection.recovery.antiTheatreStatus, "anti_theatre"]
  ] as const) {
    if (status === "verified") continue;
    requireClassification("h09_recovery_component_not_verified", `h09_recovery:${ref}`, classified, findings, {
      expected: "verified",
      actual: status
    });
  }
  if (projection.recovery.freshness !== "fresh") {
    requireClassification("h09_recovery_summary_not_fresh", "h09:recovery", classified, findings, {
      expected: "fresh",
      actual: projection.recovery.freshness
    });
  }
  if (projection.recovery.liveAutonomousRecovery === true) {
    findings.push({
      kind: "h09_live_autonomous_recovery_overclaim",
      ref: "h09:recovery",
      expected: "false",
      actual: "true"
    });
  }
  if (projection.recovery.productionRollbackExecuted === true) {
    findings.push({
      kind: "h09_production_rollback_overclaim",
      ref: "h09:recovery",
      expected: "false",
      actual: "true"
    });
  }

  for (const prerequisite of projection.prerequisiteCloseouts) {
    if (
      prerequisite.closeoutStatus === "closeout_complete" &&
      prerequisite.evidenceStatus === "verified" &&
      prerequisite.terminalLearningStatus === "complete"
    ) {
      continue;
    }
    findings.push({
      kind: "h09_prerequisite_not_closeout_complete",
      ref: `h09_prerequisite:${prerequisite.id}`,
      expected: "closeout_complete/verified/complete",
      actual: `${prerequisite.closeoutStatus}/${prerequisite.evidenceStatus}/${prerequisite.terminalLearningStatus}`
    });
  }

  const claimChecks: readonly [boolean | undefined, string, string][] = [
    [projection.claimLiveAutonomousRecovery, "h09_live_autonomous_recovery_overclaim", "live_autonomous_recovery_execution"],
    [projection.claimProductionRollback, "h09_production_rollback_overclaim", "production_rollback_executed"],
    [projection.claimH10LearningEngine, "h09_h10_learning_engine_overclaim", "H10_learning_engine_implemented"],
    [projection.claimH11ImpactGraph, "h09_h11_impact_graph_overclaim", "H11_impact_graph_implemented"],
    [projection.claimH12BoxAssurance, "h09_h12_box_assurance_overclaim", "H12_box_assurance_engine_implemented"],
    [projection.claimH13SystemAssurance, "h09_h13_system_assurance_overclaim", "H13_system_assurance_engine_implemented"],
    [projection.claimStableAgents, "h09_stable_agents_overclaim", "stable_agents"],
    [projection.claimIndependentAudit, "h09_independent_audit_overclaim", "independent_quality_auditor_qualified"]
  ];
  for (const [enabled, kind, ref] of claimChecks) {
    if (enabled !== true) continue;
    findings.push({ kind, ref, expected: "cannot_claim_preserved", actual: "claimed" });
  }

  for (const blocked of projection.blockedClaims) {
    if (config.cannotClaim?.includes(blocked.cannotClaim)) continue;
    findings.push({
      kind: "h09_blocked_claim_missing_cannot_claim",
      ref: `h09_claim:${blocked.claimId}`,
      expected: blocked.cannotClaim
    });
  }

  for (const cannotClaim of [
    "HMC_authoritative_state",
    "H09_recovery_engine_implemented",
    "live_autonomous_recovery_execution",
    "production_rollback_executed",
    "H10_learning_engine_implemented",
    "H11_impact_graph_implemented",
    "H12_box_assurance_engine_implemented",
    "H13_system_assurance_engine_implemented",
    "stable_agents",
    "self_hosting_ready",
    "production_ready"
  ]) {
    if (config.cannotClaim?.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_h09_projection_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`,
      detail: "H09 HMC recovery projection must preserve precise cannot_claim boundaries."
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

function h06VerifiedRefs(projection: HmcH06ProjectionInput | undefined): HmcVerifiedRef[] {
  if (!projection) return [];
  return [
    {
      ref: `h06:${projection.id}`,
      status: projection.status,
      maturity: projection.maturity
    },
    {
      ref: `h06_box:${projection.box.id}`,
      status: projection.box.status,
      maturity: projection.box.maturity
    },
    {
      ref: "h06:runtime",
      status: projection.runtime.status,
      maturity: projection.runtime.maturity
    },
    ...h06RuntimeRefs(projection).map((item) => ({
      ref: `h06_runtime:${item.id}`,
      status: item.evidenceStatus,
      maturity: item.maturity
    })),
    {
      ref: "h06:runner",
      status: projection.runner.status,
      maturity: projection.runner.maturity
    },
    ...projection.prerequisiteCloseouts.map((prerequisite) => ({
      ref: `h06_prerequisite:${prerequisite.id}`,
      status: prerequisite.closeoutStatus,
      maturity: projection.maturity
    }))
  ];
}

function h07VerifiedRefs(projection: HmcH07ProjectionInput | undefined): HmcVerifiedRef[] {
  if (!projection) return [];
  return [
    {
      ref: `h07:${projection.id}`,
      status: projection.status,
      maturity: projection.maturity
    },
    ...projection.proofLevels.map((proof) => ({
      ref: `h07_proof:${proof.level}`,
      status: proof.status,
      maturity: proof.maturity
    })),
    ...projection.prerequisiteCloseouts.map((prerequisite) => ({
      ref: `h07_prerequisite:${prerequisite.id}`,
      status: prerequisite.closeoutStatus,
      maturity: projection.maturity
    }))
  ];
}

function h08VerifiedRefs(projection: HmcH08ProjectionInput | undefined): HmcVerifiedRef[] {
  if (!projection) return [];
  return [
    {
      ref: `h08:${projection.id}`,
      status: projection.status,
      maturity: projection.maturity
    },
    {
      ref: `h08_box:${projection.box.id}`,
      status: projection.box.status,
      maturity: projection.box.maturity
    },
    ...projection.components.map((component) => ({
      ref: `h08_component:${component.id}`,
      status: component.status,
      maturity: component.maturity
    })),
    {
      ref: "h08:github_settings",
      status: projection.githubSettings.inspectionStatus,
      maturity: projection.maturity
    },
    {
      ref: "h08:conductor",
      status: projection.conductor.status,
      maturity: projection.conductor.maturity
    },
    ...projection.prerequisiteCloseouts.map((prerequisite) => ({
      ref: `h08_prerequisite:${prerequisite.id}`,
      status: prerequisite.closeoutStatus,
      maturity: projection.maturity
    }))
  ];
}

function h09VerifiedRefs(projection: HmcH09ProjectionInput | undefined): HmcVerifiedRef[] {
  if (!projection) return [];
  return [
    {
      ref: `h09:${projection.id}`,
      status: projection.status,
      maturity: projection.maturity
    },
    {
      ref: `h09_box:${projection.box.id}`,
      status: projection.box.status,
      maturity: projection.box.maturity
    },
    ...projection.components.map((component) => ({
      ref: `h09_component:${component.id}`,
      status: component.status,
      maturity: component.maturity
    })),
    {
      ref: "h09:self_heal_budget",
      status: projection.selfHealBudget.exhaustionClassification,
      maturity: projection.maturity
    },
    {
      ref: "h09:recovery",
      status: projection.recovery.executionStatus,
      maturity: projection.maturity
    },
    ...projection.prerequisiteCloseouts.map((prerequisite) => ({
      ref: `h09_prerequisite:${prerequisite.id}`,
      status: prerequisite.closeoutStatus,
      maturity: projection.maturity
    }))
  ];
}

function h06RuntimeRefs(projection: HmcH06ProjectionInput): HmcH06RuntimeRefProjectionInput[] {
  return [
    ...projection.worktrees,
    ...projection.locks,
    ...projection.checkpoints,
    ...projection.quarantines,
    ...projection.pods
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
    ...h06Maturities(config.h06Projection),
    ...h08Maturities(config.h08Projection),
    ...h09Maturities(config.h09Projection),
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

function h06Maturities(projection: HmcH06ProjectionInput | undefined): HmcMaturity[] {
  if (!projection) return [];
  return [
    projection.maturity,
    projection.box.maturity,
    projection.runtime.maturity,
    ...h06RuntimeRefs(projection).map((item) => item.maturity),
    projection.runner.maturity
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

function h08Maturities(projection: HmcH08ProjectionInput | undefined): HmcMaturity[] {
  if (!projection) return [];
  return [
    projection.maturity,
    projection.box.maturity,
    ...projection.components.map((component) => component.maturity),
    projection.conductor.maturity
  ];
}

function h09Maturities(projection: HmcH09ProjectionInput | undefined): HmcMaturity[] {
  if (!projection) return [];
  return [
    projection.maturity,
    projection.box.maturity,
    ...projection.components.map((component) => component.maturity)
  ];
}
