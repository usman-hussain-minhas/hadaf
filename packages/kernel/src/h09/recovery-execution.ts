import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H09RecoveryExecutionStatus = "passed" | "failed";
export type H09ExpectedRecoveryExecutionStatus = "passed" | "failed";
export type H09RecoveryExecutionDecision = "execution_record_valid" | "human_decision_required" | "hard_stop" | "blocked";

export interface H09RecoveryExecutionConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H09RecoveryExecutionScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H09RecoveryExecutionScenarioExpectation {
  readonly scenarioId: string;
  readonly executionRef: string;
  readonly executionSha256: string;
  readonly expectedStatus: H09ExpectedRecoveryExecutionStatus;
  readonly expectedDecision?: H09RecoveryExecutionDecision;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H09RecoveryExecutionReport {
  readonly status: H09RecoveryExecutionStatus;
  readonly findings: readonly H09RecoveryExecutionFinding[];
  readonly scenario_results: readonly H09RecoveryExecutionScenarioResult[];
  readonly verified_refs: readonly H09VerifiedRecoveryExecutionRef[];
  readonly execution_summary: H09RecoveryExecutionSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H09RecoveryExecutionScenarioResult {
  readonly scenarioId: string;
  readonly executionRef: string;
  readonly status: H09RecoveryExecutionStatus;
  readonly expectedStatus: H09ExpectedRecoveryExecutionStatus;
  readonly findingKinds: readonly string[];
  readonly decision: H09RecoveryExecutionDecision;
  readonly recoveryAction: string | null;
  readonly quarantineRequired: boolean;
  readonly rollbackRequired: boolean;
  readonly remoteBranchDeletionPlanned: boolean;
}

export interface H09VerifiedRecoveryExecutionRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h09_recovery_execution";
}

export interface H09RecoveryExecutionFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H09RecoveryExecutionSummary {
  readonly verified_ref_count: number;
  readonly execution_record_valid_count: number;
  readonly hard_stop_count: number;
  readonly human_decision_required_count: number;
  readonly blocked_count: number;
  readonly blocking_finding_count: number;
}

interface H09RecoveryExecutionRecord {
  readonly schema_version?: string;
  readonly execution_id?: string;
  readonly mode?: "fixture" | "execution_record" | "live";
  readonly planner_decision?: "plan_ready" | "human_decision_required" | "hard_stop" | "blocked";
  readonly recovery_action?: string;
  readonly failure_class?: string;
  readonly unsafe_state?: boolean;
  readonly evidence?: H09RecoveryEvidenceRecord;
  readonly quarantine?: H09QuarantineRecord;
  readonly rollback?: H09RollbackRecord;
  readonly cleanup?: H09CleanupRecord;
  readonly claims?: H09RecoveryExecutionClaimsRecord;
  readonly cannot_claim?: readonly string[];
}

interface H09RecoveryEvidenceRecord {
  readonly durable_output_ref?: string;
  readonly durable_output_sha256?: string;
  readonly evidence_manifest_ref?: string;
  readonly evidence_manifest_sha256?: string;
  readonly transient_only?: boolean;
}

interface H09QuarantineRecord {
  readonly required?: boolean;
  readonly performed?: boolean;
  readonly quarantine_ref?: string;
  readonly quarantine_sha256?: string;
  readonly reason?: string;
}

interface H09RollbackRecord {
  readonly required?: boolean;
  readonly route?: "semantic_rollback" | "scoped_revert" | "forward_fix" | "none";
  readonly exact_target_sha?: string;
  readonly evidence_preserving?: boolean;
  readonly production_rollback?: boolean;
}

interface H09CleanupRecord {
  readonly broad_cleanup?: boolean;
  readonly local_branch_delete?: boolean;
  readonly remote_branch_delete?: boolean;
  readonly closeout_complete?: boolean;
  readonly worktree_cleanup?: boolean;
  readonly exact_scope?: readonly string[];
}

interface H09RecoveryExecutionClaimsRecord {
  readonly production_rollback_executed?: boolean;
  readonly unscoped_cleanup_authorized?: boolean;
  readonly remote_branch_cleanup_without_closeout?: boolean;
  readonly transient_evidence_supports_terminal_claim?: boolean;
  readonly hard_stop_executed_without_human_decision?: boolean;
  readonly stable_agents?: boolean;
  readonly independent_audit?: boolean;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
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
const REQUIRED_CANNOT_CLAIM = [
  "production_rollback_executed",
  "unscoped_cleanup_authorized",
  "remote_branch_cleanup_without_closeout",
  "stable_agents",
  "mechanically_independent_agents"
];

export function verifyH09RecoveryExecutionConfig(config: H09RecoveryExecutionConfig): H09RecoveryExecutionReport {
  const findings: H09RecoveryExecutionFinding[] = [];
  const verifiedRefs: H09VerifiedRecoveryExecutionRef[] = [];
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
    execution_summary: {
      verified_ref_count: verifiedRefs.length,
      execution_record_valid_count: scenarioResults.filter((result) => result.decision === "execution_record_valid").length,
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
  config: H09RecoveryExecutionConfig,
  expectation: H09RecoveryExecutionScenarioExpectation,
  findings: H09RecoveryExecutionFinding[],
  verifiedRefs: H09VerifiedRecoveryExecutionRef[]
): H09RecoveryExecutionScenarioResult {
  const localFindings: H09RecoveryExecutionFinding[] = [];
  const hashFinding = validateSha256(expectation.executionSha256, "execution_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.executionRef });

  const executionPath = resolveLogicalRef(expectation.executionRef, config.logicalRoots, localFindings);
  let record: H09RecoveryExecutionRecord | null = null;
  if (executionPath && existsSync(executionPath) && localFindings.length === 0) {
    const text = readFileSync(executionPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.executionSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "execution_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.executionRef,
        path: executionPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.executionRef, path: executionPath, sha256: actualHash, source: "h09_recovery_execution" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.executionRef });
    }
    try {
      record = JSON.parse(text) as H09RecoveryExecutionRecord;
    } catch (error) {
      localFindings.push({
        kind: "execution_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.executionRef });
    }
  } else if (executionPath && !existsSync(executionPath)) {
    localFindings.push({ kind: "execution_missing", scenarioId: expectation.scenarioId, ref: expectation.executionRef, path: executionPath });
  }

  if (record) localFindings.push(...verifyRecord(record));

  const decision = inferDecision(localFindings, record);
  const actualStatus: H09RecoveryExecutionStatus = localFindings.length === 0 ? "passed" : "failed";
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
    executionRef: expectation.executionRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: findingKindsBeforeExpectationChecks,
    decision,
    recoveryAction: record?.recovery_action ?? null,
    quarantineRequired: Boolean(record?.quarantine?.required || record?.unsafe_state),
    rollbackRequired: Boolean(record?.rollback?.required),
    remoteBranchDeletionPlanned: Boolean(record?.cleanup?.remote_branch_delete)
  };
}

function verifyRecord(record: H09RecoveryExecutionRecord): H09RecoveryExecutionFinding[] {
  const findings: H09RecoveryExecutionFinding[] = [];
  if (record.schema_version !== "hadaf_h09_recovery_execution_v1") {
    findings.push({ kind: "schema_version_invalid", expected: "hadaf_h09_recovery_execution_v1", actual: String(record.schema_version) });
  }
  if (!record.execution_id) findings.push({ kind: "execution_id_missing" });
  if (record.mode === "live") findings.push({ kind: "live_recovery_execution_overclaim" });
  if (!record.recovery_action) findings.push({ kind: "recovery_action_missing" });
  if (record.planner_decision === "hard_stop") findings.push({ kind: "hard_stop_executed_without_human_decision" });
  if (record.failure_class && HARD_STOP_CLASSES.includes(record.failure_class) && record.planner_decision !== "human_decision_required") {
    findings.push({ kind: "hard_stop_class_execution_not_human_gated", detail: record.failure_class });
  }

  findings.push(...verifyEvidence(record.evidence));
  findings.push(...verifyQuarantine(record));
  findings.push(...verifyRollback(record.rollback));
  findings.push(...verifyCleanup(record.cleanup));
  findings.push(...verifyClaims(record.claims));

  for (const cannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (!record.cannot_claim?.includes(cannotClaim)) {
      findings.push({ kind: "required_cannot_claim_missing", expected: cannotClaim });
    }
  }
  return findings;
}

function verifyEvidence(evidence: H09RecoveryEvidenceRecord | undefined): H09RecoveryExecutionFinding[] {
  if (!evidence) return [{ kind: "evidence_missing" }];
  const findings: H09RecoveryExecutionFinding[] = [];
  if (!evidence.durable_output_ref) findings.push({ kind: "durable_output_ref_missing" });
  const outputHashFinding = validateSha256(evidence.durable_output_sha256 ?? "", "durable_output_hash_invalid");
  if (outputHashFinding) findings.push(outputHashFinding);
  if (!evidence.evidence_manifest_ref) findings.push({ kind: "evidence_manifest_ref_missing" });
  const manifestHashFinding = validateSha256(evidence.evidence_manifest_sha256 ?? "", "evidence_manifest_hash_invalid");
  if (manifestHashFinding) findings.push(manifestHashFinding);
  if (evidence.transient_only) findings.push({ kind: "transient_only_terminal_evidence" });
  return findings;
}

function verifyQuarantine(record: H09RecoveryExecutionRecord): H09RecoveryExecutionFinding[] {
  const quarantine = record.quarantine;
  const quarantineRequired = Boolean(record.unsafe_state || quarantine?.required);
  if (!quarantineRequired) return [];
  if (!quarantine) return [{ kind: "quarantine_missing_for_unsafe_state" }];
  const findings: H09RecoveryExecutionFinding[] = [];
  if (!quarantine.performed) findings.push({ kind: "quarantine_not_performed_for_unsafe_state" });
  if (!quarantine.quarantine_ref) findings.push({ kind: "quarantine_ref_missing" });
  const hashFinding = validateSha256(quarantine.quarantine_sha256 ?? "", "quarantine_hash_invalid");
  if (hashFinding) findings.push(hashFinding);
  return findings;
}

function verifyRollback(rollback: H09RollbackRecord | undefined): H09RecoveryExecutionFinding[] {
  if (!rollback?.required) return [];
  const findings: H09RecoveryExecutionFinding[] = [];
  if (rollback.production_rollback) findings.push({ kind: "production_rollback_overclaim" });
  if (!rollback.route || rollback.route === "none") findings.push({ kind: "rollback_route_missing" });
  if (!rollback.exact_target_sha || !GIT_SHA_PATTERN.test(rollback.exact_target_sha) || PLACEHOLDER_PATTERN.test(rollback.exact_target_sha)) {
    findings.push({ kind: "rollback_exact_target_missing_or_invalid" });
  }
  if (!rollback.evidence_preserving) findings.push({ kind: "rollback_not_evidence_preserving" });
  return findings;
}

function verifyCleanup(cleanup: H09CleanupRecord | undefined): H09RecoveryExecutionFinding[] {
  if (!cleanup) return [{ kind: "cleanup_record_missing" }];
  const findings: H09RecoveryExecutionFinding[] = [];
  if (cleanup.broad_cleanup) findings.push({ kind: "broad_cleanup_planned" });
  if (cleanup.remote_branch_delete && !cleanup.closeout_complete) findings.push({ kind: "remote_branch_delete_without_closeout" });
  if (cleanup.worktree_cleanup && (!cleanup.exact_scope || cleanup.exact_scope.length === 0)) {
    findings.push({ kind: "worktree_cleanup_scope_missing" });
  }
  return findings;
}

function verifyClaims(claims: H09RecoveryExecutionClaimsRecord | undefined): H09RecoveryExecutionFinding[] {
  const claimChecks: readonly [boolean | undefined, string][] = [
    [claims?.production_rollback_executed, "production_rollback_executed_overclaim"],
    [claims?.unscoped_cleanup_authorized, "unscoped_cleanup_authorized_overclaim"],
    [claims?.remote_branch_cleanup_without_closeout, "remote_branch_cleanup_without_closeout_overclaim"],
    [claims?.transient_evidence_supports_terminal_claim, "transient_evidence_terminal_claim_overclaim"],
    [claims?.hard_stop_executed_without_human_decision, "hard_stop_execution_overclaim"],
    [claims?.stable_agents, "stable_agents_overclaim"],
    [claims?.independent_audit, "independent_audit_overclaim"]
  ];
  return claimChecks.flatMap(([claimed, kind]) => (claimed ? [{ kind }] : []));
}

function inferDecision(findings: readonly H09RecoveryExecutionFinding[], record: H09RecoveryExecutionRecord | null): H09RecoveryExecutionDecision {
  if (!record) return "blocked";
  if (
    findings.some((finding) =>
      [
        "hard_stop_executed_without_human_decision",
        "hard_stop_class_execution_not_human_gated",
        "transient_only_terminal_evidence",
        "production_rollback_overclaim",
        "rollback_exact_target_missing_or_invalid",
        "quarantine_missing_for_unsafe_state",
        "quarantine_not_performed_for_unsafe_state",
        "broad_cleanup_planned",
        "remote_branch_delete_without_closeout",
        "hard_stop_execution_overclaim",
        "stable_agents_overclaim",
        "independent_audit_overclaim"
      ].includes(finding.kind)
    )
  ) {
    return "hard_stop";
  }
  if (findings.some((finding) => finding.kind.includes("human"))) return "human_decision_required";
  if (findings.length > 0) return "blocked";
  return "execution_record_valid";
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H09RecoveryExecutionFinding[]
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

function validateSha256(value: string, kind: string): H09RecoveryExecutionFinding | null {
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
