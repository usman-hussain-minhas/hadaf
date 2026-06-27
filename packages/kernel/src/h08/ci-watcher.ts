import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H08CiWatcherStatus = "passed" | "failed";
export type H08ExpectedCiWatcherStatus = "passed" | "failed";
export type H08CheckStatus = "queued" | "in_progress" | "pending" | "completed";
export type H08CheckConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "neutral"
  | "timed_out"
  | null;

export interface H08CiWatcherConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H08CiWatcherScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H08CiWatcherScenarioExpectation {
  readonly scenarioId: string;
  readonly statusRef: string;
  readonly statusSha256: string;
  readonly expectedStatus: H08ExpectedCiWatcherStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expectedClassificationKinds?: readonly string[];
  readonly expected?: H08CiWatcherExpectedStatus;
}

export interface H08CiWatcherExpectedStatus {
  readonly repository?: string;
  readonly headSha?: string;
  readonly requiredCheckNames?: readonly string[];
  readonly optionalCheckNames?: readonly string[];
  readonly githubAvailability?: H08GitHubAvailability;
}

export interface H08CiWatcherReport {
  readonly status: H08CiWatcherStatus;
  readonly findings: readonly H08CiWatcherFinding[];
  readonly classifications: readonly H08CiWatcherClassification[];
  readonly scenario_results: readonly H08CiWatcherScenarioResult[];
  readonly verified_refs: readonly H08VerifiedCiWatcherRef[];
  readonly ci_summary: H08CiWatcherSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H08CiWatcherScenarioResult {
  readonly scenarioId: string;
  readonly statusRef: string;
  readonly status: H08CiWatcherStatus;
  readonly expectedStatus: H08ExpectedCiWatcherStatus;
  readonly findingKinds: readonly string[];
  readonly classificationKinds: readonly string[];
  readonly headSha: string | null;
  readonly requiredCheckCount: number;
  readonly greenRequiredCheckCount: number;
}

export interface H08VerifiedCiWatcherRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "ci_status_record";
}

export interface H08CiWatcherFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H08CiWatcherClassification {
  readonly kind: string;
  readonly scenarioId: string;
  readonly checkName?: string;
  readonly detail?: string;
}

export interface H08CiWatcherSummary {
  readonly verified_ref_count: number;
  readonly blocking_finding_count: number;
  readonly classification_count: number;
  readonly required_check_count: number;
  readonly green_required_check_count: number;
  readonly optional_check_failure_count: number;
  readonly stale_check_count: number;
  readonly github_unavailable_count: number;
}

interface H08CiStatusRecord {
  readonly schema_version?: string;
  readonly status_id?: string;
  readonly captured_at?: string;
  readonly capture_mode?: "fixture" | "live_read_only" | "gh_snapshot" | "ci_snapshot";
  readonly repository?: {
    readonly owner?: string;
    readonly name?: string;
    readonly default_branch?: string;
  };
  readonly github?: {
    readonly availability?: H08GitHubAvailability;
    readonly unavailable_reason?: string;
  };
  readonly subject?: {
    readonly pull_request_number?: number;
    readonly head_sha?: string;
    readonly base_branch?: string;
    readonly required_checks?: readonly string[];
    readonly optional_checks?: readonly string[];
  };
  readonly checks?: readonly H08CiCheckRecord[];
  readonly watcher?: {
    readonly exact_head_required?: boolean;
    readonly required_checks_must_pass?: boolean;
    readonly pending_blocks?: boolean;
    readonly github_unavailable_blocks?: boolean;
  };
  readonly cannot_claim?: readonly string[];
}

interface H08CiCheckRecord {
  readonly name?: string;
  readonly source?: "github_actions" | "codeql" | "dependency_review" | "branch_protection" | "fixture";
  readonly required?: boolean;
  readonly status?: H08CheckStatus;
  readonly conclusion?: H08CheckConclusion;
  readonly head_sha?: string;
  readonly url?: string;
}

type H08GitHubAvailability = "available" | "unavailable" | "not_requested";

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;
const VALID_CHECK_STATUSES = new Set(["queued", "in_progress", "pending", "completed"]);
const VALID_CHECK_CONCLUSIONS = new Set(["success", "failure", "cancelled", "skipped", "neutral", "timed_out"]);

export function verifyH08CiWatcherConfig(config: H08CiWatcherConfig): H08CiWatcherReport {
  const findings: H08CiWatcherFinding[] = [];
  const classifications: H08CiWatcherClassification[] = [];
  const verifiedRefs: H08VerifiedCiWatcherRef[] = [];
  const scenarioResults = config.scenarios.map((scenario) =>
    verifyScenario(config, scenario, findings, classifications, verifiedRefs)
  );
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "scenario_status_unexpected" ||
        finding.kind === "expected_scenario_finding_missing" ||
        finding.kind === "expected_scenario_classification_missing"
    );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    classifications,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    ci_summary: {
      verified_ref_count: verifiedRefs.length,
      blocking_finding_count: findings.length,
      classification_count: classifications.length,
      required_check_count: scenarioResults.reduce((sum, result) => sum + result.requiredCheckCount, 0),
      green_required_check_count: scenarioResults.reduce((sum, result) => sum + result.greenRequiredCheckCount, 0),
      optional_check_failure_count: classifications.filter((item) => item.kind === "optional_check_failed").length,
      stale_check_count:
        findings.filter((finding) => finding.kind.includes("stale")).length +
        classifications.filter((item) => item.kind.includes("stale")).length,
      github_unavailable_count: findings.filter((finding) => finding.kind === "github_truth_unavailable").length
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H08CiWatcherConfig,
  expectation: H08CiWatcherScenarioExpectation,
  findings: H08CiWatcherFinding[],
  classifications: H08CiWatcherClassification[],
  verifiedRefs: H08VerifiedCiWatcherRef[]
): H08CiWatcherScenarioResult {
  const localFindings: H08CiWatcherFinding[] = [];
  const localClassifications: H08CiWatcherClassification[] = [];
  const hashFinding = validateSha256(expectation.statusSha256, "status_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.statusRef });

  const statusPath = resolveLogicalRef(expectation.statusRef, config.logicalRoots, localFindings);
  let record: H08CiStatusRecord | null = null;
  if (statusPath && existsSync(statusPath) && localFindings.length === 0) {
    const text = readFileSync(statusPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.statusSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "status_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.statusRef,
        path: statusPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.statusRef, path: statusPath, sha256: actualHash, source: "ci_status_record" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.statusRef });
    }
    try {
      record = JSON.parse(text) as H08CiStatusRecord;
    } catch (error) {
      localFindings.push({
        kind: "status_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.statusRef });
    }
  } else if (statusPath && !existsSync(statusPath)) {
    localFindings.push({ kind: "status_record_missing", scenarioId: expectation.scenarioId, ref: expectation.statusRef, path: statusPath });
  }

  if (record) {
    const result = verifyRecord(expectation, record);
    localFindings.push(...result.findings);
    localClassifications.push(...result.classifications);
  }

  const actualStatus: H08CiWatcherStatus = localFindings.length === 0 ? "passed" : "failed";
  const findingKindsBeforeExpectationChecks = localFindings.map((finding) => finding.kind);
  const classificationKinds = localClassifications.map((classification) => classification.kind);
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
  for (const expectedKind of expectation.expectedClassificationKinds ?? []) {
    if (!classificationKinds.includes(expectedKind)) {
      localFindings.push({
        kind: "expected_scenario_classification_missing",
        scenarioId: expectation.scenarioId,
        expected: expectedKind
      });
    }
  }

  findings.push(...localFindings);
  classifications.push(...localClassifications);
  const requiredCheckNames = requiredChecksFor(expectation, record);
  const greenRequiredCheckCount = countGreenRequiredChecks(record, requiredCheckNames, record?.subject?.head_sha ?? null);
  return {
    scenarioId: expectation.scenarioId,
    statusRef: expectation.statusRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    classificationKinds,
    headSha: record?.subject?.head_sha ?? null,
    requiredCheckCount: requiredCheckNames.length,
    greenRequiredCheckCount
  };
}

function verifyRecord(
  expectation: H08CiWatcherScenarioExpectation,
  record: H08CiStatusRecord
): { findings: H08CiWatcherFinding[]; classifications: H08CiWatcherClassification[] } {
  const findings: H08CiWatcherFinding[] = [];
  const classifications: H08CiWatcherClassification[] = [];
  if (record.schema_version !== "1.0.0") findings.push({ kind: "schema_version_invalid", scenarioId: expectation.scenarioId });
  if (record.status_id !== expectation.scenarioId) {
    findings.push({
      kind: "status_id_mismatch",
      scenarioId: expectation.scenarioId,
      expected: expectation.scenarioId,
      actual: String(record.status_id)
    });
  }
  if (!record.captured_at) findings.push({ kind: "captured_at_missing", scenarioId: expectation.scenarioId });
  if (!record.capture_mode || !["fixture", "live_read_only", "gh_snapshot", "ci_snapshot"].includes(record.capture_mode)) {
    findings.push({ kind: "capture_mode_invalid", scenarioId: expectation.scenarioId, actual: String(record.capture_mode) });
  }

  const repository = repositoryName(record);
  const expected = expectation.expected ?? {};
  compareExpected("repository", expected.repository, repository, findings, expectation.scenarioId);
  compareExpected("head_sha", expected.headSha, record.subject?.head_sha ?? null, findings, expectation.scenarioId);
  compareExpected(
    "github_availability",
    expected.githubAvailability,
    record.github?.availability ?? null,
    findings,
    expectation.scenarioId
  );
  validateGitSha(record.subject?.head_sha, "head_sha_missing_or_invalid", findings, expectation.scenarioId);
  if (record.github?.availability === "unavailable") {
    const unavailableFinding: H08CiWatcherFinding = {
      kind: "github_truth_unavailable",
      scenarioId: expectation.scenarioId
    };
    if (record.github.unavailable_reason) {
      findings.push({ ...unavailableFinding, detail: record.github.unavailable_reason });
    } else {
      findings.push(unavailableFinding);
    }
  }
  if (record.github?.availability !== "available" && record.github?.availability !== "unavailable") {
    findings.push({ kind: "github_availability_invalid", scenarioId: expectation.scenarioId, actual: String(record.github?.availability) });
  }
  if (record.watcher?.exact_head_required !== true) findings.push({ kind: "exact_head_required_missing", scenarioId: expectation.scenarioId });
  if (record.watcher?.required_checks_must_pass !== true) {
    findings.push({ kind: "required_checks_must_pass_missing", scenarioId: expectation.scenarioId });
  }
  if (record.watcher?.pending_blocks !== true) findings.push({ kind: "pending_blocks_missing", scenarioId: expectation.scenarioId });
  if (record.watcher?.github_unavailable_blocks !== true) {
    findings.push({ kind: "github_unavailable_blocks_missing", scenarioId: expectation.scenarioId });
  }

  const checks = record.checks ?? [];
  if (checks.length === 0) findings.push({ kind: "checks_missing", scenarioId: expectation.scenarioId });
  for (const check of checks) verifyCheckShape(expectation.scenarioId, check, findings);

  const requiredCheckNames = requiredChecksFor(expectation, record);
  if (requiredCheckNames.length === 0) findings.push({ kind: "required_check_set_missing", scenarioId: expectation.scenarioId });
  const headSha = record.subject?.head_sha;
  for (const requiredName of requiredCheckNames) {
    const matchingChecks = checks.filter((check) => check.name === requiredName);
    if (matchingChecks.length === 0) {
      findings.push({ kind: "required_check_missing", scenarioId: expectation.scenarioId, expected: requiredName });
      continue;
    }
    if (matchingChecks.length > 1) {
      findings.push({ kind: "required_check_duplicate", scenarioId: expectation.scenarioId, expected: requiredName });
    }
    for (const check of matchingChecks) verifyRequiredCheck(expectation.scenarioId, requiredName, headSha, check, findings);
  }

  const optionalNames = new Set([...(record.subject?.optional_checks ?? []), ...(expected.optionalCheckNames ?? [])]);
  for (const check of checks) {
    if (check.required === true || (check.name && requiredCheckNames.includes(check.name))) continue;
    if (check.name && optionalNames.size > 0 && !optionalNames.has(check.name)) continue;
    classifyOptionalCheck(expectation.scenarioId, headSha, check, classifications);
  }

  if (!record.cannot_claim?.includes("github_settings_mutation_authorized")) {
    findings.push({ kind: "settings_mutation_cannot_claim_missing", scenarioId: expectation.scenarioId });
  }
  if (!record.cannot_claim?.includes("branch_protection_mutation_authorized")) {
    findings.push({ kind: "branch_protection_cannot_claim_missing", scenarioId: expectation.scenarioId });
  }
  return { findings, classifications };
}

function verifyCheckShape(scenarioId: string, check: H08CiCheckRecord, findings: H08CiWatcherFinding[]): void {
  if (!check.name) findings.push({ kind: "check_name_missing", scenarioId });
  if (!check.status || !VALID_CHECK_STATUSES.has(check.status)) {
    findings.push(withOptionalDetail({ kind: "check_status_invalid", scenarioId, actual: String(check.status) }, check.name));
  }
  if (check.conclusion !== null && check.conclusion !== undefined && !VALID_CHECK_CONCLUSIONS.has(check.conclusion)) {
    findings.push(withOptionalDetail({ kind: "check_conclusion_invalid", scenarioId, actual: String(check.conclusion) }, check.name));
  }
  validateGitSha(check.head_sha, "check_head_sha_missing_or_invalid", findings, scenarioId);
}

function verifyRequiredCheck(
  scenarioId: string,
  requiredName: string,
  expectedHeadSha: string | undefined,
  check: H08CiCheckRecord,
  findings: H08CiWatcherFinding[]
): void {
  if (check.required !== true) {
    findings.push({ kind: "required_check_not_marked_required", scenarioId, expected: requiredName });
  }
  if (expectedHeadSha && check.head_sha !== expectedHeadSha) {
    findings.push({
      kind: "required_check_stale_head",
      scenarioId,
      expected: expectedHeadSha,
      actual: String(check.head_sha),
      detail: requiredName
    });
  }
  if (check.status !== "completed") {
    findings.push({ kind: "required_check_pending", scenarioId, expected: requiredName, actual: String(check.status) });
    return;
  }
  if (check.conclusion !== "success") {
    findings.push({ kind: "required_check_failed", scenarioId, expected: requiredName, actual: String(check.conclusion) });
  }
}

function classifyOptionalCheck(
  scenarioId: string,
  expectedHeadSha: string | undefined,
  check: H08CiCheckRecord,
  classifications: H08CiWatcherClassification[]
): void {
  if (expectedHeadSha && check.head_sha && check.head_sha !== expectedHeadSha) {
    classifications.push(withOptionalCheckName({ kind: "optional_check_stale_head", scenarioId }, check.name));
  }
  if (check.status !== "completed") {
    classifications.push(
      withOptionalCheckName({ kind: "optional_check_not_complete", scenarioId, detail: String(check.status) }, check.name)
    );
    return;
  }
  if (check.conclusion !== "success") {
    classifications.push(
      withOptionalCheckName({ kind: "optional_check_failed", scenarioId, detail: String(check.conclusion) }, check.name)
    );
  }
}

function withOptionalDetail(finding: H08CiWatcherFinding, detail: string | undefined): H08CiWatcherFinding {
  return detail ? { ...finding, detail } : finding;
}

function withOptionalCheckName(
  classification: H08CiWatcherClassification,
  checkName: string | undefined
): H08CiWatcherClassification {
  return checkName ? { ...classification, checkName } : classification;
}

function requiredChecksFor(expectation: H08CiWatcherScenarioExpectation, record: H08CiStatusRecord | null): string[] {
  const values = [...(record?.subject?.required_checks ?? []), ...(expectation.expected?.requiredCheckNames ?? [])];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function countGreenRequiredChecks(record: H08CiStatusRecord | null, requiredNames: readonly string[], headSha: string | null): number {
  if (!record) return 0;
  return requiredNames.filter((name) =>
    (record.checks ?? []).some(
      (check) =>
        check.name === name &&
        check.required === true &&
        check.head_sha === headSha &&
        check.status === "completed" &&
        check.conclusion === "success"
    )
  ).length;
}

function compareExpected(
  field: string,
  expected: string | null | undefined,
  actual: string | null | undefined,
  findings: H08CiWatcherFinding[],
  scenarioId: string
): void {
  if (expected === undefined) return;
  if (expected !== actual) {
    findings.push({ kind: `${field}_mismatch`, scenarioId, expected: String(expected), actual: String(actual) });
  }
}

function repositoryName(record: H08CiStatusRecord): string | null {
  const owner = record.repository?.owner;
  const name = record.repository?.name;
  return owner && name ? `${owner}/${name}` : null;
}

function validateGitSha(
  value: string | undefined,
  kind: string,
  findings: H08CiWatcherFinding[],
  scenarioId: string
): void {
  if (!value || !GIT_SHA_PATTERN.test(value)) findings.push({ kind, scenarioId, actual: String(value) });
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H08CiWatcherFinding[]
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

function validateSha256(value: string, invalidKind: string): H08CiWatcherFinding | null {
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
