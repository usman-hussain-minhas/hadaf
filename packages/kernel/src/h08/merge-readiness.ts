import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H08MergeReadinessStatus = "passed" | "failed";
export type H08ExpectedMergeReadinessStatus = "passed" | "failed";
export type H08MergeReadinessDecision = "approved_for_merge" | "blocked" | "human_action_required";

export interface H08MergeReadinessConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H08MergeReadinessScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H08MergeReadinessScenarioExpectation {
  readonly scenarioId: string;
  readonly readinessRef: string;
  readonly readinessSha256: string;
  readonly expectedStatus: H08ExpectedMergeReadinessStatus;
  readonly expectedDecision?: H08MergeReadinessDecision;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H08MergeReadinessExpectedRecord;
}

export interface H08MergeReadinessExpectedRecord {
  readonly prNumber?: number;
  readonly headSha?: string;
  readonly mergeStateStatus?: string;
  readonly requiredCheckNames?: readonly string[];
}

export interface H08MergeReadinessReport {
  readonly status: H08MergeReadinessStatus;
  readonly findings: readonly H08MergeReadinessFinding[];
  readonly scenario_results: readonly H08MergeReadinessScenarioResult[];
  readonly verified_refs: readonly H08VerifiedMergeReadinessRef[];
  readonly readiness_summary: H08MergeReadinessSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H08MergeReadinessScenarioResult {
  readonly scenarioId: string;
  readonly readinessRef: string;
  readonly status: H08MergeReadinessStatus;
  readonly expectedStatus: H08ExpectedMergeReadinessStatus;
  readonly findingKinds: readonly string[];
  readonly decision: H08MergeReadinessDecision;
  readonly prNumber: number | null;
  readonly headSha: string | null;
}

export interface H08VerifiedMergeReadinessRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "merge_readiness_record";
}

export interface H08MergeReadinessFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H08MergeReadinessSummary {
  readonly verified_ref_count: number;
  readonly approved_for_merge_count: number;
  readonly blocked_count: number;
  readonly human_action_required_count: number;
  readonly blocking_finding_count: number;
}

interface H08MergeReadinessRecord {
  readonly schema_version?: string;
  readonly readiness_id?: string;
  readonly captured_at?: string;
  readonly capture_mode?: "fixture" | "live_read_only" | "gh_snapshot";
  readonly repository?: {
    readonly owner?: string;
    readonly name?: string;
  };
  readonly pr?: {
    readonly number?: number;
    readonly state?: "open" | "closed" | "merged";
    readonly head_sha?: string;
    readonly expected_head_sha?: string;
    readonly mergeable?: boolean;
    readonly merge_state_status?: "CLEAN" | "BLOCKED" | "DIRTY" | "UNKNOWN" | "BEHIND";
    readonly public_metadata_safe?: boolean;
    readonly pr_body_sha256?: string;
  };
  readonly ci?: {
    readonly required_checks?: readonly H08MergeReadinessCheck[];
  };
  readonly evidence?: {
    readonly manifest_ref?: string;
    readonly manifest_sha256?: string;
    readonly status?: "fresh" | "missing" | "stale";
  };
  readonly closeout_plan?: {
    readonly present?: boolean;
    readonly ref?: string;
    readonly sha256?: string;
  };
  readonly terminal_learning_plan?: {
    readonly present?: boolean;
    readonly ref?: string;
    readonly sha256?: string;
  };
  readonly branch_protection?: {
    readonly human_action_required?: boolean;
    readonly blocker_reason?: string;
  };
  readonly conductor?: {
    readonly dry_run?: boolean;
    readonly mutation_commands_used?: readonly string[];
    readonly decision?: H08MergeReadinessDecision;
  };
  readonly cannot_claim?: readonly string[];
}

interface H08MergeReadinessCheck {
  readonly name?: string;
  readonly required?: boolean;
  readonly status?: "queued" | "in_progress" | "pending" | "completed";
  readonly conclusion?: "success" | "failure" | "cancelled" | "skipped" | "neutral" | "timed_out" | null;
  readonly head_sha?: string;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;
const MUTATING_COMMAND_PATTERN =
  /\b(?:git\s+(?:push|reset|checkout|switch|commit|merge|rebase|branch\s+-d|branch\s+-D|worktree\s+remove)|gh\s+pr\s+(?:merge|close|edit|comment))\b/iu;

export function verifyH08MergeReadinessConfig(config: H08MergeReadinessConfig): H08MergeReadinessReport {
  const findings: H08MergeReadinessFinding[] = [];
  const verifiedRefs: H08VerifiedMergeReadinessRef[] = [];
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
    readiness_summary: {
      verified_ref_count: verifiedRefs.length,
      approved_for_merge_count: scenarioResults.filter((result) => result.decision === "approved_for_merge").length,
      blocked_count: scenarioResults.filter((result) => result.decision === "blocked").length,
      human_action_required_count: scenarioResults.filter((result) => result.decision === "human_action_required").length,
      blocking_finding_count: findings.length
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H08MergeReadinessConfig,
  expectation: H08MergeReadinessScenarioExpectation,
  findings: H08MergeReadinessFinding[],
  verifiedRefs: H08VerifiedMergeReadinessRef[]
): H08MergeReadinessScenarioResult {
  const localFindings: H08MergeReadinessFinding[] = [];
  const hashFinding = validateSha256(expectation.readinessSha256, "readiness_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.readinessRef });

  const readinessPath = resolveLogicalRef(expectation.readinessRef, config.logicalRoots, localFindings);
  let record: H08MergeReadinessRecord | null = null;
  if (readinessPath && existsSync(readinessPath) && localFindings.length === 0) {
    const text = readFileSync(readinessPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.readinessSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "readiness_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.readinessRef,
        path: readinessPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.readinessRef, path: readinessPath, sha256: actualHash, source: "merge_readiness_record" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.readinessRef });
    }
    try {
      record = JSON.parse(text) as H08MergeReadinessRecord;
    } catch (error) {
      localFindings.push({
        kind: "readiness_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.readinessRef });
    }
  } else if (readinessPath && !existsSync(readinessPath)) {
    localFindings.push({
      kind: "readiness_record_missing",
      scenarioId: expectation.scenarioId,
      ref: expectation.readinessRef,
      path: readinessPath
    });
  }

  if (record) localFindings.push(...verifyRecord(expectation, record));

  const decision = record?.conductor?.decision ?? inferDecision(localFindings, record);
  const actualStatus: H08MergeReadinessStatus = localFindings.length === 0 ? "passed" : "failed";
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
    readinessRef: expectation.readinessRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    decision,
    prNumber: record?.pr?.number ?? null,
    headSha: record?.pr?.head_sha ?? null
  };
}

function verifyRecord(
  expectation: H08MergeReadinessScenarioExpectation,
  record: H08MergeReadinessRecord
): H08MergeReadinessFinding[] {
  const findings: H08MergeReadinessFinding[] = [];
  if (record.schema_version !== "1.0.0") findings.push({ kind: "schema_version_invalid", scenarioId: expectation.scenarioId });
  if (record.readiness_id !== expectation.scenarioId) {
    findings.push({
      kind: "readiness_id_mismatch",
      scenarioId: expectation.scenarioId,
      expected: expectation.scenarioId,
      actual: String(record.readiness_id)
    });
  }
  if (!record.captured_at) findings.push({ kind: "captured_at_missing", scenarioId: expectation.scenarioId });
  if (!record.capture_mode || !["fixture", "live_read_only", "gh_snapshot"].includes(record.capture_mode)) {
    findings.push({ kind: "capture_mode_invalid", scenarioId: expectation.scenarioId, actual: String(record.capture_mode) });
  }

  const expected = expectation.expected ?? {};
  compareExpectedNumber("pr_number", expected.prNumber, record.pr?.number, findings, expectation.scenarioId);
  compareExpected("head_sha", expected.headSha, record.pr?.head_sha ?? null, findings, expectation.scenarioId);
  compareExpected(
    "merge_state_status",
    expected.mergeStateStatus,
    record.pr?.merge_state_status ?? null,
    findings,
    expectation.scenarioId
  );
  validateGitSha(record.pr?.head_sha, "head_sha_missing_or_invalid", findings, expectation.scenarioId);
  if (record.pr?.head_sha !== record.pr?.expected_head_sha) {
    findings.push({
      kind: "exact_head_drift",
      scenarioId: expectation.scenarioId,
      expected: String(record.pr?.expected_head_sha),
      actual: String(record.pr?.head_sha)
    });
  }
  if (record.pr?.state !== "open") findings.push({ kind: "pr_not_open", scenarioId: expectation.scenarioId, actual: String(record.pr?.state) });
  if (record.pr?.mergeable !== true || record.pr?.merge_state_status !== "CLEAN") {
    findings.push({ kind: "merge_state_not_clean", scenarioId: expectation.scenarioId, actual: String(record.pr?.merge_state_status) });
  }
  if (record.pr?.public_metadata_safe !== true) findings.push({ kind: "unsafe_pr_metadata", scenarioId: expectation.scenarioId });
  validateSha256Into(record.pr?.pr_body_sha256, "pr_body_hash_missing_or_invalid", findings, expectation.scenarioId);

  verifyRequiredChecks(expectation, record, findings);
  verifyEvidence(record, expectation.scenarioId, findings);
  verifyPlan("closeout_plan", record.closeout_plan, expectation.scenarioId, findings);
  verifyPlan("terminal_learning_plan", record.terminal_learning_plan, expectation.scenarioId, findings);

  if (record.branch_protection?.human_action_required === true) {
    findings.push(withOptionalDetail({ kind: "human_branch_protection_blocker", scenarioId: expectation.scenarioId }, record.branch_protection.blocker_reason));
  }
  if (record.conductor?.dry_run !== true) findings.push({ kind: "dry_run_required", scenarioId: expectation.scenarioId });
  if ((record.conductor?.mutation_commands_used?.length ?? 0) > 0) {
    findings.push({ kind: "mutation_command_declared", scenarioId: expectation.scenarioId });
  }
  for (const command of record.conductor?.mutation_commands_used ?? []) {
    if (MUTATING_COMMAND_PATTERN.test(command)) {
      findings.push({ kind: "mutating_command_detected", scenarioId: expectation.scenarioId, detail: command });
    }
  }
  if (!record.cannot_claim?.includes("github_settings_mutation_authorized")) {
    findings.push({ kind: "settings_mutation_cannot_claim_missing", scenarioId: expectation.scenarioId });
  }
  if (!record.cannot_claim?.includes("branch_protection_mutation_authorized")) {
    findings.push({ kind: "branch_protection_cannot_claim_missing", scenarioId: expectation.scenarioId });
  }
  return findings;
}

function verifyRequiredChecks(
  expectation: H08MergeReadinessScenarioExpectation,
  record: H08MergeReadinessRecord,
  findings: H08MergeReadinessFinding[]
): void {
  const requiredNames = [...new Set([...(expectation.expected?.requiredCheckNames ?? []), ...((record.ci?.required_checks ?? []).map((check) => check.name).filter((name): name is string => Boolean(name)))])];
  if (requiredNames.length === 0) findings.push({ kind: "required_check_set_missing", scenarioId: expectation.scenarioId });
  for (const requiredName of requiredNames) {
    const matchingChecks = (record.ci?.required_checks ?? []).filter((check) => check.name === requiredName);
    if (matchingChecks.length === 0) {
      findings.push({ kind: "required_check_missing", scenarioId: expectation.scenarioId, expected: requiredName });
      continue;
    }
    for (const check of matchingChecks) {
      if (check.required !== true) findings.push({ kind: "required_check_not_marked_required", scenarioId: expectation.scenarioId, expected: requiredName });
      if (check.head_sha !== record.pr?.head_sha) {
        findings.push({
          kind: "required_check_stale_head",
          scenarioId: expectation.scenarioId,
          expected: String(record.pr?.head_sha),
          actual: String(check.head_sha),
          detail: requiredName
        });
      }
      if (check.status !== "completed") {
        findings.push({ kind: "required_check_pending", scenarioId: expectation.scenarioId, expected: requiredName, actual: String(check.status) });
      } else if (check.conclusion !== "success") {
        findings.push({ kind: "required_check_failed", scenarioId: expectation.scenarioId, expected: requiredName, actual: String(check.conclusion) });
      }
    }
  }
}

function verifyEvidence(
  record: H08MergeReadinessRecord,
  scenarioId: string,
  findings: H08MergeReadinessFinding[]
): void {
  if (record.evidence?.status !== "fresh") {
    findings.push({ kind: "evidence_manifest_not_fresh", scenarioId, actual: String(record.evidence?.status) });
  }
  if (!record.evidence?.manifest_ref) findings.push({ kind: "evidence_manifest_ref_missing", scenarioId });
  validateSha256Into(record.evidence?.manifest_sha256, "evidence_manifest_hash_missing_or_invalid", findings, scenarioId);
}

function verifyPlan(
  planKind: "closeout_plan" | "terminal_learning_plan",
  plan: { readonly present?: boolean; readonly ref?: string; readonly sha256?: string } | undefined,
  scenarioId: string,
  findings: H08MergeReadinessFinding[]
): void {
  if (plan?.present !== true) findings.push({ kind: `${planKind}_missing`, scenarioId });
  if (!plan?.ref) findings.push({ kind: `${planKind}_ref_missing`, scenarioId });
  validateSha256Into(plan?.sha256, `${planKind}_hash_missing_or_invalid`, findings, scenarioId);
}

function inferDecision(
  findings: readonly H08MergeReadinessFinding[],
  record: H08MergeReadinessRecord | null
): H08MergeReadinessDecision {
  if (record?.branch_protection?.human_action_required === true) return "human_action_required";
  return findings.length === 0 ? "approved_for_merge" : "blocked";
}

function compareExpected(
  field: string,
  expected: string | null | undefined,
  actual: string | null | undefined,
  findings: H08MergeReadinessFinding[],
  scenarioId: string
): void {
  if (expected === undefined) return;
  if (expected !== actual) findings.push({ kind: `${field}_mismatch`, scenarioId, expected: String(expected), actual: String(actual) });
}

function compareExpectedNumber(
  field: string,
  expected: number | undefined,
  actual: number | undefined,
  findings: H08MergeReadinessFinding[],
  scenarioId: string
): void {
  if (expected === undefined) return;
  if (expected !== actual) findings.push({ kind: `${field}_mismatch`, scenarioId, expected: String(expected), actual: String(actual) });
}

function validateGitSha(
  value: string | undefined,
  kind: string,
  findings: H08MergeReadinessFinding[],
  scenarioId: string
): void {
  if (!value || !GIT_SHA_PATTERN.test(value)) findings.push({ kind, scenarioId, actual: String(value) });
}

function validateSha256Into(
  value: string | undefined,
  kind: string,
  findings: H08MergeReadinessFinding[],
  scenarioId: string
): void {
  if (!value || !SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) {
    findings.push({ kind, scenarioId, actual: String(value) });
  }
}

function withOptionalDetail(
  finding: H08MergeReadinessFinding,
  detail: string | undefined
): H08MergeReadinessFinding {
  return detail ? { ...finding, detail } : finding;
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H08MergeReadinessFinding[]
): string | null {
  const separatorIndex = ref.indexOf("://");
  if (separatorIndex === -1) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const rootName = ref.slice(0, separatorIndex);
  const relativePath = ref.slice(separatorIndex + 3);
  const root = logicalRoots[rootName];
  if (!root) {
    findings.push({ kind: "logical_root_unknown", ref });
    return null;
  }
  if (isAbsolute(relativePath) || relativePath.includes("\0")) {
    findings.push({ kind: "logical_path_escape", ref });
    return null;
  }
  const rootPath = resolve(root);
  const resolvedPath = resolve(rootPath, normalize(relativePath));
  const relativeToRoot = relative(rootPath, resolvedPath);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot)) {
    findings.push({ kind: "logical_path_escape", ref, path: resolvedPath });
    return null;
  }
  return resolvedPath;
}

function validateSha256(value: string, invalidKind: string): H08MergeReadinessFinding | null {
  if (!SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) return { kind: invalidKind, actual: value };
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function containsPrivateMetadata(value: unknown): boolean {
  if (typeof value === "string") return PRIVATE_METADATA_PATTERN.test(value);
  if (Array.isArray(value)) return value.some((item) => containsPrivateMetadata(item));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsPrivateMetadata(item));
  return false;
}
