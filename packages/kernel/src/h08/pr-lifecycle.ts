import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H08PrLifecycleStatus = "passed" | "failed";
export type H08ExpectedPrLifecycleStatus = "passed" | "failed";
export type H08PrTerminalState = "open" | "closed" | "merged";
export type H08PrLifecycleRole =
  | "product_mutation"
  | "control_evidence"
  | "shared_integration"
  | "docs_only"
  | "runtime";

export interface H08PrLifecycleConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H08PrLifecycleScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H08PrLifecycleScenarioExpectation {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly recordSha256: string;
  readonly expectedStatus: H08ExpectedPrLifecycleStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H08PrLifecycleExpectedRecord;
}

export interface H08PrLifecycleExpectedRecord {
  readonly prNumber?: number;
  readonly terminalState?: H08PrTerminalState;
  readonly headSha?: string;
  readonly mergeSha?: string;
  readonly role?: H08PrLifecycleRole;
  readonly terminalLearningRequired?: boolean;
}

export interface H08PrLifecycleReport {
  readonly status: H08PrLifecycleStatus;
  readonly findings: readonly H08PrLifecycleFinding[];
  readonly scenario_results: readonly H08PrLifecycleScenarioResult[];
  readonly verified_refs: readonly H08VerifiedPrLifecycleRef[];
  readonly lifecycle_summary: H08PrLifecycleSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H08PrLifecycleScenarioResult {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly status: H08PrLifecycleStatus;
  readonly expectedStatus: H08ExpectedPrLifecycleStatus;
  readonly findingKinds: readonly string[];
  readonly prNumber: number | null;
  readonly terminalState: H08PrTerminalState | null;
  readonly role: H08PrLifecycleRole | null;
  readonly changedFileCount: number;
}

export interface H08VerifiedPrLifecycleRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "pr_lifecycle_record";
}

export interface H08PrLifecycleFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H08PrLifecycleSummary {
  readonly verified_ref_count: number;
  readonly hash_failure_count: number;
  readonly terminal_record_count: number;
  readonly role_purity_failure_count: number;
  readonly metadata_failure_count: number;
  readonly terminal_learning_failure_count: number;
}

interface H08PrLifecycleRecord {
  readonly schema_version?: string;
  readonly lifecycle_id?: string;
  readonly captured_at?: string;
  readonly pr?: {
    readonly number?: number;
    readonly title?: string;
    readonly body?: string;
    readonly state?: H08PrTerminalState;
    readonly is_draft?: boolean;
    readonly base_sha?: string;
    readonly head_sha?: string;
    readonly merge_sha?: string | null;
    readonly changed_files?: readonly string[];
  };
  readonly work_unit?: {
    readonly ffet_id?: string;
    readonly role?: H08PrLifecycleRole;
    readonly declared_roles?: readonly H08PrLifecycleRole[];
  };
  readonly metadata_safety?: {
    readonly title_scanned?: boolean;
    readonly body_scanned?: boolean;
    readonly findings?: readonly string[];
    readonly private_metadata_detected?: boolean;
  };
  readonly closeout?: {
    readonly required?: boolean;
    readonly ref?: string;
    readonly sha256?: string;
    readonly status?: "closeout_complete" | "missing" | "planned";
  };
  readonly terminal_learning?: {
    readonly required?: boolean;
    readonly ref?: string;
    readonly sha256?: string;
    readonly status?: "complete" | "missing" | "planned";
  };
  readonly public_attestation?: {
    readonly pr_body_sha256?: string;
    readonly exact_head_sha?: string;
    readonly merge_sha?: string;
  };
  readonly cannot_claim?: readonly string[];
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;

const ROLE_ALLOWED_PREFIXES: Record<H08PrLifecycleRole, readonly string[]> = {
  product_mutation: [
    ".github/",
    "apps/",
    "docs/",
    "fixtures/",
    "package.json",
    "packages/",
    "scripts/",
    "README.md",
    "COPYRIGHT.md",
    "SECURITY.md",
    "THIRD_PARTY_NOTICES.md"
  ],
  control_evidence: ["control/", "evidence/"],
  shared_integration: [".github/", "package.json", "pnpm-lock.yaml", "scripts/", "packages/", "fixtures/"],
  docs_only: ["README.md", "docs/"],
  runtime: ["runtime/"]
};

const PRODUCT_FORBIDDEN_PRIVATE_PREFIXES = ["control/", "evidence/", "runtime/", "releases/"];

export function verifyH08PrLifecycleConfig(config: H08PrLifecycleConfig): H08PrLifecycleReport {
  const findings: H08PrLifecycleFinding[] = [];
  const verifiedRefs: H08VerifiedPrLifecycleRef[] = [];
  const scenarioResults = config.scenarios.map((scenario) =>
    verifyScenario(config, scenario, findings, verifiedRefs)
  );
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "scenario_status_unexpected" ||
        finding.kind === "expected_scenario_finding_missing"
    );
  const hashFailures = findings.filter(
    (finding) =>
      finding.kind.includes("hash") ||
      finding.kind.includes("sha") ||
      finding.kind.includes("placeholder")
  );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    lifecycle_summary: {
      verified_ref_count: verifiedRefs.length,
      hash_failure_count: hashFailures.length,
      terminal_record_count: scenarioResults.filter((result) => result.terminalState !== "open").length,
      role_purity_failure_count: findings.filter((finding) => finding.kind.includes("role")).length,
      metadata_failure_count: findings.filter((finding) => finding.kind.includes("metadata")).length,
      terminal_learning_failure_count: findings.filter((finding) => finding.kind.includes("terminal_learning")).length
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H08PrLifecycleConfig,
  expectation: H08PrLifecycleScenarioExpectation,
  findings: H08PrLifecycleFinding[],
  verifiedRefs: H08VerifiedPrLifecycleRef[]
): H08PrLifecycleScenarioResult {
  const localFindings: H08PrLifecycleFinding[] = [];
  const hashFinding = validateSha256(expectation.recordSha256, "record_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.recordRef });

  const recordPath = resolveLogicalRef(expectation.recordRef, config.logicalRoots, localFindings);
  let record: H08PrLifecycleRecord | null = null;
  if (recordPath && existsSync(recordPath) && localFindings.length === 0) {
    const text = readFileSync(recordPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.recordSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "record_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.recordRef,
        path: recordPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.recordRef, path: recordPath, sha256: actualHash, source: "pr_lifecycle_record" });
    }
    try {
      record = JSON.parse(text) as H08PrLifecycleRecord;
    } catch (error) {
      localFindings.push({
        kind: "record_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if ((record && containsPrivateMetadata(record)) || PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.recordRef });
    }
  } else if (recordPath && !existsSync(recordPath)) {
    localFindings.push({ kind: "record_missing", scenarioId: expectation.scenarioId, ref: expectation.recordRef, path: recordPath });
  }

  if (record) localFindings.push(...verifyRecord(expectation, record));

  const actualStatus: H08PrLifecycleStatus = localFindings.length === 0 ? "passed" : "failed";
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
      localFindings.push({
        kind: "expected_scenario_finding_missing",
        scenarioId: expectation.scenarioId,
        expected: expectedKind
      });
    }
  }

  findings.push(...localFindings);
  return {
    scenarioId: expectation.scenarioId,
    recordRef: expectation.recordRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    prNumber: record?.pr?.number ?? null,
    terminalState: record?.pr?.state ?? null,
    role: record?.work_unit?.role ?? null,
    changedFileCount: record?.pr?.changed_files?.length ?? 0
  };
}

function verifyRecord(
  expectation: H08PrLifecycleScenarioExpectation,
  record: H08PrLifecycleRecord
): H08PrLifecycleFinding[] {
  const findings: H08PrLifecycleFinding[] = [];
  if (record.schema_version !== "1.0.0") findings.push({ kind: "schema_version_invalid", scenarioId: expectation.scenarioId });
  if (record.lifecycle_id !== expectation.scenarioId) {
    findings.push({
      kind: "lifecycle_id_mismatch",
      scenarioId: expectation.scenarioId,
      expected: expectation.scenarioId,
      actual: String(record.lifecycle_id)
    });
  }
  if (!record.captured_at) findings.push({ kind: "captured_at_missing", scenarioId: expectation.scenarioId });
  const expected = expectation.expected ?? {};
  compareExpectedNumber("pr_number", expected.prNumber, record.pr?.number, findings, expectation.scenarioId);
  compareExpected("terminal_state", expected.terminalState, record.pr?.state, findings, expectation.scenarioId);
  compareExpected("head_sha", expected.headSha, record.pr?.head_sha, findings, expectation.scenarioId);
  compareExpected("merge_sha", expected.mergeSha, record.pr?.merge_sha ?? null, findings, expectation.scenarioId);
  compareExpected("role", expected.role, record.work_unit?.role, findings, expectation.scenarioId);

  validateGitSha(record.pr?.head_sha, "head_sha_invalid", findings, expectation.scenarioId);
  if (record.pr?.state === "merged") {
    validateGitSha(record.pr?.merge_sha ?? undefined, "merge_sha_missing_or_invalid", findings, expectation.scenarioId);
  }
  if (record.public_attestation?.exact_head_sha && record.public_attestation.exact_head_sha !== record.pr?.head_sha) {
    findings.push({
      kind: "attested_head_sha_mismatch",
      scenarioId: expectation.scenarioId,
      expected: String(record.pr?.head_sha),
      actual: record.public_attestation.exact_head_sha
    });
  }
  if (record.public_attestation?.merge_sha && record.public_attestation.merge_sha !== record.pr?.merge_sha) {
    findings.push({
      kind: "attested_merge_sha_mismatch",
      scenarioId: expectation.scenarioId,
      expected: String(record.pr?.merge_sha),
      actual: record.public_attestation.merge_sha
    });
  }

  findings.push(...verifyRolePurity(expectation.scenarioId, record));
  findings.push(...verifyMetadataSafety(expectation.scenarioId, record));
  findings.push(...verifyTerminalArtifacts(expectation, record));
  if (!record.cannot_claim?.includes("github_settings_mutation_authorized")) {
    findings.push({ kind: "settings_mutation_cannot_claim_missing", scenarioId: expectation.scenarioId });
  }
  if (!record.cannot_claim?.includes("branch_protection_mutation_authorized")) {
    findings.push({ kind: "branch_protection_cannot_claim_missing", scenarioId: expectation.scenarioId });
  }
  return findings;
}

function verifyRolePurity(scenarioId: string, record: H08PrLifecycleRecord): H08PrLifecycleFinding[] {
  const findings: H08PrLifecycleFinding[] = [];
  const role = record.work_unit?.role;
  const changedFiles = record.pr?.changed_files ?? [];
  if (!role || !ROLE_ALLOWED_PREFIXES[role]) {
    findings.push({ kind: "role_missing_or_unknown", scenarioId, actual: String(role) });
    return findings;
  }
  if ((record.work_unit?.declared_roles?.length ?? 0) > 1) {
    findings.push({ kind: "multiple_roles_declared", scenarioId, actual: String(record.work_unit?.declared_roles?.length) });
  }
  for (const file of changedFiles) {
    if (isAbsolute(file) || file.includes("\0") || file.includes("..")) {
      findings.push({ kind: "changed_file_path_invalid", scenarioId, path: file });
      continue;
    }
    if (!isAllowedByRole(role, file)) {
      findings.push({ kind: "changed_file_outside_role", scenarioId, path: file, actual: role });
    }
    if (role === "product_mutation" && PRODUCT_FORBIDDEN_PRIVATE_PREFIXES.some((prefix) => file.startsWith(prefix))) {
      findings.push({ kind: "product_pr_private_plane_file", scenarioId, path: file });
    }
  }
  return findings;
}

function verifyMetadataSafety(scenarioId: string, record: H08PrLifecycleRecord): H08PrLifecycleFinding[] {
  const findings: H08PrLifecycleFinding[] = [];
  if (record.metadata_safety?.title_scanned !== true || record.metadata_safety?.body_scanned !== true) {
    findings.push({ kind: "metadata_scan_missing", scenarioId });
  }
  if (record.metadata_safety?.private_metadata_detected === true || (record.metadata_safety?.findings?.length ?? 0) > 0) {
    findings.push({ kind: "unsafe_pr_metadata", scenarioId, actual: String(record.metadata_safety?.findings?.length ?? 0) });
  }
  if (containsPrivateMetadata(record.pr?.title) || containsPrivateMetadata(record.pr?.body)) {
    findings.push({ kind: "private_metadata_detected", scenarioId });
  }
  validateSha256Into(record.public_attestation?.pr_body_sha256, "pr_body_hash_missing_or_invalid", findings, scenarioId);
  return findings;
}

function verifyTerminalArtifacts(
  expectation: H08PrLifecycleScenarioExpectation,
  record: H08PrLifecycleRecord
): H08PrLifecycleFinding[] {
  const findings: H08PrLifecycleFinding[] = [];
  const terminalLearningRequired = expectation.expected?.terminalLearningRequired ?? record.terminal_learning?.required ?? true;
  if (terminalLearningRequired) {
    validateRequiredArtifact(
      "terminal_learning",
      record.terminal_learning?.status,
      record.terminal_learning?.ref,
      record.terminal_learning?.sha256,
      findings,
      expectation.scenarioId
    );
  }
  if (record.closeout?.required ?? true) {
    validateRequiredArtifact(
      "closeout",
      record.closeout?.status,
      record.closeout?.ref,
      record.closeout?.sha256,
      findings,
      expectation.scenarioId
    );
  }
  return findings;
}

function validateRequiredArtifact(
  artifactKind: string,
  status: string | undefined,
  ref: string | undefined,
  sha256: string | undefined,
  findings: H08PrLifecycleFinding[],
  scenarioId: string
): void {
  if (status !== "complete" && status !== "closeout_complete") {
    findings.push({ kind: `${artifactKind}_missing`, scenarioId, actual: String(status) });
  }
  if (!ref) findings.push({ kind: `${artifactKind}_ref_missing`, scenarioId });
  validateSha256Into(sha256, `${artifactKind}_hash_missing_or_invalid`, findings, scenarioId);
}

function isAllowedByRole(role: H08PrLifecycleRole, file: string): boolean {
  return ROLE_ALLOWED_PREFIXES[role].some((prefix) => file === prefix || file.startsWith(prefix));
}

function compareExpected(
  field: string,
  expected: string | null | undefined,
  actual: string | null | undefined,
  findings: H08PrLifecycleFinding[],
  scenarioId: string
): void {
  if (expected === undefined) return;
  if (expected !== actual) {
    findings.push({ kind: `${field}_mismatch`, scenarioId, expected: String(expected), actual: String(actual) });
  }
}

function compareExpectedNumber(
  field: string,
  expected: number | undefined,
  actual: number | undefined,
  findings: H08PrLifecycleFinding[],
  scenarioId: string
): void {
  if (expected === undefined) return;
  if (expected !== actual) {
    findings.push({ kind: `${field}_mismatch`, scenarioId, expected: String(expected), actual: String(actual) });
  }
}

function validateGitSha(
  value: string | null | undefined,
  kind: string,
  findings: H08PrLifecycleFinding[],
  scenarioId: string
): void {
  if (!value || !GIT_SHA_PATTERN.test(value)) findings.push({ kind, scenarioId, actual: String(value) });
}

function validateSha256Into(
  value: string | undefined,
  kind: string,
  findings: H08PrLifecycleFinding[],
  scenarioId: string
): void {
  if (!value || !SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) {
    findings.push({ kind, scenarioId, actual: String(value) });
  }
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H08PrLifecycleFinding[]
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

function validateSha256(value: string, invalidKind: string): H08PrLifecycleFinding | null {
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
