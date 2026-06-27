import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H09RecoveryPolicyStatus = "passed" | "failed";
export type H09ExpectedRecoveryPolicyStatus = "passed" | "failed";
export type H09FailureSeverity = "low" | "medium" | "high" | "critical";
export type H09RecoveryDecision = "self_heal_allowed" | "human_decision_required" | "hard_stop" | "blocked";

export interface H09RecoveryPolicyConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H09RecoveryPolicyScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H09RecoveryPolicyScenarioExpectation {
  readonly scenarioId: string;
  readonly policyRef: string;
  readonly policySha256: string;
  readonly expectedStatus: H09ExpectedRecoveryPolicyStatus;
  readonly expectedDecision?: H09RecoveryDecision;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H09RecoveryPolicyExpectedRecord;
}

export interface H09RecoveryPolicyExpectedRecord {
  readonly maxSelfHealsPerFfet?: number;
  readonly maxSelfHealsPerBox?: number;
  readonly maxSelfHealsForFullRun?: number;
  readonly exhaustedBudgetOutcome?: string;
}

export interface H09RecoveryPolicyReport {
  readonly status: H09RecoveryPolicyStatus;
  readonly findings: readonly H09RecoveryPolicyFinding[];
  readonly scenario_results: readonly H09RecoveryPolicyScenarioResult[];
  readonly verified_refs: readonly H09VerifiedRecoveryPolicyRef[];
  readonly recovery_summary: H09RecoveryPolicySummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H09RecoveryPolicyScenarioResult {
  readonly scenarioId: string;
  readonly policyRef: string;
  readonly status: H09RecoveryPolicyStatus;
  readonly expectedStatus: H09ExpectedRecoveryPolicyStatus;
  readonly findingKinds: readonly string[];
  readonly decision: H09RecoveryDecision;
  readonly maxSelfHealsPerFfet: number | null;
  readonly hardStopClassCount: number;
  readonly allowedActionCount: number;
}

export interface H09VerifiedRecoveryPolicyRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h09_recovery_policy";
}

export interface H09RecoveryPolicyFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H09RecoveryPolicySummary {
  readonly verified_ref_count: number;
  readonly self_heal_allowed_count: number;
  readonly hard_stop_count: number;
  readonly human_decision_required_count: number;
  readonly blocked_count: number;
  readonly blocking_finding_count: number;
}

interface H09RecoveryPolicyRecord {
  readonly schema_version?: string;
  readonly policy_id?: string;
  readonly mode?: "fixture" | "policy" | "live";
  readonly budgets?: {
    readonly max_self_heals_per_ffet?: number;
    readonly max_self_heals_per_box?: number;
    readonly max_self_heals_for_full_h07_h12_run?: number;
    readonly repeated_same_class_failure_after_two_ffets?: "systemic_blocker" | "continue";
    readonly exhausted_budget_outcome?: "SELF_HEAL_EXHAUSTED_HARD_STOP" | "accepted_debt" | "continue";
  };
  readonly allowed_recovery_actions?: readonly H09RecoveryActionRecord[];
  readonly hard_stop_classes?: readonly H09FailureClassRecord[];
  readonly failure_classifications?: readonly H09FailureClassRecord[];
  readonly recovery_boundaries?: H09RecoveryBoundariesRecord;
  readonly claims?: H09RecoveryPolicyClaimsRecord;
  readonly cannot_claim?: readonly string[];
}

interface H09RecoveryActionRecord {
  readonly action_id?: string;
  readonly deterministic?: boolean;
  readonly scoped?: boolean;
  readonly evidence_preserving?: boolean;
  readonly requires_human_decision?: boolean;
  readonly allowed?: boolean;
}

interface H09FailureClassRecord {
  readonly class_id?: string;
  readonly severity?: H09FailureSeverity;
  readonly self_heal_allowed?: boolean;
  readonly human_decision_required?: boolean;
  readonly hard_stop?: boolean;
  readonly evidence_preserving_required?: boolean;
  readonly cannot_claim?: string;
}

interface H09RecoveryBoundariesRecord {
  readonly deterministic_only?: boolean;
  readonly evidence_preserving?: boolean;
  readonly scoped?: boolean;
  readonly no_authority_repair_without_human_decision?: boolean;
  readonly no_schema_semantics_repair_without_human_decision?: boolean;
  readonly no_security_exposure_self_heal?: boolean;
  readonly no_license_conflict_self_heal?: boolean;
  readonly no_scope_expansion_self_heal?: boolean;
  readonly no_free_autonomous_fixing?: boolean;
}

interface H09RecoveryPolicyClaimsRecord {
  readonly unbounded_self_heal?: boolean;
  readonly authority_repair_without_human_decision?: boolean;
  readonly schema_semantics_repair_without_human_decision?: boolean;
  readonly security_exposure_self_heal?: boolean;
  readonly license_conflict_self_heal?: boolean;
  readonly scope_expansion_self_heal?: boolean;
  readonly budget_exhaustion_success?: boolean;
  readonly stable_agents?: boolean;
  readonly independent_audit?: boolean;
  readonly production_recovery?: boolean;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;
const REQUIRED_HARD_STOP_CLASSES = [
  "authority_conflict",
  "schema_authority_gap",
  "secret_or_private_data_exposure",
  "licence_conflict",
  "scope_expansion",
  "product_plane_contamination"
];
const REQUIRED_ALLOWED_ACTIONS = [
  "correction_pr",
  "append_only_supersession",
  "quarantine",
  "validation_rerun",
  "rollback_routing"
];
const FORBIDDEN_ALLOWED_ACTIONS = [
  "force_push",
  "history_rewrite",
  "github_settings_mutation",
  "branch_protection_mutation",
  "unscoped_cleanup",
  "production_rollback"
];
const REQUIRED_CANNOT_CLAIM = [
  "H09_recovery_engine_implemented",
  "unbounded_self_heal",
  "authority_repair_without_human_decision",
  "stable_agents",
  "mechanically_independent_agents"
];

export function verifyH09RecoveryPolicyConfig(config: H09RecoveryPolicyConfig): H09RecoveryPolicyReport {
  const findings: H09RecoveryPolicyFinding[] = [];
  const verifiedRefs: H09VerifiedRecoveryPolicyRef[] = [];
  const scenarioResults = config.scenarios.map((scenario) => verifyScenario(config, scenario, findings, verifiedRefs));
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "scenario_status_unexpected" ||
        finding.kind === "scenario_decision_unexpected" ||
        finding.kind === "expected_scenario_finding_missing"
    );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    recovery_summary: {
      verified_ref_count: verifiedRefs.length,
      self_heal_allowed_count: scenarioResults.filter((result) => result.decision === "self_heal_allowed").length,
      hard_stop_count: scenarioResults.filter((result) => result.decision === "hard_stop").length,
      human_decision_required_count: scenarioResults.filter((result) => result.decision === "human_decision_required").length,
      blocked_count: scenarioResults.filter((result) => result.decision === "blocked").length,
      blocking_finding_count: findings.length
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H09RecoveryPolicyConfig,
  expectation: H09RecoveryPolicyScenarioExpectation,
  findings: H09RecoveryPolicyFinding[],
  verifiedRefs: H09VerifiedRecoveryPolicyRef[]
): H09RecoveryPolicyScenarioResult {
  const localFindings: H09RecoveryPolicyFinding[] = [];
  const hashFinding = validateSha256(expectation.policySha256, "policy_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.policyRef });

  const policyPath = resolveLogicalRef(expectation.policyRef, config.logicalRoots, localFindings);
  let record: H09RecoveryPolicyRecord | null = null;
  if (policyPath && existsSync(policyPath) && localFindings.length === 0) {
    const text = readFileSync(policyPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.policySha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "policy_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.policyRef,
        path: policyPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.policyRef, path: policyPath, sha256: actualHash, source: "h09_recovery_policy" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.policyRef });
    }
    try {
      record = JSON.parse(text) as H09RecoveryPolicyRecord;
    } catch (error) {
      localFindings.push({
        kind: "policy_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.policyRef });
    }
  } else if (policyPath && !existsSync(policyPath)) {
    localFindings.push({ kind: "policy_missing", scenarioId: expectation.scenarioId, ref: expectation.policyRef, path: policyPath });
  }

  if (record) localFindings.push(...verifyRecord(expectation, record));

  const decision = inferDecision(localFindings, record);
  const actualStatus: H09RecoveryPolicyStatus = localFindings.length === 0 ? "passed" : "failed";
  const findingKindsBeforeExpectationChecks = localFindings.map((finding) => finding.kind);
  if (actualStatus !== expectation.expectedStatus) {
    localFindings.push({
      kind: "scenario_status_unexpected",
      scenarioId: expectation.scenarioId,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }
  if (expectation.expectedDecision && decision !== expectation.expectedDecision) {
    localFindings.push({
      kind: "scenario_decision_unexpected",
      scenarioId: expectation.scenarioId,
      expected: expectation.expectedDecision,
      actual: decision
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
    policyRef: expectation.policyRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: findingKindsBeforeExpectationChecks,
    decision,
    maxSelfHealsPerFfet: record?.budgets?.max_self_heals_per_ffet ?? null,
    hardStopClassCount: record?.hard_stop_classes?.length ?? 0,
    allowedActionCount: record?.allowed_recovery_actions?.filter((action) => action.allowed !== false).length ?? 0
  };
}

function verifyRecord(
  expectation: H09RecoveryPolicyScenarioExpectation,
  record: H09RecoveryPolicyRecord
): H09RecoveryPolicyFinding[] {
  const findings: H09RecoveryPolicyFinding[] = [];
  if (record.schema_version !== "hadaf_h09_recovery_policy_v1") {
    findings.push({ kind: "schema_version_invalid", expected: "hadaf_h09_recovery_policy_v1", actual: String(record.schema_version) });
  }
  if (!record.policy_id) findings.push({ kind: "policy_id_missing" });
  if (record.mode === "live") findings.push({ kind: "live_recovery_policy_overclaim" });

  findings.push(...verifyBudgets(expectation, record));
  findings.push(...verifyHardStops(record));
  findings.push(...verifyAllowedActions(record));
  findings.push(...verifyBoundaries(record));
  findings.push(...verifyClaims(record));

  for (const cannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (!record.cannot_claim?.includes(cannotClaim)) {
      findings.push({ kind: "required_cannot_claim_missing", expected: cannotClaim });
    }
  }

  return findings;
}

function verifyBudgets(
  expectation: H09RecoveryPolicyScenarioExpectation,
  record: H09RecoveryPolicyRecord
): H09RecoveryPolicyFinding[] {
  const findings: H09RecoveryPolicyFinding[] = [];
  const budgets = record.budgets;
  if (!budgets) return [{ kind: "budgets_missing" }];
  const checks: readonly [number | undefined, number, string][] = [
    [budgets.max_self_heals_per_ffet, 3, "max_self_heals_per_ffet"],
    [budgets.max_self_heals_per_box, 10, "max_self_heals_per_box"],
    [budgets.max_self_heals_for_full_h07_h12_run, 30, "max_self_heals_for_full_h07_h12_run"]
  ];
  for (const [actual, max, field] of checks) {
    if (!Number.isInteger(actual) || (actual ?? 0) < 0) {
      findings.push({ kind: "budget_invalid", detail: field, expected: `integer <= ${max}`, actual: String(actual) });
    } else if ((actual ?? 0) > max) {
      findings.push({ kind: "budget_exceeds_run_control", detail: field, expected: `<= ${max}`, actual: String(actual) });
    }
  }
  if (budgets.repeated_same_class_failure_after_two_ffets !== "systemic_blocker") {
    findings.push({
      kind: "same_class_failure_not_systemic_blocker",
      expected: "systemic_blocker",
      actual: String(budgets.repeated_same_class_failure_after_two_ffets)
    });
  }
  if (budgets.exhausted_budget_outcome !== "SELF_HEAL_EXHAUSTED_HARD_STOP") {
    findings.push({
      kind: "budget_exhaustion_not_hard_stop",
      expected: "SELF_HEAL_EXHAUSTED_HARD_STOP",
      actual: String(budgets.exhausted_budget_outcome)
    });
  }
  const expected = expectation.expected;
  if (expected?.maxSelfHealsPerFfet !== undefined && budgets.max_self_heals_per_ffet !== expected.maxSelfHealsPerFfet) {
    findings.push({ kind: "expected_budget_mismatch", detail: "max_self_heals_per_ffet" });
  }
  if (expected?.maxSelfHealsPerBox !== undefined && budgets.max_self_heals_per_box !== expected.maxSelfHealsPerBox) {
    findings.push({ kind: "expected_budget_mismatch", detail: "max_self_heals_per_box" });
  }
  if (
    expected?.maxSelfHealsForFullRun !== undefined &&
    budgets.max_self_heals_for_full_h07_h12_run !== expected.maxSelfHealsForFullRun
  ) {
    findings.push({ kind: "expected_budget_mismatch", detail: "max_self_heals_for_full_h07_h12_run" });
  }
  if (expected?.exhaustedBudgetOutcome !== undefined && budgets.exhausted_budget_outcome !== expected.exhaustedBudgetOutcome) {
    findings.push({ kind: "expected_budget_mismatch", detail: "exhausted_budget_outcome" });
  }
  return findings;
}

function verifyHardStops(record: H09RecoveryPolicyRecord): H09RecoveryPolicyFinding[] {
  const findings: H09RecoveryPolicyFinding[] = [];
  const hardStops = record.hard_stop_classes ?? [];
  for (const requiredClass of REQUIRED_HARD_STOP_CLASSES) {
    const match = hardStops.find((failureClass) => failureClass.class_id === requiredClass);
    if (!match) {
      findings.push({ kind: "required_hard_stop_missing", expected: requiredClass });
      continue;
    }
    if (match.self_heal_allowed) findings.push({ kind: "hard_stop_self_heal_allowed", detail: requiredClass });
    if (!match.human_decision_required) findings.push({ kind: "hard_stop_human_decision_not_required", detail: requiredClass });
    if (!match.hard_stop) findings.push({ kind: "hard_stop_flag_missing", detail: requiredClass });
  }
  return findings;
}

function verifyAllowedActions(record: H09RecoveryPolicyRecord): H09RecoveryPolicyFinding[] {
  const findings: H09RecoveryPolicyFinding[] = [];
  const actions = record.allowed_recovery_actions ?? [];
  for (const requiredAction of REQUIRED_ALLOWED_ACTIONS) {
    const action = actions.find((entry) => entry.action_id === requiredAction && entry.allowed !== false);
    if (!action) {
      findings.push({ kind: "required_recovery_action_missing", expected: requiredAction });
      continue;
    }
    if (!action.deterministic) findings.push({ kind: "recovery_action_not_deterministic", detail: requiredAction });
    if (!action.scoped) findings.push({ kind: "recovery_action_not_scoped", detail: requiredAction });
    if (!action.evidence_preserving) findings.push({ kind: "recovery_action_not_evidence_preserving", detail: requiredAction });
  }
  for (const forbiddenAction of FORBIDDEN_ALLOWED_ACTIONS) {
    const action = actions.find((entry) => entry.action_id === forbiddenAction && entry.allowed !== false);
    if (action) findings.push({ kind: "forbidden_recovery_action_allowed", detail: forbiddenAction });
  }
  return findings;
}

function verifyBoundaries(record: H09RecoveryPolicyRecord): H09RecoveryPolicyFinding[] {
  const boundaries = record.recovery_boundaries;
  if (!boundaries) return [{ kind: "recovery_boundaries_missing" }];
  const requiredTrueFields: readonly [keyof H09RecoveryBoundariesRecord, string][] = [
    ["deterministic_only", "deterministic_only"],
    ["evidence_preserving", "evidence_preserving"],
    ["scoped", "scoped"],
    ["no_authority_repair_without_human_decision", "no_authority_repair_without_human_decision"],
    ["no_schema_semantics_repair_without_human_decision", "no_schema_semantics_repair_without_human_decision"],
    ["no_security_exposure_self_heal", "no_security_exposure_self_heal"],
    ["no_license_conflict_self_heal", "no_license_conflict_self_heal"],
    ["no_scope_expansion_self_heal", "no_scope_expansion_self_heal"],
    ["no_free_autonomous_fixing", "no_free_autonomous_fixing"]
  ];
  return requiredTrueFields.flatMap(([field, detail]) => (boundaries[field] ? [] : [{ kind: "recovery_boundary_missing", detail }]));
}

function verifyClaims(record: H09RecoveryPolicyRecord): H09RecoveryPolicyFinding[] {
  const claims = record.claims ?? {};
  const claimChecks: readonly [boolean | undefined, string][] = [
    [claims.unbounded_self_heal, "unbounded_self_heal_overclaim"],
    [claims.authority_repair_without_human_decision, "authority_repair_overclaim"],
    [claims.schema_semantics_repair_without_human_decision, "schema_semantics_repair_overclaim"],
    [claims.security_exposure_self_heal, "security_exposure_self_heal_overclaim"],
    [claims.license_conflict_self_heal, "license_conflict_self_heal_overclaim"],
    [claims.scope_expansion_self_heal, "scope_expansion_self_heal_overclaim"],
    [claims.budget_exhaustion_success, "budget_exhaustion_success_overclaim"],
    [claims.stable_agents, "stable_agents_overclaim"],
    [claims.independent_audit, "independent_audit_overclaim"],
    [claims.production_recovery, "production_recovery_overclaim"]
  ];
  return claimChecks.flatMap(([claimed, kind]) => (claimed ? [{ kind }] : []));
}

function inferDecision(findings: readonly H09RecoveryPolicyFinding[], record: H09RecoveryPolicyRecord | null): H09RecoveryDecision {
  if (findings.some((finding) => finding.kind.includes("hard_stop") || finding.kind.includes("authority") || finding.kind.includes("security"))) {
    return "hard_stop";
  }
  if (findings.some((finding) => finding.kind.includes("human_decision"))) return "human_decision_required";
  if (findings.length > 0 || !record) return "blocked";
  return "self_heal_allowed";
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H09RecoveryPolicyFinding[]
): string | null {
  const [root, rest] = ref.split("://", 2);
  if (!root || rest === undefined) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const rootPath = logicalRoots[root];
  if (!rootPath) {
    findings.push({ kind: "logical_root_missing", ref, detail: root });
    return null;
  }
  const resolvedRoot = resolve(rootPath);
  const resolvedPath = resolve(resolvedRoot, rest);
  const relativePath = relative(resolvedRoot, resolvedPath);
  if (isAbsolute(rest) || relativePath.startsWith("..") || isAbsolute(relativePath) || normalize(relativePath) !== relativePath) {
    findings.push({ kind: "logical_path_escape", ref });
    return null;
  }
  return resolvedPath;
}

function validateSha256(value: string, kind: string): H09RecoveryPolicyFinding | null {
  if (!SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) return { kind, actual: value };
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function containsPrivateMetadata(value: unknown): boolean {
  return PRIVATE_METADATA_PATTERN.test(JSON.stringify(value));
}
