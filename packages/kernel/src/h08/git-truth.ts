import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H08GitTruthStatus = "passed" | "failed";
export type H08ExpectedGitTruthStatus = "passed" | "failed";

export interface H08GitTruthConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H08GitTruthScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H08GitTruthScenarioExpectation {
  readonly scenarioId: string;
  readonly snapshotRef: string;
  readonly snapshotSha256: string;
  readonly expectedStatus: H08ExpectedGitTruthStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H08GitTruthExpectedSnapshot;
}

export interface H08GitTruthExpectedSnapshot {
  readonly repository?: string;
  readonly branch?: string;
  readonly headSha?: string;
  readonly originMainSha?: string;
  readonly treeHash?: string;
  readonly worktreeClean?: boolean;
  readonly localMainEqualsOriginMain?: boolean;
  readonly githubAvailability?: H08GitHubAvailability;
  readonly openPullRequestCount?: number;
  readonly openPullRequestNumbers?: readonly number[];
}

export interface H08GitTruthReport {
  readonly status: H08GitTruthStatus;
  readonly findings: readonly H08GitTruthFinding[];
  readonly scenario_results: readonly H08GitTruthScenarioResult[];
  readonly verified_refs: readonly H08VerifiedGitTruthRef[];
  readonly git_summary: H08GitTruthSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H08GitTruthScenarioResult {
  readonly scenarioId: string;
  readonly snapshotRef: string;
  readonly status: H08GitTruthStatus;
  readonly expectedStatus: H08ExpectedGitTruthStatus;
  readonly findingKinds: readonly string[];
  readonly repository: string | null;
  readonly headSha: string | null;
  readonly originMainSha: string | null;
  readonly treeHash: string | null;
  readonly githubAvailability: H08GitHubAvailability | null;
  readonly openPullRequestCount: number | null;
}

export interface H08VerifiedGitTruthRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "git_github_truth_snapshot";
}

export interface H08GitTruthFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H08GitTruthSummary {
  readonly verified_ref_count: number;
  readonly hash_failure_count: number;
  readonly read_only_snapshot_count: number;
  readonly github_available_snapshot_count: number;
  readonly mutation_claim_count: number;
  readonly private_metadata_finding_count: number;
}

type H08GitHubAvailability = "available" | "unavailable" | "not_requested";

interface H08GitTruthSnapshot {
  readonly schema_version?: string;
  readonly snapshot_id?: string;
  readonly captured_at?: string;
  readonly capture_mode?: "fixture" | "live_read_only" | "ci_snapshot" | "gh_snapshot";
  readonly repository?: {
    readonly owner?: string;
    readonly name?: string;
    readonly default_branch?: string;
    readonly remote_url?: string;
  };
  readonly git?: {
    readonly branch?: string;
    readonly head_sha?: string;
    readonly origin_main_sha?: string;
    readonly head_tree?: string;
    readonly worktree_clean?: boolean;
    readonly status_short?: readonly string[];
    readonly local_main_equals_origin_main?: boolean;
  };
  readonly github?: {
    readonly availability?: H08GitHubAvailability;
    readonly unavailable_reason?: string;
    readonly open_pull_requests?: readonly H08GitHubPullRequestSnapshot[];
    readonly checks?: readonly H08GitHubCheckSnapshot[];
    readonly settings?: {
      readonly branch_protection_read?: boolean;
      readonly actions_policy_read?: boolean;
      readonly settings_mutation_authorized?: boolean;
      readonly branch_protection_mutation_authorized?: boolean;
    };
  };
  readonly read_only?: {
    readonly git_commands?: readonly string[];
    readonly github_commands?: readonly string[];
    readonly mutation_commands_used?: readonly string[];
    readonly settings_mutation_authorized?: boolean;
    readonly branch_protection_mutation_authorized?: boolean;
  };
  readonly public_safety?: {
    readonly private_metadata_detected?: boolean;
    readonly scanned_fields?: readonly string[];
    readonly findings?: readonly string[];
  };
  readonly cannot_claim?: readonly string[];
}

interface H08GitHubPullRequestSnapshot {
  readonly number?: number;
  readonly title?: string;
  readonly state?: "open" | "closed" | "merged";
  readonly head_sha?: string;
  readonly is_draft?: boolean;
}

interface H08GitHubCheckSnapshot {
  readonly name?: string;
  readonly status?: "queued" | "in_progress" | "completed";
  readonly conclusion?: "success" | "failure" | "cancelled" | "skipped" | "neutral" | "timed_out" | null;
  readonly head_sha?: string;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const TREE_HASH_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/)/u;
const MUTATING_COMMAND_PATTERN =
  /\b(?:git\s+(?:push|reset|checkout|switch|commit|merge|rebase|branch\s+-d|branch\s+-D|worktree\s+remove)|gh\s+(?:pr\s+(?:merge|close|edit|comment)|repo\s+edit|api\b.*(?:--method|-X)\s*(?:PATCH|POST|PUT|DELETE)))\b/iu;

export function verifyH08GitTruthConfig(config: H08GitTruthConfig): H08GitTruthReport {
  const findings: H08GitTruthFinding[] = [];
  const verifiedRefs: H08VerifiedGitTruthRef[] = [];
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
  const mutationClaimCount = findings.filter((finding) => finding.kind.includes("mutation")).length;
  const privateMetadataFindingCount = findings.filter((finding) => finding.kind.includes("private")).length;

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    git_summary: {
      verified_ref_count: verifiedRefs.length,
      hash_failure_count: hashFailures.length,
      read_only_snapshot_count: scenarioResults.filter((result) => result.status === "passed").length,
      github_available_snapshot_count: scenarioResults.filter(
        (result) => result.githubAvailability === "available"
      ).length,
      mutation_claim_count: mutationClaimCount,
      private_metadata_finding_count: privateMetadataFindingCount
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H08GitTruthConfig,
  expectation: H08GitTruthScenarioExpectation,
  findings: H08GitTruthFinding[],
  verifiedRefs: H08VerifiedGitTruthRef[]
): H08GitTruthScenarioResult {
  const localFindings: H08GitTruthFinding[] = [];
  const hashFinding = validateSha256(expectation.snapshotSha256, "snapshot_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.snapshotRef });

  const snapshotPath = resolveLogicalRef(expectation.snapshotRef, config.logicalRoots, localFindings);
  let snapshot: H08GitTruthSnapshot | null = null;
  if (snapshotPath && existsSync(snapshotPath) && localFindings.length === 0) {
    const text = readFileSync(snapshotPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.snapshotSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "snapshot_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.snapshotRef,
        path: snapshotPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({
        ref: expectation.snapshotRef,
        path: snapshotPath,
        sha256: actualHash,
        source: "git_github_truth_snapshot"
      });
    }
    const rawPrivateMetadataDetected = PRIVATE_METADATA_PATTERN.test(text);
    try {
      snapshot = JSON.parse(text) as H08GitTruthSnapshot;
    } catch (error) {
      localFindings.push({
        kind: "snapshot_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (rawPrivateMetadataDetected || (snapshot && containsPrivateMetadata(snapshot))) {
      localFindings.push({
        kind: "private_metadata_detected",
        scenarioId: expectation.scenarioId,
        ref: expectation.snapshotRef,
        path: snapshotPath
      });
    }
  } else if (snapshotPath && !existsSync(snapshotPath)) {
    localFindings.push({
      kind: "snapshot_missing",
      scenarioId: expectation.scenarioId,
      ref: expectation.snapshotRef,
      path: snapshotPath
    });
  }

  if (snapshot) {
    localFindings.push(...verifySnapshot(expectation, snapshot));
  }

  const actualStatus: H08GitTruthStatus = localFindings.length === 0 ? "passed" : "failed";
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
    snapshotRef: expectation.snapshotRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    repository: snapshot ? repositoryName(snapshot) : null,
    headSha: snapshot?.git?.head_sha ?? null,
    originMainSha: snapshot?.git?.origin_main_sha ?? null,
    treeHash: snapshot?.git?.head_tree ?? null,
    githubAvailability: snapshot?.github?.availability ?? null,
    openPullRequestCount: snapshot?.github?.open_pull_requests?.filter((pr) => pr.state === "open").length ?? null
  };
}

function verifySnapshot(
  expectation: H08GitTruthScenarioExpectation,
  snapshot: H08GitTruthSnapshot
): H08GitTruthFinding[] {
  const findings: H08GitTruthFinding[] = [];
  if (snapshot.schema_version !== "1.0.0") {
    findings.push({ kind: "schema_version_invalid", scenarioId: expectation.scenarioId });
  }
  if (snapshot.snapshot_id !== expectation.scenarioId) {
    findings.push({
      kind: "snapshot_id_mismatch",
      scenarioId: expectation.scenarioId,
      expected: expectation.scenarioId,
      actual: String(snapshot.snapshot_id)
    });
  }
  if (!snapshot.captured_at) {
    findings.push({ kind: "captured_at_missing", scenarioId: expectation.scenarioId });
  }
  if (!snapshot.capture_mode || !["fixture", "live_read_only", "ci_snapshot", "gh_snapshot"].includes(snapshot.capture_mode)) {
    findings.push({ kind: "capture_mode_invalid", scenarioId: expectation.scenarioId });
  }

  const repository = repositoryName(snapshot);
  if (!repository) {
    findings.push({ kind: "repository_missing", scenarioId: expectation.scenarioId });
  }
  const expected = expectation.expected ?? {};
  compareExpected("repository", expected.repository, repository, findings, expectation.scenarioId);
  compareExpected("branch", expected.branch, snapshot.git?.branch ?? null, findings, expectation.scenarioId);
  compareExpected("head_sha", expected.headSha, snapshot.git?.head_sha ?? null, findings, expectation.scenarioId);
  compareExpected(
    "origin_main_sha",
    expected.originMainSha,
    snapshot.git?.origin_main_sha ?? null,
    findings,
    expectation.scenarioId
  );
  compareExpected("tree_hash", expected.treeHash, snapshot.git?.head_tree ?? null, findings, expectation.scenarioId);

  validateGitSha(snapshot.git?.head_sha, "head_sha_invalid", findings, expectation.scenarioId);
  validateGitSha(snapshot.git?.origin_main_sha, "origin_main_sha_invalid", findings, expectation.scenarioId);
  validateTreeHash(snapshot.git?.head_tree, "tree_hash_invalid", findings, expectation.scenarioId);

  if (expected.worktreeClean !== undefined && snapshot.git?.worktree_clean !== expected.worktreeClean) {
    findings.push({
      kind: "worktree_clean_mismatch",
      scenarioId: expectation.scenarioId,
      expected: String(expected.worktreeClean),
      actual: String(snapshot.git?.worktree_clean)
    });
  }
  if (
    expected.localMainEqualsOriginMain !== undefined &&
    snapshot.git?.local_main_equals_origin_main !== expected.localMainEqualsOriginMain
  ) {
    findings.push({
      kind: "local_origin_equality_mismatch",
      scenarioId: expectation.scenarioId,
      expected: String(expected.localMainEqualsOriginMain),
      actual: String(snapshot.git?.local_main_equals_origin_main)
    });
  }
  if (snapshot.git?.local_main_equals_origin_main === false || snapshot.git?.head_sha !== snapshot.git?.origin_main_sha) {
    findings.push({
      kind: "head_origin_mismatch",
      scenarioId: expectation.scenarioId,
      expected: String(snapshot.git?.origin_main_sha),
      actual: String(snapshot.git?.head_sha)
    });
  }
  if (snapshot.git?.worktree_clean === false || (snapshot.git?.status_short?.length ?? 0) > 0) {
    findings.push({
      kind: "worktree_dirty",
      scenarioId: expectation.scenarioId,
      actual: String(snapshot.git?.status_short?.length ?? 0)
    });
  }

  const githubAvailability = snapshot.github?.availability ?? null;
  compareExpected(
    "github_availability",
    expected.githubAvailability,
    githubAvailability,
    findings,
    expectation.scenarioId
  );
  if (githubAvailability === "unavailable") {
    const unavailableFinding: H08GitTruthFinding = {
      kind: "github_truth_unavailable",
      scenarioId: expectation.scenarioId
    };
    if (snapshot.github?.unavailable_reason) {
      findings.push({ ...unavailableFinding, detail: snapshot.github.unavailable_reason });
    } else {
      findings.push(unavailableFinding);
    }
  }

  const openPrs = snapshot.github?.open_pull_requests?.filter((pr) => pr.state === "open") ?? [];
  if (expected.openPullRequestCount !== undefined && openPrs.length !== expected.openPullRequestCount) {
    findings.push({
      kind: "open_pr_count_mismatch",
      scenarioId: expectation.scenarioId,
      expected: String(expected.openPullRequestCount),
      actual: String(openPrs.length)
    });
  }
  if (expected.openPullRequestNumbers) {
    const actualNumbers = openPrs.map((pr) => pr.number).filter((number): number is number => typeof number === "number");
    const expectedNumbers = [...expected.openPullRequestNumbers].sort((a, b) => a - b);
    const sortedActual = [...actualNumbers].sort((a, b) => a - b);
    if (JSON.stringify(expectedNumbers) !== JSON.stringify(sortedActual)) {
      findings.push({
        kind: "open_pr_numbers_mismatch",
        scenarioId: expectation.scenarioId,
        expected: expectedNumbers.join(","),
        actual: sortedActual.join(",")
      });
    }
  }

  const commands = [
    ...(snapshot.read_only?.git_commands ?? []),
    ...(snapshot.read_only?.github_commands ?? []),
    ...(snapshot.read_only?.mutation_commands_used ?? [])
  ];
  for (const command of commands) {
    if (MUTATING_COMMAND_PATTERN.test(command)) {
      findings.push({
        kind: "mutating_command_detected",
        scenarioId: expectation.scenarioId,
        detail: command
      });
    }
  }
  if ((snapshot.read_only?.mutation_commands_used?.length ?? 0) > 0) {
    findings.push({
      kind: "mutation_commands_declared",
      scenarioId: expectation.scenarioId,
      actual: String(snapshot.read_only?.mutation_commands_used?.length ?? 0)
    });
  }
  if (snapshot.read_only?.settings_mutation_authorized === true || snapshot.github?.settings?.settings_mutation_authorized === true) {
    findings.push({ kind: "github_settings_mutation_claimed", scenarioId: expectation.scenarioId });
  }
  if (
    snapshot.read_only?.branch_protection_mutation_authorized === true ||
    snapshot.github?.settings?.branch_protection_mutation_authorized === true
  ) {
    findings.push({ kind: "branch_protection_mutation_claimed", scenarioId: expectation.scenarioId });
  }
  if (snapshot.public_safety?.private_metadata_detected === true) {
    findings.push({ kind: "private_metadata_declared", scenarioId: expectation.scenarioId });
  }
  if (!snapshot.cannot_claim?.includes("github_settings_mutation_authorized")) {
    findings.push({ kind: "settings_mutation_cannot_claim_missing", scenarioId: expectation.scenarioId });
  }
  if (!snapshot.cannot_claim?.includes("branch_protection_mutation_authorized")) {
    findings.push({ kind: "branch_protection_cannot_claim_missing", scenarioId: expectation.scenarioId });
  }
  return findings;
}

function compareExpected(
  field: string,
  expected: string | number | boolean | null | undefined,
  actual: string | number | boolean | null | undefined,
  findings: H08GitTruthFinding[],
  scenarioId: string
): void {
  if (expected === undefined) return;
  if (expected !== actual) {
    findings.push({
      kind: `${field}_mismatch`,
      scenarioId,
      expected: String(expected),
      actual: actual === undefined || actual === null ? String(actual) : String(actual)
    });
  }
}

function repositoryName(snapshot: H08GitTruthSnapshot): string | null {
  const owner = snapshot.repository?.owner;
  const name = snapshot.repository?.name;
  return owner && name ? `${owner}/${name}` : null;
}

function validateGitSha(
  value: string | undefined,
  kind: string,
  findings: H08GitTruthFinding[],
  scenarioId: string
): void {
  if (!value || !GIT_SHA_PATTERN.test(value)) {
    findings.push({ kind, scenarioId, actual: String(value) });
  }
}

function validateTreeHash(
  value: string | undefined,
  kind: string,
  findings: H08GitTruthFinding[],
  scenarioId: string
): void {
  if (!value || !TREE_HASH_PATTERN.test(value)) {
    findings.push({ kind, scenarioId, actual: String(value) });
  }
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H08GitTruthFinding[]
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

function validateSha256(value: string, invalidKind: string): H08GitTruthFinding | null {
  if (!SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) {
    return { kind: invalidKind, actual: value };
  }
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function containsPrivateMetadata(value: unknown): boolean {
  if (typeof value === "string") {
    return PRIVATE_METADATA_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsPrivateMetadata(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsPrivateMetadata(item));
  }
  return false;
}
