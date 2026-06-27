import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H09AntiTheatreStatus = "passed" | "failed";
export type H09ExpectedAntiTheatreStatus = "passed" | "failed";
export type H09AntiTheatreDecision = "self_heal_credit_allowed" | "accepted_debt_required" | "hard_stop" | "blocked";

export interface H09AntiTheatreConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H09AntiTheatreScenarioExpectation[];
  readonly budgets: H09AntiTheatreBudgetLimits;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H09AntiTheatreBudgetLimits {
  readonly maxSelfHealsPerFfet: number;
  readonly maxSelfHealsPerBox: number;
  readonly maxSelfHealsForFullRun: number;
  readonly repeatedSameClassFailureAfterFfets: number;
}

export interface H09AntiTheatreScenarioExpectation {
  readonly scenarioId: string;
  readonly attemptRef: string;
  readonly attemptSha256: string;
  readonly expectedStatus: H09ExpectedAntiTheatreStatus;
  readonly expectedDecision?: H09AntiTheatreDecision;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H09AntiTheatreReport {
  readonly status: H09AntiTheatreStatus;
  readonly findings: readonly H09AntiTheatreFinding[];
  readonly scenario_results: readonly H09AntiTheatreScenarioResult[];
  readonly verified_refs: readonly H09VerifiedAntiTheatreRef[];
  readonly anti_theatre_summary: H09AntiTheatreSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H09AntiTheatreScenarioResult {
  readonly scenarioId: string;
  readonly attemptRef: string;
  readonly status: H09AntiTheatreStatus;
  readonly expectedStatus: H09ExpectedAntiTheatreStatus;
  readonly findingKinds: readonly string[];
  readonly decision: H09AntiTheatreDecision;
  readonly changedEvidence: boolean;
  readonly validationRerun: boolean;
  readonly nonDegradationPassed: boolean;
  readonly budgetExhausted: boolean;
}

export interface H09VerifiedAntiTheatreRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h09_anti_theatre_attempt";
}

export interface H09AntiTheatreFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H09AntiTheatreSummary {
  readonly verified_ref_count: number;
  readonly self_heal_credit_allowed_count: number;
  readonly hard_stop_count: number;
  readonly accepted_debt_required_count: number;
  readonly blocked_count: number;
  readonly blocking_finding_count: number;
}

interface H09AntiTheatreAttemptRecord {
  readonly schema_version?: string;
  readonly attempt_id?: string;
  readonly mode?: "fixture" | "attempt_record" | "live";
  readonly failure_class?: string;
  readonly attempt_state?: {
    readonly self_heals_used_for_ffet?: number;
    readonly self_heals_used_for_box?: number;
    readonly self_heals_used_for_run?: number;
    readonly same_class_failures_across_ffets?: number;
  };
  readonly evidence_change?: {
    readonly before_sha256?: string;
    readonly after_sha256?: string;
    readonly changed_files?: readonly string[];
    readonly changed_evidence?: boolean;
  };
  readonly validation?: {
    readonly rerun_after_attempt?: boolean;
    readonly validation_output_sha256?: string;
    readonly non_degradation_passed?: boolean;
    readonly non_degradation_output_sha256?: string;
  };
  readonly debt?: {
    readonly accepted_non_blocking_debt?: boolean;
    readonly owner?: string;
    readonly remediation_ffet?: string;
    readonly cannot_claim?: readonly string[];
  };
  readonly claims?: H09AntiTheatreClaimsRecord;
  readonly cannot_claim?: readonly string[];
}

interface H09AntiTheatreClaimsRecord {
  readonly self_heal_success_without_changed_evidence?: boolean;
  readonly continue_after_self_heal_budget_exhausted?: boolean;
  readonly validation_optional_after_recovery?: boolean;
  readonly repeated_same_class_not_systemic?: boolean;
  readonly stable_agents?: boolean;
  readonly independent_audit?: boolean;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;
const REQUIRED_CANNOT_CLAIM = [
  "self_heal_success_without_changed_evidence",
  "continue_after_self_heal_budget_exhausted",
  "stable_agents",
  "mechanically_independent_agents"
];

export function verifyH09AntiTheatreConfig(config: H09AntiTheatreConfig): H09AntiTheatreReport {
  const findings: H09AntiTheatreFinding[] = [];
  const verifiedRefs: H09VerifiedAntiTheatreRef[] = [];
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
        finding.kind === "expected_scenario_finding_missing"
    );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    anti_theatre_summary: {
      verified_ref_count: verifiedRefs.length,
      self_heal_credit_allowed_count: scenarioResults.filter((result) => result.decision === "self_heal_credit_allowed").length,
      hard_stop_count: scenarioResults.filter((result) => result.decision === "hard_stop").length,
      accepted_debt_required_count: scenarioResults.filter((result) => result.decision === "accepted_debt_required").length,
      blocked_count: scenarioResults.filter((result) => result.decision === "blocked").length,
      blocking_finding_count: findings.length
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H09AntiTheatreConfig,
  expectation: H09AntiTheatreScenarioExpectation,
  findings: H09AntiTheatreFinding[],
  verifiedRefs: H09VerifiedAntiTheatreRef[],
  configBudgetInvalid: boolean
): H09AntiTheatreScenarioResult {
  const localFindings: H09AntiTheatreFinding[] = [];
  const hashFinding = validateSha256(expectation.attemptSha256, "attempt_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.attemptRef });

  const attemptPath = resolveLogicalRef(expectation.attemptRef, config.logicalRoots, localFindings);
  let record: H09AntiTheatreAttemptRecord | null = null;
  if (attemptPath && existsSync(attemptPath) && localFindings.length === 0) {
    const text = readFileSync(attemptPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.attemptSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "attempt_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.attemptRef,
        path: attemptPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.attemptRef, path: attemptPath, sha256: actualHash, source: "h09_anti_theatre_attempt" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.attemptRef });
    }
    try {
      record = JSON.parse(text) as H09AntiTheatreAttemptRecord;
    } catch (error) {
      localFindings.push({
        kind: "attempt_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.attemptRef });
    }
  } else if (attemptPath && !existsSync(attemptPath)) {
    localFindings.push({ kind: "attempt_missing", scenarioId: expectation.scenarioId, ref: expectation.attemptRef, path: attemptPath });
  }

  if (record) localFindings.push(...verifyRecord(config.budgets, record));

  const decision = inferDecision(localFindings, record, configBudgetInvalid);
  const actualStatus: H09AntiTheatreStatus = localFindings.length === 0 && !configBudgetInvalid ? "passed" : "failed";
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
    attemptRef: expectation.attemptRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: findingKindsBeforeExpectationChecks,
    decision,
    changedEvidence: Boolean(record?.evidence_change?.changed_evidence),
    validationRerun: Boolean(record?.validation?.rerun_after_attempt),
    nonDegradationPassed: Boolean(record?.validation?.non_degradation_passed),
    budgetExhausted: isBudgetExhausted(config.budgets, record)
  };
}

function validateBudgetLimits(budgets: H09AntiTheatreBudgetLimits | undefined): H09AntiTheatreFinding[] {
  if (!budgets) return [{ kind: "budget_limits_missing" }];
  const checks: readonly [number, number, string][] = [
    [budgets.maxSelfHealsPerFfet, 3, "maxSelfHealsPerFfet"],
    [budgets.maxSelfHealsPerBox, 10, "maxSelfHealsPerBox"],
    [budgets.maxSelfHealsForFullRun, 30, "maxSelfHealsForFullRun"],
    [budgets.repeatedSameClassFailureAfterFfets, 2, "repeatedSameClassFailureAfterFfets"]
  ];
  return checks.flatMap(([actual, max, field]) => {
    if (!Number.isInteger(actual) || actual < 0) return [{ kind: "budget_limit_invalid", detail: field }];
    if (actual > max) return [{ kind: "budget_limit_exceeds_run_control", detail: field }];
    return [];
  });
}

function verifyRecord(budgets: H09AntiTheatreBudgetLimits, record: H09AntiTheatreAttemptRecord): H09AntiTheatreFinding[] {
  const findings: H09AntiTheatreFinding[] = [];
  if (record.schema_version !== "hadaf_h09_anti_theatre_attempt_v1") {
    findings.push({ kind: "schema_version_invalid", expected: "hadaf_h09_anti_theatre_attempt_v1", actual: String(record.schema_version) });
  }
  if (!record.attempt_id) findings.push({ kind: "attempt_id_missing" });
  if (record.mode === "live") findings.push({ kind: "live_self_heal_overclaim" });
  if (!record.failure_class) findings.push({ kind: "failure_class_missing" });
  findings.push(...verifyAttemptState(budgets, record));
  findings.push(...verifyEvidenceChange(record));
  findings.push(...verifyValidation(record));
  findings.push(...verifyDebt(record));
  findings.push(...verifyClaims(record.claims));
  for (const cannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (!record.cannot_claim?.includes(cannotClaim)) findings.push({ kind: "required_cannot_claim_missing", expected: cannotClaim });
  }
  return findings;
}

function verifyAttemptState(budgets: H09AntiTheatreBudgetLimits, record: H09AntiTheatreAttemptRecord): H09AntiTheatreFinding[] {
  const state = record.attempt_state;
  if (!state) return [{ kind: "attempt_state_missing" }];
  const findings: H09AntiTheatreFinding[] = [];
  const checks: readonly [number | undefined, number, string][] = [
    [state.self_heals_used_for_ffet, budgets.maxSelfHealsPerFfet, "self_heals_used_for_ffet"],
    [state.self_heals_used_for_box, budgets.maxSelfHealsPerBox, "self_heals_used_for_box"],
    [state.self_heals_used_for_run, budgets.maxSelfHealsForFullRun, "self_heals_used_for_run"]
  ];
  for (const [actual, max, field] of checks) {
    if (!Number.isInteger(actual) || (actual ?? -1) < 0) findings.push({ kind: "attempt_state_invalid", detail: field });
    if ((actual ?? 0) >= max) findings.push({ kind: "self_heal_budget_exhausted", detail: field });
  }
  if ((state.same_class_failures_across_ffets ?? 0) >= budgets.repeatedSameClassFailureAfterFfets) {
    findings.push({ kind: "repeated_same_class_systemic_blocker", detail: String(record.failure_class) });
  }
  return findings;
}

function verifyEvidenceChange(record: H09AntiTheatreAttemptRecord): H09AntiTheatreFinding[] {
  const evidence = record.evidence_change;
  if (!evidence) return [{ kind: "evidence_change_missing" }];
  const findings: H09AntiTheatreFinding[] = [];
  const beforeFinding = validateSha256(evidence.before_sha256 ?? "", "before_evidence_hash_invalid");
  if (beforeFinding) findings.push(beforeFinding);
  const afterFinding = validateSha256(evidence.after_sha256 ?? "", "after_evidence_hash_invalid");
  if (afterFinding) findings.push(afterFinding);
  if (!evidence.changed_evidence || evidence.before_sha256 === evidence.after_sha256 || (evidence.changed_files ?? []).length === 0) {
    findings.push({ kind: "self_heal_no_changed_evidence" });
  }
  return findings;
}

function verifyValidation(record: H09AntiTheatreAttemptRecord): H09AntiTheatreFinding[] {
  const validation = record.validation;
  if (!validation) return [{ kind: "validation_record_missing" }];
  const findings: H09AntiTheatreFinding[] = [];
  if (!validation.rerun_after_attempt) findings.push({ kind: "validation_not_rerun_after_recovery" });
  const validationHashFinding = validateSha256(validation.validation_output_sha256 ?? "", "validation_output_hash_invalid");
  if (validationHashFinding) findings.push(validationHashFinding);
  if (!validation.non_degradation_passed) findings.push({ kind: "non_degradation_not_passed" });
  const nonDegradationHashFinding = validateSha256(validation.non_degradation_output_sha256 ?? "", "non_degradation_output_hash_invalid");
  if (nonDegradationHashFinding) findings.push(nonDegradationHashFinding);
  return findings;
}

function verifyDebt(record: H09AntiTheatreAttemptRecord): H09AntiTheatreFinding[] {
  if (!isAttemptBudgetExhausted(record)) return [];
  const debt = record.debt;
  if (!debt?.accepted_non_blocking_debt) return [{ kind: "budget_exhausted_without_accepted_debt" }];
  const findings: H09AntiTheatreFinding[] = [];
  if (!debt.owner) findings.push({ kind: "accepted_debt_owner_missing" });
  if (!debt.remediation_ffet) findings.push({ kind: "accepted_debt_remediation_missing" });
  if (!debt.cannot_claim || debt.cannot_claim.length === 0) findings.push({ kind: "accepted_debt_cannot_claim_missing" });
  return findings;
}

function verifyClaims(claims: H09AntiTheatreClaimsRecord | undefined): H09AntiTheatreFinding[] {
  const claimChecks: readonly [boolean | undefined, string][] = [
    [claims?.self_heal_success_without_changed_evidence, "self_heal_success_without_changed_evidence_overclaim"],
    [claims?.continue_after_self_heal_budget_exhausted, "continue_after_self_heal_budget_exhausted_overclaim"],
    [claims?.validation_optional_after_recovery, "validation_optional_after_recovery_overclaim"],
    [claims?.repeated_same_class_not_systemic, "repeated_same_class_not_systemic_overclaim"],
    [claims?.stable_agents, "stable_agents_overclaim"],
    [claims?.independent_audit, "independent_audit_overclaim"]
  ];
  return claimChecks.flatMap(([claimed, kind]) => (claimed ? [{ kind }] : []));
}

function inferDecision(findings: readonly H09AntiTheatreFinding[], record: H09AntiTheatreAttemptRecord | null, configBudgetInvalid: boolean): H09AntiTheatreDecision {
  if (configBudgetInvalid || !record) return "blocked";
  if (
    findings.some((finding) =>
      [
        "self_heal_no_changed_evidence",
        "self_heal_budget_exhausted",
        "repeated_same_class_systemic_blocker",
        "validation_not_rerun_after_recovery",
        "non_degradation_not_passed",
        "self_heal_success_without_changed_evidence_overclaim",
        "continue_after_self_heal_budget_exhausted_overclaim",
        "validation_optional_after_recovery_overclaim",
        "repeated_same_class_not_systemic_overclaim",
        "stable_agents_overclaim",
        "independent_audit_overclaim"
      ].includes(finding.kind)
    )
  ) {
    return "hard_stop";
  }
  if (findings.some((finding) => finding.kind.startsWith("accepted_debt") || finding.kind === "budget_exhausted_without_accepted_debt")) {
    return "accepted_debt_required";
  }
  if (findings.length > 0) return "blocked";
  return "self_heal_credit_allowed";
}

function isBudgetExhausted(budgets: H09AntiTheatreBudgetLimits, record: H09AntiTheatreAttemptRecord | null): boolean {
  if (!record) return false;
  const state = record.attempt_state;
  return Boolean(
    state &&
      ((state.self_heals_used_for_ffet ?? -1) >= budgets.maxSelfHealsPerFfet ||
        (state.self_heals_used_for_box ?? -1) >= budgets.maxSelfHealsPerBox ||
        (state.self_heals_used_for_run ?? -1) >= budgets.maxSelfHealsForFullRun)
  );
}

function isAttemptBudgetExhausted(record: H09AntiTheatreAttemptRecord): boolean {
  const state = record.attempt_state;
  return Boolean(state && ((state.self_heals_used_for_ffet ?? -1) >= 3 || (state.self_heals_used_for_box ?? -1) >= 10 || (state.self_heals_used_for_run ?? -1) >= 30));
}

function resolveLogicalRef(ref: string, logicalRoots: Record<string, string>, findings: H09AntiTheatreFinding[]): string | null {
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

function validateSha256(value: string, kind: string): H09AntiTheatreFinding | null {
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
