import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H09HmcRecoveryProjectionStatus = "passed" | "failed";
export type H09ExpectedHmcRecoveryProjectionStatus = "passed" | "failed";
export type H09RecoveryProjectionMaturity = "mocked" | "fixture_backed" | "api_backed" | "persistent" | "production_connected";
export type H09RecoveryProjectionEvidenceStatus = "verified" | "missing" | "stale" | "conflict";
export type H09RecoveryProjectionFreshness = "fresh" | "stale" | "missing" | "conflict";

export interface H09HmcRecoveryProjectionConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H09HmcRecoveryProjectionScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H09HmcRecoveryProjectionScenarioExpectation {
  readonly scenarioId: string;
  readonly projectionRef: string;
  readonly projectionSha256: string;
  readonly expectedStatus: H09ExpectedHmcRecoveryProjectionStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H09ExpectedHmcRecoveryProjectionRecord;
}

export interface H09ExpectedHmcRecoveryProjectionRecord {
  readonly status?: string;
  readonly activeFfet?: string;
  readonly recoveryPolicyStatus?: string;
  readonly selfHealPlannerStatus?: string;
  readonly antiTheatreStatus?: string;
}

export interface H09HmcRecoveryProjectionReport {
  readonly status: H09HmcRecoveryProjectionStatus;
  readonly findings: readonly H09HmcRecoveryProjectionFinding[];
  readonly scenario_results: readonly H09HmcRecoveryProjectionScenarioResult[];
  readonly verified_refs: readonly H09VerifiedHmcRecoveryProjectionRef[];
  readonly projection_summary: H09HmcRecoveryProjectionSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H09HmcRecoveryProjectionScenarioResult {
  readonly scenarioId: string;
  readonly projectionRef: string;
  readonly status: H09HmcRecoveryProjectionStatus;
  readonly expectedStatus: H09ExpectedHmcRecoveryProjectionStatus;
  readonly findingKinds: readonly string[];
  readonly projectionStatus: string | null;
  readonly activeFfet: string | null;
  readonly verifiedComponentCount: number;
  readonly blockedClaimCount: number;
  readonly selfHealBudgetExhausted: boolean;
}

export interface H09VerifiedHmcRecoveryProjectionRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h09_hmc_recovery_projection";
}

export interface H09HmcRecoveryProjectionFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H09HmcRecoveryProjectionSummary {
  readonly verified_ref_count: number;
  readonly verified_component_count: number;
  readonly blocking_finding_count: number;
  readonly blocked_claim_count: number;
  readonly recovery_overclaim_count: number;
  readonly future_box_overclaim_count: number;
}

interface H09HmcRecoveryProjectionRecord {
  readonly schema_version?: string;
  readonly projection_id?: string;
  readonly status?: string;
  readonly maturity?: H09RecoveryProjectionMaturity;
  readonly authority?: "derived_view_only" | "authority";
  readonly freshness?: H09RecoveryProjectionFreshness;
  readonly active_ffet?: string;
  readonly box?: H09ProjectionBoxRecord;
  readonly components?: readonly H09ProjectionComponentRecord[];
  readonly self_heal_budget?: H09ProjectionSelfHealBudgetRecord;
  readonly recovery?: H09ProjectionRecoveryRecord;
  readonly blocked_claims?: readonly H09ProjectionBlockedClaimRecord[];
  readonly prerequisite_closeouts?: readonly H09ProjectionPrerequisiteRecord[];
  readonly claims?: H09ProjectionClaimsRecord;
  readonly cannot_claim?: readonly string[];
}

interface H09ProjectionBoxRecord {
  readonly id?: string;
  readonly status?: string;
  readonly assurance_status?: "not_started" | "pending" | "in_progress" | "complete";
}

interface H09ProjectionComponentRecord {
  readonly component_id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly maturity?: H09RecoveryProjectionMaturity;
  readonly evidence_status?: H09RecoveryProjectionEvidenceStatus;
  readonly freshness?: H09RecoveryProjectionFreshness;
  readonly truth_source?: "fixture" | "verified_evidence" | "generated" | "unknown";
  readonly required?: boolean;
}

interface H09ProjectionSelfHealBudgetRecord {
  readonly max_self_heals_per_ffet?: number;
  readonly max_self_heals_per_box?: number;
  readonly max_self_heals_for_full_run?: number;
  readonly used_for_ffet?: number;
  readonly used_for_box?: number;
  readonly used_for_full_run?: number;
  readonly exhausted?: boolean;
  readonly exhaustion_classification?: "hard_stop" | "accepted_debt" | "not_exhausted";
  readonly freshness?: H09RecoveryProjectionFreshness;
}

interface H09ProjectionRecoveryRecord {
  readonly policy_status?: string;
  readonly hard_stop_status?: string;
  readonly planner_status?: string;
  readonly execution_status?: string;
  readonly quarantine_status?: string;
  readonly rollback_status?: string;
  readonly anti_theatre_status?: string;
  readonly live_autonomous_recovery?: boolean;
  readonly production_rollback_executed?: boolean;
  readonly freshness?: H09RecoveryProjectionFreshness;
}

interface H09ProjectionBlockedClaimRecord {
  readonly claim_id?: string;
  readonly reason?: string;
  readonly cannot_claim?: string;
}

interface H09ProjectionPrerequisiteRecord {
  readonly id?: string;
  readonly status?: string;
  readonly closeout_status?: "not_applicable" | "pending" | "closeout_complete";
  readonly evidence_status?: H09RecoveryProjectionEvidenceStatus;
  readonly terminal_learning_status?: "complete" | "missing" | "stale" | "conflict";
}

interface H09ProjectionClaimsRecord {
  readonly hmc_authority?: boolean;
  readonly live_autonomous_recovery?: boolean;
  readonly production_rollback?: boolean;
  readonly h10_learning_engine?: boolean;
  readonly h11_impact_graph?: boolean;
  readonly h12_box_assurance?: boolean;
  readonly h13_system_assurance?: boolean;
  readonly stable_agents?: boolean;
  readonly independent_audit?: boolean;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;
const VALID_MATURITIES = new Set(["mocked", "fixture_backed", "api_backed", "persistent", "production_connected"]);
const REQUIRED_COMPONENTS = new Set([
  "recovery_policy",
  "self_heal_budget",
  "hard_stop_detector",
  "self_heal_planner",
  "recovery_execution",
  "quarantine",
  "rollback",
  "anti_theatre"
]);
const REQUIRED_CANNOT_CLAIM = [
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
];

export function verifyH09HmcRecoveryProjectionConfig(
  config: H09HmcRecoveryProjectionConfig
): H09HmcRecoveryProjectionReport {
  const findings: H09HmcRecoveryProjectionFinding[] = [];
  const verifiedRefs: H09VerifiedHmcRecoveryProjectionRef[] = [];
  const scenarioResults = config.scenarios.map((scenario) => verifyScenario(config, scenario, findings, verifiedRefs));
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "scenario_status_unexpected" ||
        finding.kind === "expected_scenario_finding_missing" ||
        finding.kind === "scenario_expected_field_mismatch"
    );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    projection_summary: {
      verified_ref_count: verifiedRefs.length,
      verified_component_count: scenarioResults.reduce((sum, result) => sum + result.verifiedComponentCount, 0),
      blocking_finding_count: findings.length,
      blocked_claim_count: scenarioResults.reduce((sum, result) => sum + result.blockedClaimCount, 0),
      recovery_overclaim_count: findings.filter((finding) => finding.kind.includes("recovery") || finding.kind.includes("rollback"))
        .length,
      future_box_overclaim_count: findings.filter((finding) => finding.kind.includes("h10") || finding.kind.includes("h11") || finding.kind.includes("h12") || finding.kind.includes("h13")).length
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H09HmcRecoveryProjectionConfig,
  expectation: H09HmcRecoveryProjectionScenarioExpectation,
  findings: H09HmcRecoveryProjectionFinding[],
  verifiedRefs: H09VerifiedHmcRecoveryProjectionRef[]
): H09HmcRecoveryProjectionScenarioResult {
  const localFindings: H09HmcRecoveryProjectionFinding[] = [];
  const hashFinding = validateSha256(expectation.projectionSha256, "projection_hash_invalid");
  if (hashFinding) {
    localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.projectionRef });
  }

  const projectionPath = resolveLogicalRef(expectation.projectionRef, config.logicalRoots, localFindings);
  let record: H09HmcRecoveryProjectionRecord | null = null;
  if (projectionPath && existsSync(projectionPath) && localFindings.length === 0) {
    const text = readFileSync(projectionPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.projectionSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "projection_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.projectionRef,
        path: projectionPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({
        ref: expectation.projectionRef,
        path: projectionPath,
        sha256: actualHash,
        source: "h09_hmc_recovery_projection"
      });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.projectionRef });
    }
    try {
      record = JSON.parse(text) as H09HmcRecoveryProjectionRecord;
    } catch (error) {
      localFindings.push({
        kind: "projection_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.projectionRef });
    }
  } else if (projectionPath && !existsSync(projectionPath)) {
    localFindings.push({
      kind: "projection_missing",
      scenarioId: expectation.scenarioId,
      ref: expectation.projectionRef,
      path: projectionPath
    });
  }

  if (record) localFindings.push(...verifyRecord(expectation, record));

  const actualStatus: H09HmcRecoveryProjectionStatus = localFindings.length === 0 ? "passed" : "failed";
  const findingKindsBeforeExpectationChecks = localFindings.map((finding) => finding.kind);
  if (actualStatus !== expectation.expectedStatus) {
    localFindings.push({
      kind: "scenario_status_unexpected",
      scenarioId: expectation.scenarioId,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }
  for (const expectedKind of expectation.expectedFindingKinds ?? []) {
    if (!findingKindsBeforeExpectationChecks.includes(expectedKind)) {
      localFindings.push({ kind: "expected_scenario_finding_missing", scenarioId: expectation.scenarioId, expected: expectedKind });
    }
  }

  findings.push(...localFindings);
  return {
    scenarioId: expectation.scenarioId,
    projectionRef: expectation.projectionRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: findingKindsBeforeExpectationChecks,
    projectionStatus: record?.status ?? null,
    activeFfet: record?.active_ffet ?? null,
    verifiedComponentCount: record?.components?.filter((component) => component.evidence_status === "verified").length ?? 0,
    blockedClaimCount: record?.blocked_claims?.length ?? 0,
    selfHealBudgetExhausted: Boolean(record?.self_heal_budget?.exhausted)
  };
}

function verifyRecord(
  expectation: H09HmcRecoveryProjectionScenarioExpectation,
  record: H09HmcRecoveryProjectionRecord
): H09HmcRecoveryProjectionFinding[] {
  const findings: H09HmcRecoveryProjectionFinding[] = [];
  if (record.schema_version !== "h09_hmc_recovery_projection_v1") {
    findings.push({ kind: "schema_version_invalid", expected: "h09_hmc_recovery_projection_v1", actual: record.schema_version ?? "missing" });
  }
  if (record.authority !== "derived_view_only" || record.claims?.hmc_authority === true) {
    findings.push({
      kind: "h09_projection_claims_authority",
      ref: record.projection_id ?? "h09:projection",
      detail: "HMC may project H09 recovery state, but cannot create recovery authority."
    });
  }
  validateMaturity("projection", record.maturity, findings);
  if (record.maturity === "api_backed" || record.maturity === "persistent" || record.maturity === "production_connected") {
    findings.push({ kind: "h09_projection_maturity_overclaim", expected: "fixture_backed", actual: record.maturity });
  }
  if (record.freshness !== "fresh") {
    findings.push({ kind: "h09_projection_not_fresh", expected: "fresh", actual: record.freshness ?? "missing" });
  }

  const components = record.components ?? [];
  const componentIds = new Set(components.map((component) => component.component_id));
  for (const required of REQUIRED_COMPONENTS) {
    if (!componentIds.has(required)) {
      findings.push({ kind: "h09_required_component_missing", ref: `h09_component:${required}` });
    }
  }
  for (const component of components) {
    validateMaturity(`component:${component.component_id ?? "missing"}`, component.maturity, findings);
    if (component.required === true && component.evidence_status !== "verified") {
      findings.push({
        kind: "h09_component_not_verified",
        ref: `h09_component:${component.component_id ?? "missing"}`,
        expected: "verified",
        actual: component.evidence_status ?? "missing"
      });
    }
    if (component.freshness !== "fresh") {
      findings.push({
        kind: "h09_component_not_fresh",
        ref: `h09_component:${component.component_id ?? "missing"}`,
        expected: "fresh",
        actual: component.freshness ?? "missing"
      });
    }
  }

  if (record.self_heal_budget) {
    findings.push(...verifyBudget(record.self_heal_budget));
  } else {
    findings.push({ kind: "h09_self_heal_budget_missing" });
  }
  if (record.recovery) {
    findings.push(...verifyRecovery(record.recovery));
  } else {
    findings.push({ kind: "h09_recovery_summary_missing" });
  }

  for (const prerequisite of record.prerequisite_closeouts ?? []) {
    if (
      prerequisite.closeout_status === "closeout_complete" &&
      prerequisite.evidence_status === "verified" &&
      prerequisite.terminal_learning_status === "complete"
    ) {
      continue;
    }
    findings.push({
      kind: "h09_prerequisite_not_closeout_complete",
      ref: `h09_prerequisite:${prerequisite.id ?? "missing"}`,
      expected: "closeout_complete/verified/complete",
      actual: `${prerequisite.closeout_status ?? "missing"}/${prerequisite.evidence_status ?? "missing"}/${prerequisite.terminal_learning_status ?? "missing"}`
    });
  }

  const claimChecks: readonly [boolean | undefined, string, string][] = [
    [record.claims?.live_autonomous_recovery, "h09_live_autonomous_recovery_overclaim", "live_autonomous_recovery_execution"],
    [record.claims?.production_rollback, "h09_production_rollback_overclaim", "production_rollback_executed"],
    [record.claims?.h10_learning_engine, "h09_h10_learning_engine_overclaim", "H10_learning_engine_implemented"],
    [record.claims?.h11_impact_graph, "h09_h11_impact_graph_overclaim", "H11_impact_graph_implemented"],
    [record.claims?.h12_box_assurance, "h09_h12_box_assurance_overclaim", "H12_box_assurance_engine_implemented"],
    [record.claims?.h13_system_assurance, "h09_h13_system_assurance_overclaim", "H13_system_assurance_engine_implemented"],
    [record.claims?.stable_agents, "h09_stable_agents_overclaim", "stable_agents"],
    [record.claims?.independent_audit, "h09_independent_audit_overclaim", "independent_quality_auditor_qualified"]
  ];
  for (const [enabled, kind, ref] of claimChecks) {
    if (enabled !== true) continue;
    findings.push({ kind, ref, expected: "cannot_claim_preserved", actual: "claimed" });
  }

  const recordCannotClaim = record.cannot_claim ?? [];
  for (const blocked of record.blocked_claims ?? []) {
    if (blocked.cannot_claim && recordCannotClaim.includes(blocked.cannot_claim)) continue;
    findings.push({
      kind: "h09_blocked_claim_missing_cannot_claim",
      ref: `h09_claim:${blocked.claim_id ?? "missing"}`,
      expected: blocked.cannot_claim ?? "missing"
    });
  }
  for (const cannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (recordCannotClaim.includes(cannotClaim)) continue;
    findings.push({
      kind: "missing_h09_projection_cannot_claim",
      ref: `cannot_claim:${cannotClaim}`,
      detail: "H09 HMC recovery projection must preserve precise cannot_claim boundaries."
    });
  }

  compareExpected(expectation, record, findings);
  return findings;
}

function verifyBudget(budget: H09ProjectionSelfHealBudgetRecord): H09HmcRecoveryProjectionFinding[] {
  const findings: H09HmcRecoveryProjectionFinding[] = [];
  if (budget.max_self_heals_per_ffet !== 3) {
    findings.push({ kind: "h09_self_heal_ffet_budget_invalid", expected: "3", actual: String(budget.max_self_heals_per_ffet ?? "missing") });
  }
  if (budget.max_self_heals_per_box !== 10) {
    findings.push({ kind: "h09_self_heal_box_budget_invalid", expected: "10", actual: String(budget.max_self_heals_per_box ?? "missing") });
  }
  if (budget.max_self_heals_for_full_run !== 30) {
    findings.push({
      kind: "h09_self_heal_full_run_budget_invalid",
      expected: "30",
      actual: String(budget.max_self_heals_for_full_run ?? "missing")
    });
  }
  if ((budget.used_for_ffet ?? 0) > (budget.max_self_heals_per_ffet ?? -1)) {
    findings.push({ kind: "h09_self_heal_ffet_budget_exceeded" });
  }
  if ((budget.used_for_box ?? 0) > (budget.max_self_heals_per_box ?? -1)) {
    findings.push({ kind: "h09_self_heal_box_budget_exceeded" });
  }
  if ((budget.used_for_full_run ?? 0) > (budget.max_self_heals_for_full_run ?? -1)) {
    findings.push({ kind: "h09_self_heal_full_run_budget_exceeded" });
  }
  if (budget.exhausted === true && !budget.exhaustion_classification) {
    findings.push({ kind: "h09_exhausted_budget_unclassified" });
  }
  if (budget.exhausted === true && budget.exhaustion_classification === "not_exhausted") {
    findings.push({ kind: "h09_exhausted_budget_classification_conflict" });
  }
  if (budget.freshness !== "fresh") {
    findings.push({ kind: "h09_self_heal_budget_not_fresh", expected: "fresh", actual: budget.freshness ?? "missing" });
  }
  return findings;
}

function verifyRecovery(recovery: H09ProjectionRecoveryRecord): H09HmcRecoveryProjectionFinding[] {
  const findings: H09HmcRecoveryProjectionFinding[] = [];
  for (const [status, ref] of [
    [recovery.policy_status, "recovery_policy"],
    [recovery.hard_stop_status, "hard_stop_detector"],
    [recovery.planner_status, "self_heal_planner"],
    [recovery.execution_status, "recovery_execution"],
    [recovery.quarantine_status, "quarantine"],
    [recovery.rollback_status, "rollback"],
    [recovery.anti_theatre_status, "anti_theatre"]
  ] as const) {
    if (status === "verified") continue;
    findings.push({ kind: "h09_recovery_component_not_verified", ref: `h09_recovery:${ref}`, expected: "verified", actual: status ?? "missing" });
  }
  if (recovery.live_autonomous_recovery === true) {
    findings.push({
      kind: "h09_live_autonomous_recovery_overclaim",
      ref: "h09_recovery:execution",
      expected: "false",
      actual: "true"
    });
  }
  if (recovery.production_rollback_executed === true) {
    findings.push({
      kind: "h09_production_rollback_overclaim",
      ref: "h09_recovery:rollback",
      expected: "false",
      actual: "true"
    });
  }
  if (recovery.freshness !== "fresh") {
    findings.push({ kind: "h09_recovery_summary_not_fresh", expected: "fresh", actual: recovery.freshness ?? "missing" });
  }
  return findings;
}

function compareExpected(
  expectation: H09HmcRecoveryProjectionScenarioExpectation,
  record: H09HmcRecoveryProjectionRecord,
  findings: H09HmcRecoveryProjectionFinding[]
): void {
  const expected = expectation.expected;
  if (!expected) return;
  const checks: readonly [string, string | undefined, string | undefined][] = [
    ["status", expected.status, record.status],
    ["activeFfet", expected.activeFfet, record.active_ffet],
    ["recoveryPolicyStatus", expected.recoveryPolicyStatus, record.recovery?.policy_status],
    ["selfHealPlannerStatus", expected.selfHealPlannerStatus, record.recovery?.planner_status],
    ["antiTheatreStatus", expected.antiTheatreStatus, record.recovery?.anti_theatre_status]
  ];
  for (const [field, expectedValue, actualValue] of checks) {
    if (!expectedValue || expectedValue === actualValue) continue;
    findings.push({
      kind: "scenario_expected_field_mismatch",
      scenarioId: expectation.scenarioId,
      ref: field,
      expected: expectedValue,
      actual: actualValue ?? "missing"
    });
  }
}

function validateMaturity(ref: string, maturity: H09RecoveryProjectionMaturity | undefined, findings: H09HmcRecoveryProjectionFinding[]): void {
  if (!maturity || !VALID_MATURITIES.has(maturity)) {
    findings.push({ kind: "invalid_maturity", ref, actual: maturity ?? "missing" });
  }
}

function validateSha256(value: string, kind: string): H09HmcRecoveryProjectionFinding | null {
  if (!SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) {
    return { kind, actual: value };
  }
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H09HmcRecoveryProjectionFinding[]
): string | null {
  const [scheme, rest] = ref.split("://", 2);
  if (!scheme || !rest) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const root = logicalRoots[scheme];
  if (!root) {
    findings.push({ kind: "logical_root_missing", ref });
    return null;
  }
  if (isAbsolute(rest) || rest.includes("\0")) {
    findings.push({ kind: "logical_path_escape", ref });
    return null;
  }
  const rootPath = resolve(root);
  const resolved = resolve(rootPath, normalize(rest));
  const relativePath = relative(rootPath, resolved);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    findings.push({ kind: "logical_path_escape", ref });
    return null;
  }
  return resolved;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function containsPrivateMetadata(value: unknown): boolean {
  if (typeof value === "string") return PRIVATE_METADATA_PATTERN.test(value);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsPrivateMetadata(item));
  return Object.values(value).some((item) => containsPrivateMetadata(item));
}
