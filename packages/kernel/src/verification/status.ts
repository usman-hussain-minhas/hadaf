import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export type StatusReconciliationStatus = "passed" | "failed";

export interface StatusReconciliationConfig {
  readonly productRoot?: string;
  readonly expectedMainSha?: string;
  readonly expectedOriginMainSha?: string;
  readonly githubTruthPath?: string;
  readonly githubPullRequests?: readonly GitHubPullRequestTruth[];
  readonly githubExpectations?: readonly GitHubPullRequestExpectation[];
  readonly closeouts?: readonly CloseoutExpectation[];
  readonly generatedStateRecords?: readonly GeneratedStateRecordExpectation[];
  readonly forbiddenClaims?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface GitHubPullRequestTruth {
  readonly number: number;
  readonly state: string;
  readonly headRefOid?: string | null;
  readonly baseRefOid?: string | null;
  readonly mergedAt?: string | null;
  readonly mergeCommit?: { readonly oid?: string | null } | null;
}

export interface GitHubPullRequestExpectation {
  readonly number: number;
  readonly state?: string;
  readonly headSha?: string;
  readonly mergeSha?: string;
}

export interface CloseoutExpectation {
  readonly ffetId: string;
  readonly path: string;
  readonly required?: boolean;
  readonly prNumber?: number;
  readonly headSha?: string;
  readonly mergeSha?: string;
  readonly allowedImplementationStatuses?: readonly string[];
  readonly allowedQualificationStatuses?: readonly string[];
}

export interface GeneratedStateRecordExpectation {
  readonly id: string;
  readonly path: string;
  readonly kind: "current_state" | "runtime_checkpoint" | "generated_status";
  readonly required?: boolean;
  readonly mainShaFields?: readonly string[];
  readonly placeholderHashFields?: readonly string[];
  readonly claimFields?: readonly string[];
  readonly allowStale?: boolean;
  readonly allowPlaceholderHashes?: boolean;
}

export interface StatusReconciliationReport {
  readonly status: StatusReconciliationStatus;
  readonly findings: readonly StatusReconciliationFinding[];
  readonly classified_mismatches: readonly StatusReconciliationFinding[];
  readonly verified_refs: readonly VerifiedStatusRef[];
  readonly hash_failures: readonly StatusReconciliationFinding[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface VerifiedStatusRef {
  readonly ref: string;
  readonly sha256: string;
  readonly source:
    | "github_truth"
    | "closeout"
    | "current_state"
    | "runtime_checkpoint"
    | "generated_status";
}

export interface StatusReconciliationFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;

export function reconcileStatusConfig(
  config: StatusReconciliationConfig
): StatusReconciliationReport {
  const findings: StatusReconciliationFinding[] = [];
  const classifiedMismatches: StatusReconciliationFinding[] = [];
  const verifiedRefs: VerifiedStatusRef[] = [];
  const githubTruth = loadGitHubTruth(config, findings, verifiedRefs);

  verifyGitTruth(config, findings);
  verifyGitHubExpectations(config, githubTruth, findings);
  verifyCloseouts(config, githubTruth, findings, verifiedRefs);
  verifyGeneratedStateRecords(config, findings, classifiedMismatches, verifiedRefs);

  const hashFailures = [...findings, ...classifiedMismatches].filter((finding) =>
    finding.kind.includes("hash") ||
    finding.kind.includes("placeholder") ||
    finding.kind.includes("sha")
  );

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: classifiedMismatches,
    verified_refs: verifiedRefs,
    hash_failures: hashFailures,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadGitHubTruth(
  config: StatusReconciliationConfig,
  findings: StatusReconciliationFinding[],
  verifiedRefs: VerifiedStatusRef[]
): readonly GitHubPullRequestTruth[] {
  if (config.githubPullRequests) return config.githubPullRequests;
  if (!config.githubTruthPath) return [];
  const parsed = parseJsonFile(config.githubTruthPath, findings);
  if (!parsed) return [];
  verifiedRefs.push({
    ref: config.githubTruthPath,
    sha256: sha256File(config.githubTruthPath),
    source: "github_truth"
  });
  return Array.isArray(parsed) ? parsed.flatMap(parseGitHubPullRequestTruth) : [];
}

function verifyGitTruth(
  config: StatusReconciliationConfig,
  findings: StatusReconciliationFinding[]
): void {
  if (!config.productRoot) return;
  if (config.expectedMainSha) {
    const actualHead = git(config.productRoot, ["rev-parse", "HEAD"], findings);
    if (actualHead && actualHead !== config.expectedMainSha) {
      findings.push({
        kind: "git_head_mismatch",
        expected: config.expectedMainSha,
        actual: actualHead
      });
    }
  }
  if (config.expectedOriginMainSha) {
    const actualOrigin = git(config.productRoot, ["rev-parse", "origin/main"], findings);
    if (actualOrigin && actualOrigin !== config.expectedOriginMainSha) {
      findings.push({
        kind: "git_origin_main_mismatch",
        expected: config.expectedOriginMainSha,
        actual: actualOrigin
      });
    }
  }
}

function verifyGitHubExpectations(
  config: StatusReconciliationConfig,
  githubTruth: readonly GitHubPullRequestTruth[],
  findings: StatusReconciliationFinding[]
): void {
  for (const expectation of config.githubExpectations ?? []) {
    const pr = githubTruth.find((candidate) => candidate.number === expectation.number);
    if (!pr) {
      findings.push({
        kind: "github_pr_missing",
        ref: `pr:${expectation.number}`
      });
      continue;
    }
    verifyPrExpectation(expectation, pr, findings);
  }
}

function verifyCloseouts(
  config: StatusReconciliationConfig,
  githubTruth: readonly GitHubPullRequestTruth[],
  findings: StatusReconciliationFinding[],
  verifiedRefs: VerifiedStatusRef[]
): void {
  for (const expectation of config.closeouts ?? []) {
    if (!existsSync(expectation.path)) {
      if (expectation.required !== false) {
        findings.push({
          kind: "missing_closeout",
          ref: expectation.ffetId,
          detail: expectation.path
        });
      }
      continue;
    }

    const parsed = parseJsonFile(expectation.path, findings);
    if (!isRecord(parsed)) continue;
    verifiedRefs.push({
      ref: expectation.path,
      sha256: sha256File(expectation.path),
      source: "closeout"
    });

    const closeoutFor = stringValue(parsed.closeoutFor) ?? stringValue(parsed.closeout_for);
    if (closeoutFor && closeoutFor !== expectation.ffetId) {
      findings.push({
        kind: "closeout_for_mismatch",
        ref: expectation.ffetId,
        expected: expectation.ffetId,
        actual: closeoutFor
      });
    }

    const prNumber = numberValue(parsed.prNumber) ?? numberValue(parsed.pr_number);
    if (expectation.prNumber !== undefined && prNumber !== expectation.prNumber) {
      findings.push({
        kind: "closeout_pr_mismatch",
        ref: expectation.ffetId,
        expected: String(expectation.prNumber),
        actual: prNumber === undefined ? "missing" : String(prNumber)
      });
    }

    const headSha = stringValue(parsed.exactHeadSha) ?? stringValue(parsed.exact_head_sha);
    if (expectation.headSha && headSha !== expectation.headSha) {
      findings.push({
        kind: "closeout_head_sha_mismatch",
        ref: expectation.ffetId,
        expected: expectation.headSha,
        actual: headSha ?? "missing"
      });
    }

    const mergeSha = stringValue(parsed.mergeSha) ?? stringValue(parsed.merge_sha);
    if (expectation.mergeSha && mergeSha !== expectation.mergeSha) {
      findings.push({
        kind: "closeout_merge_sha_mismatch",
        ref: expectation.ffetId,
        expected: expectation.mergeSha,
        actual: mergeSha ?? "missing"
      });
    }

    verifyAllowedStatus(
      "closeout_implementation_status_unaccepted",
      expectation.ffetId,
      stringValue(parsed.implementationStatus) ?? stringValue(parsed.implementation_status),
      expectation.allowedImplementationStatuses,
      findings
    );
    verifyAllowedStatus(
      "closeout_qualification_status_unaccepted",
      expectation.ffetId,
      stringValue(parsed.qualificationStatus) ?? stringValue(parsed.qualification_status),
      expectation.allowedQualificationStatuses,
      findings
    );

    if (prNumber !== undefined) {
      const pr = githubTruth.find((candidate) => candidate.number === prNumber);
      if (!pr) {
        findings.push({
          kind: "closeout_github_pr_missing",
          ref: expectation.ffetId,
          detail: `PR ${prNumber}`
        });
    } else {
        const prExpectation: GitHubPullRequestExpectation = {
          number: prNumber,
          state: "MERGED",
          ...(headSha ? { headSha } : {}),
          ...(mergeSha ? { mergeSha } : {})
        };
        verifyPrExpectation(prExpectation, pr, findings, expectation.ffetId);
      }
    }
  }
}

function verifyGeneratedStateRecords(
  config: StatusReconciliationConfig,
  findings: StatusReconciliationFinding[],
  classifiedMismatches: StatusReconciliationFinding[],
  verifiedRefs: VerifiedStatusRef[]
): void {
  for (const expectation of config.generatedStateRecords ?? []) {
    if (!existsSync(expectation.path)) {
      if (expectation.required !== false) {
        findings.push({
          kind: "missing_generated_state",
          ref: expectation.id,
          detail: expectation.path
        });
      }
      continue;
    }

    const parsed = parseJsonFile(expectation.path, findings);
    if (!isRecord(parsed)) continue;
    verifiedRefs.push({
      ref: expectation.path,
      sha256: sha256File(expectation.path),
      source: expectation.kind
    });

    for (const field of expectation.mainShaFields ?? []) {
      const actual = valueAtPath(parsed, field);
      if (
        config.expectedMainSha &&
        typeof actual === "string" &&
        actual !== config.expectedMainSha
      ) {
        const target = expectation.allowStale === false ? findings : classifiedMismatches;
        target.push({
          kind: `${expectation.kind}_stale_main_sha`,
          ref: expectation.id,
          expected: config.expectedMainSha,
          actual,
          detail: field
        });
      }
    }

    for (const field of expectation.placeholderHashFields ?? []) {
      const actual = valueAtPath(parsed, field);
      if (typeof actual === "string" && PLACEHOLDER_PATTERN.test(actual)) {
        const target = expectation.allowPlaceholderHashes === false ? findings : classifiedMismatches;
        target.push({
          kind: `${expectation.kind}_placeholder_hash`,
          ref: expectation.id,
          actual,
          detail: field
        });
      }
    }

    for (const field of expectation.claimFields ?? []) {
      const actual = valueAtPath(parsed, field);
      if (typeof actual !== "string") continue;
      const forbidden = (config.forbiddenClaims ?? []).find((claim) => containsClaim(actual, claim));
      if (forbidden) {
        findings.push({
          kind: "generated_status_overclaim",
          ref: expectation.id,
          expected: `not ${forbidden}`,
          actual,
          detail: field
        });
      }
    }
  }
}

function verifyPrExpectation(
  expectation: GitHubPullRequestExpectation,
  pr: GitHubPullRequestTruth,
  findings: StatusReconciliationFinding[],
  ref = `pr:${expectation.number}`
): void {
  if (expectation.state && pr.state !== expectation.state) {
    findings.push({
      kind: "github_pr_state_mismatch",
      ref,
      expected: expectation.state,
      actual: pr.state
    });
  }
  if (expectation.headSha && pr.headRefOid !== expectation.headSha) {
    findings.push({
      kind: "github_pr_head_sha_mismatch",
      ref,
      expected: expectation.headSha,
      actual: pr.headRefOid ?? "missing"
    });
  }
  const mergeSha = pr.mergeCommit?.oid ?? null;
  if (expectation.mergeSha && mergeSha !== expectation.mergeSha) {
    findings.push({
      kind: "github_pr_merge_sha_mismatch",
      ref,
      expected: expectation.mergeSha,
      actual: mergeSha ?? "missing"
    });
  }
}

function verifyAllowedStatus(
  kind: string,
  ref: string,
  actual: string | undefined,
  allowed: readonly string[] | undefined,
  findings: StatusReconciliationFinding[]
): void {
  if (!allowed) return;
  if (!actual || !allowed.includes(actual)) {
    findings.push({
      kind,
      ref,
      expected: allowed.join(","),
      actual: actual ?? "missing"
    });
  }
}

function parseJsonFile(
  path: string,
  findings: StatusReconciliationFinding[]
): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    findings.push({
      kind: "json_parse_failed",
      ref: path,
      detail: error instanceof Error ? error.message : "unknown parse error"
    });
    return null;
  }
}

function parseGitHubPullRequestTruth(value: unknown): GitHubPullRequestTruth[] {
  if (!isRecord(value)) return [];
  const number = numberValue(value.number);
  const state = stringValue(value.state);
  if (number === undefined || !state) return [];
  return [
    {
      number,
      state,
      headRefOid: stringValue(value.headRefOid) ?? null,
      baseRefOid: stringValue(value.baseRefOid) ?? null,
      mergedAt: stringValue(value.mergedAt) ?? null,
      mergeCommit: isRecord(value.mergeCommit)
        ? { oid: stringValue(value.mergeCommit.oid) ?? null }
        : null
    }
  ];
}

function git(
  cwd: string,
  args: readonly string[],
  findings: StatusReconciliationFinding[]
): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    findings.push({
      kind: "git_command_failed",
      detail: result.stderr.trim()
    });
    return null;
  }
  return result.stdout.trim();
}

function valueAtPath(record: Record<string, unknown>, path: string): unknown {
  let current: unknown = record;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function containsClaim(value: string, claim: string): boolean {
  return normalizeClaim(value).includes(normalizeClaim(claim));
}

function normalizeClaim(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "_");
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
