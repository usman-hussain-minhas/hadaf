import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H09SelfHealPlannerStatus = "passed" | "failed";
export type H09ExpectedSelfHealPlannerStatus = "passed" | "failed";
export type H09SelfHealDecision = "plan_ready" | "human_decision_required" | "hard_stop" | "blocked";
export type H09SelfHealSeverity = "low" | "medium" | "high" | "critical";

export interface H09SelfHealPlannerConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H09SelfHealScenarioExpectation[];
  readonly budgets: H09SelfHealBudgetLimits;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H09SelfHealBudgetLimits {
  readonly maxSelfHealsPerFfet: number;
  readonly maxSelfHealsPerBox: number;
  readonly maxSelfHealsForFullRun: number;
  readonly repeatedSameClassFailureAfterFfets: number;
}

export interface H09SelfHealScenarioExpectation {
  readonly scenarioId: string;
  readonly requestRef: string;
  readonly requestSha256: string;
  readonly expectedStatus: H09ExpectedSelfHealPlannerStatus;
  readonly expectedDecision?: H09SelfHealDecision;
  readonly expectedFindingKinds?: readonly string[];
  readonly expectedPlanActions?: readonly string[];
}

export interface H09SelfHealPlannerReport {
  readonly status: H09SelfHealPlannerStatus;
  readonly findings: readonly H09SelfHealPlannerFinding[];
  readonly scenario_results: readonly H09SelfHealScenarioResult[];
  readonly verified_refs: readonly H09VerifiedSelfHealPlanRef[];
  readonly planner_summary: H09SelfHealPlannerSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H09SelfHealScenarioResult {
  readonly scenarioId: string;
  readonly requestRef: string;
  readonly status: H09SelfHealPlannerStatus;
  readonly expectedStatus: H09ExpectedSelfHealPlannerStatus;
  readonly findingKinds: readonly string[];
  readonly decision: H09SelfHealDecision;
  readonly plannedActions: readonly string[];
  readonly failureClass: string | null;
  readonly hardStop: boolean;
  readonly humanDecisionRequired: boolean;
}

export interface H09VerifiedSelfHealPlanRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h09_self_heal_plan_request";
}

export interface H09SelfHealPlannerFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H09SelfHealPlannerSummary {
  readonly verified_ref_count: number;
  readonly plan_ready_count: number;
  readonly hard_stop_count: number;
  readonly human_decision_required_count: number;
  readonly blocked_count: number;
  readonly blocking_finding_count: number;
}

interface H09SelfHealPlanRequestRecord {
  readonly schema_version?: string;
  readonly request_id?: string;
  readonly mode?: "fixture" | "planner_input" | "live";
  readonly failure?: {
    readonly class_id?: string;
    readonly severity?: H09SelfHealSeverity;
    readonly description?: string;
  };
  readonly attempt_state?: {
    readonly self_heals_used_for_ffet?: number;
    readonly self_heals_used_for_box?: number;
    readonly self_heals_used_for_run?: number;
  };
  readonly observed_failures?: readonly H09ObservedFailureRecord[];
  readonly proposed_actions?: readonly H09SelfHealActionRecord[];
  readonly guards?: H09SelfHealGuardRecord;
  readonly human_decision?: H09HumanDecisionRecord;
  readonly claims?: H09SelfHealClaimsRecord;
  readonly cannot_claim?: readonly string[];
}

interface H09ObservedFailureRecord {
  readonly ffet_id?: string;
  readonly class_id?: string;
  readonly count?: number;
}

interface H09SelfHealActionRecord {
  readonly action_id?: string;
  readonly deterministic?: boolean;
  readonly scoped?: boolean;
  readonly evidence_preserving?: boolean;
  readonly requires_human_decision?: boolean;
  readonly mutates_authority?: boolean;
  readonly mutates_schema?: boolean;
  readonly mutates_security?: boolean;
  readonly mutates_license?: boolean;
  readonly expands_scope?: boolean;
  readonly rollback_defined?: boolean;
}

interface H09SelfHealGuardRecord {
  readonly exact_sha_required?: boolean;
  readonly validation_required?: boolean;
  readonly evidence_manifest_required?: boolean;
  readonly terminal_learning_required?: boolean;
  readonly public_safety_required?: boolean;
  readonly no_private_data?: boolean;
  readonly no_product_plane_contamination?: boolean;
}

interface H09HumanDecisionRecord {
  readonly provided?: boolean;
  readonly decision_ref?: string;
  readonly decision_sha256?: string;
}

interface H09SelfHealClaimsRecord {
  readonly free_autonomous_fixing?: boolean;
  readonly authority_repair_without_human_decision?: boolean;
  readonly schema_repair_without_human_decision?: boolean;
  readonly security_repair_without_hard_stop?: boolean;
  readonly license_repair_without_human_decision?: boolean;
  readonly scope_expansion_without_human_decision?: boolean;
  readonly budget_exhaustion_recoverable?: boolean;
  readonly stable_agents?: boolean;
  readonly independent_audit?: boolean;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;
const HARD_STOP_CLASSES = [
  "authority_conflict",
  "schema_authority_gap",
  "secret_or_private_data_exposure",
  "licence_conflict",
  "scope_expansion",
  "product_plane_contamination"
];
const FORBIDDEN_ACTIONS = [
  "force_push",
  "history_rewrite",
  "github_settings_mutation",
  "branch_protection_mutation",
  "production_deployment",
  "package_publication"
];
const REQUIRED_GUARDS: readonly (keyof H09SelfHealGuardRecord)[] = [
  "exact_sha_required",
  "validation_required",
  "evidence_manifest_required",
  "terminal_learning_required",
  "public_safety_required",
  "no_private_data",
  "no_product_plane_contamination"
];
const REQUIRED_CANNOT_CLAIM = [
  "free_autonomous_fixing",
  "authority_repair_without_human_decision",
  "security_repair_without_hard_stop",
  "stable_agents",
  "mechanically_independent_agents"
];

export function verifyH09SelfHealPlannerConfig(config: H09SelfHealPlannerConfig): H09SelfHealPlannerReport {
  const findings: H09SelfHealPlannerFinding[] = [];
  const verifiedRefs: H09VerifiedSelfHealPlanRef[] = [];
  const budgetFindings = validateBudgetLimits(config.budgets);
  findings.push(...budgetFindings);
  const scenarioResults = config.scenarios.map((scenario) =>
    verifyScenario(config, scenario, findings, verifiedRefs, budgetFindings.length > 0)
  );
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "scenario_status_unexpected" ||
        finding.kind === "scenario_decision_unexpected" ||
        finding.kind === "expected_scenario_finding_missing" ||
        finding.kind === "expected_plan_action_missing"
    );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    planner_summary: {
      verified_ref_count: verifiedRefs.length,
      plan_ready_count: scenarioResults.filter((result) => result.decision === "plan_ready").length,
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
  config: H09SelfHealPlannerConfig,
  expectation: H09SelfHealScenarioExpectation,
  findings: H09SelfHealPlannerFinding[],
  verifiedRefs: H09VerifiedSelfHealPlanRef[],
  configBudgetInvalid: boolean
): H09SelfHealScenarioResult {
  const localFindings: H09SelfHealPlannerFinding[] = [];
  const hashFinding = validateSha256(expectation.requestSha256, "request_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.requestRef });

  const requestPath = resolveLogicalRef(expectation.requestRef, config.logicalRoots, localFindings);
  let record: H09SelfHealPlanRequestRecord | null = null;
  if (requestPath && existsSync(requestPath) && localFindings.length === 0) {
    const text = readFileSync(requestPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.requestSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "request_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.requestRef,
        path: requestPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.requestRef, path: requestPath, sha256: actualHash, source: "h09_self_heal_plan_request" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.requestRef });
    }
    try {
      record = JSON.parse(text) as H09SelfHealPlanRequestRecord;
    } catch (error) {
      localFindings.push({
        kind: "request_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.requestRef });
    }
  } else if (requestPath && !existsSync(requestPath)) {
    localFindings.push({ kind: "request_missing", scenarioId: expectation.scenarioId, ref: expectation.requestRef, path: requestPath });
  }

  if (record) localFindings.push(...verifyRecord(config.budgets, record));

  const decision = inferDecision(localFindings, record, configBudgetInvalid);
  const actualStatus: H09SelfHealPlannerStatus = localFindings.length === 0 && !configBudgetInvalid ? "passed" : "failed";
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
  const plannedActions = record?.proposed_actions?.map((action) => action.action_id).filter((action): action is string => Boolean(action)) ?? [];
  for (const expectedAction of expectation.expectedPlanActions ?? []) {
    if (!plannedActions.includes(expectedAction)) {
      localFindings.push({ kind: "expected_plan_action_missing", scenarioId: expectation.scenarioId, expected: expectedAction });
    }
  }

  findings.push(...localFindings);
  return {
    scenarioId: expectation.scenarioId,
    requestRef: expectation.requestRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: findingKindsBeforeExpectationChecks,
    decision,
    plannedActions,
    failureClass: record?.failure?.class_id ?? null,
    hardStop: Boolean(record?.failure?.class_id && HARD_STOP_CLASSES.includes(record.failure.class_id)),
    humanDecisionRequired: decision === "human_decision_required" || decision === "hard_stop"
  };
}

function validateBudgetLimits(budgets: H09SelfHealBudgetLimits | undefined): H09SelfHealPlannerFinding[] {
  if (!budgets) return [{ kind: "budget_limits_missing" }];
  const checks: readonly [number, number, string][] = [
    [budgets.maxSelfHealsPerFfet, 3, "maxSelfHealsPerFfet"],
    [budgets.maxSelfHealsPerBox, 10, "maxSelfHealsPerBox"],
    [budgets.maxSelfHealsForFullRun, 30, "maxSelfHealsForFullRun"],
    [budgets.repeatedSameClassFailureAfterFfets, 2, "repeatedSameClassFailureAfterFfets"]
  ];
  return checks.flatMap(([actual, max, field]) => {
    if (!Number.isInteger(actual) || actual < 0) return [{ kind: "budget_limit_invalid", detail: field, expected: `integer <= ${max}`, actual: String(actual) }];
    if (actual > max) return [{ kind: "budget_limit_exceeds_run_control", detail: field, expected: `<= ${max}`, actual: String(actual) }];
    return [];
  });
}

function verifyRecord(budgets: H09SelfHealBudgetLimits, record: H09SelfHealPlanRequestRecord): H09SelfHealPlannerFinding[] {
  const findings: H09SelfHealPlannerFinding[] = [];
  if (record.schema_version !== "hadaf_h09_self_heal_plan_request_v1") {
    findings.push({ kind: "schema_version_invalid", expected: "hadaf_h09_self_heal_plan_request_v1", actual: String(record.schema_version) });
  }
  if (!record.request_id) findings.push({ kind: "request_id_missing" });
  if (record.mode === "live") findings.push({ kind: "live_recovery_execution_overclaim" });
  if (!record.failure?.class_id) findings.push({ kind: "failure_class_missing" });

  findings.push(...verifyAttemptState(budgets, record));
  findings.push(...verifyObservedFailures(budgets, record));
  findings.push(...verifyActions(record));
  findings.push(...verifyGuards(record));
  findings.push(...verifyHumanDecision(record));
  findings.push(...verifyClaims(record));

  for (const cannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (!record.cannot_claim?.includes(cannotClaim)) {
      findings.push({ kind: "required_cannot_claim_missing", expected: cannotClaim });
    }
  }

  return findings;
}

function verifyAttemptState(budgets: H09SelfHealBudgetLimits, record: H09SelfHealPlanRequestRecord): H09SelfHealPlannerFinding[] {
  const state = record.attempt_state;
  if (!state) return [{ kind: "attempt_state_missing" }];
  const checks: readonly [number | undefined, number, string][] = [
    [state.self_heals_used_for_ffet, budgets.maxSelfHealsPerFfet, "self_heals_used_for_ffet"],
    [state.self_heals_used_for_box, budgets.maxSelfHealsPerBox, "self_heals_used_for_box"],
    [state.self_heals_used_for_run, budgets.maxSelfHealsForFullRun, "self_heals_used_for_run"]
  ];
  return checks.flatMap(([actual, max, field]) => {
    if (!Number.isInteger(actual) || (actual ?? -1) < 0) return [{ kind: "attempt_state_invalid", detail: field }];
    if ((actual ?? 0) >= max) return [{ kind: "self_heal_budget_exhausted", detail: field, expected: `< ${max}`, actual: String(actual) }];
    return [];
  });
}

function verifyObservedFailures(budgets: H09SelfHealBudgetLimits, record: H09SelfHealPlanRequestRecord): H09SelfHealPlannerFinding[] {
  const targetClass = record.failure?.class_id;
  if (!targetClass) return [];
  const sameClassCount = (record.observed_failures ?? [])
    .filter((failure) => failure.class_id === targetClass)
    .reduce((sum, failure) => sum + (Number.isInteger(failure.count) ? failure.count ?? 0 : 1), 0);
  return sameClassCount >= budgets.repeatedSameClassFailureAfterFfets
    ? [{ kind: "repeated_same_class_systemic_blocker", detail: targetClass, expected: `< ${budgets.repeatedSameClassFailureAfterFfets}`, actual: String(sameClassCount) }]
    : [];
}

function verifyActions(record: H09SelfHealPlanRequestRecord): H09SelfHealPlannerFinding[] {
  const actions = record.proposed_actions ?? [];
  if (actions.length === 0) return [{ kind: "proposed_action_missing" }];
  const hardStopClass = Boolean(record.failure?.class_id && HARD_STOP_CLASSES.includes(record.failure.class_id));
  const humanDecisionProvided = hasValidHumanDecision(record.human_decision);
  return actions.flatMap((action) => {
    const findings: H09SelfHealPlannerFinding[] = [];
    const actionId = action.action_id ?? "unknown_action";
    if (!action.action_id) findings.push({ kind: "action_id_missing" });
    if (FORBIDDEN_ACTIONS.includes(actionId)) findings.push({ kind: "forbidden_action_planned", detail: actionId });
    if (!action.deterministic) findings.push({ kind: "action_not_deterministic", detail: actionId });
    if (!action.scoped) findings.push({ kind: "action_not_scoped", detail: actionId });
    if (!action.evidence_preserving) findings.push({ kind: "action_not_evidence_preserving", detail: actionId });
    if (!action.rollback_defined) findings.push({ kind: "action_rollback_missing", detail: actionId });
    if (hardStopClass && !humanDecisionProvided) findings.push({ kind: "hard_stop_requires_human_decision", detail: String(record.failure?.class_id) });
    if (action.mutates_authority && !humanDecisionProvided) findings.push({ kind: "authority_repair_without_human_decision", detail: actionId });
    if (action.mutates_schema && !humanDecisionProvided) findings.push({ kind: "schema_repair_without_human_decision", detail: actionId });
    if (action.mutates_security && !humanDecisionProvided) findings.push({ kind: "security_repair_without_human_decision", detail: actionId });
    if (action.mutates_license && !humanDecisionProvided) findings.push({ kind: "license_repair_without_human_decision", detail: actionId });
    if (action.expands_scope && !humanDecisionProvided) findings.push({ kind: "scope_expansion_without_human_decision", detail: actionId });
    if (action.requires_human_decision && !humanDecisionProvided) findings.push({ kind: "required_human_decision_missing", detail: actionId });
    return findings;
  });
}

function verifyGuards(record: H09SelfHealPlanRequestRecord): H09SelfHealPlannerFinding[] {
  const guards = record.guards;
  if (!guards) return [{ kind: "guards_missing" }];
  return REQUIRED_GUARDS.flatMap((guard) => (guards[guard] ? [] : [{ kind: "required_guard_missing", detail: guard }]));
}

function verifyHumanDecision(record: H09SelfHealPlanRequestRecord): H09SelfHealPlannerFinding[] {
  const humanDecision = record.human_decision;
  if (!humanDecision?.provided) return [];
  const findings: H09SelfHealPlannerFinding[] = [];
  if (!humanDecision.decision_ref) findings.push({ kind: "human_decision_ref_missing" });
  const hashFinding = validateSha256(humanDecision.decision_sha256 ?? "", "human_decision_hash_invalid");
  if (hashFinding) findings.push(hashFinding);
  return findings;
}

function verifyClaims(record: H09SelfHealPlanRequestRecord): H09SelfHealPlannerFinding[] {
  const claims = record.claims ?? {};
  const claimChecks: readonly [boolean | undefined, string][] = [
    [claims.free_autonomous_fixing, "free_autonomous_fixing_overclaim"],
    [claims.authority_repair_without_human_decision, "authority_repair_overclaim"],
    [claims.schema_repair_without_human_decision, "schema_repair_overclaim"],
    [claims.security_repair_without_hard_stop, "security_repair_without_hard_stop_overclaim"],
    [claims.license_repair_without_human_decision, "license_repair_overclaim"],
    [claims.scope_expansion_without_human_decision, "scope_expansion_overclaim"],
    [claims.budget_exhaustion_recoverable, "budget_exhaustion_recoverable_overclaim"],
    [claims.stable_agents, "stable_agents_overclaim"],
    [claims.independent_audit, "independent_audit_overclaim"]
  ];
  return claimChecks.flatMap(([claimed, kind]) => (claimed ? [{ kind }] : []));
}

function inferDecision(
  findings: readonly H09SelfHealPlannerFinding[],
  record: H09SelfHealPlanRequestRecord | null,
  configBudgetInvalid: boolean
): H09SelfHealDecision {
  if (configBudgetInvalid || !record) return "blocked";
  if (
    findings.some((finding) =>
      [
        "hard_stop_requires_human_decision",
        "self_heal_budget_exhausted",
        "repeated_same_class_systemic_blocker",
        "authority_repair_without_human_decision",
        "schema_repair_without_human_decision",
        "security_repair_without_human_decision",
        "license_repair_without_human_decision",
        "scope_expansion_without_human_decision",
        "free_autonomous_fixing_overclaim",
        "stable_agents_overclaim",
        "independent_audit_overclaim"
      ].includes(finding.kind)
    )
  ) {
    return "hard_stop";
  }
  if (findings.some((finding) => finding.kind.includes("human_decision"))) return "human_decision_required";
  if (findings.length > 0) return "blocked";
  return "plan_ready";
}

function hasValidHumanDecision(humanDecision: H09HumanDecisionRecord | undefined): boolean {
  return Boolean(humanDecision?.provided && humanDecision.decision_ref && humanDecision.decision_sha256 && !validateSha256(humanDecision.decision_sha256, "invalid"));
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H09SelfHealPlannerFinding[]
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

function validateSha256(value: string, kind: string): H09SelfHealPlannerFinding | null {
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
