import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H10AntiRepeatStatus = "passed" | "failed";
export type H10ExpectedAntiRepeatStatus = "passed" | "failed";
export type H10RegressionDrillStatus = "passed" | "failed" | "not_run";
export type H10AntiRepeatGuardType = "fixture" | "verifier_rule" | "stop_condition" | "checklist_item" | "human_gate";

export interface H10AntiRepeatConfig {
  readonly logicalRoots: Record<string, string>;
  readonly currentProductSha: string;
  readonly scenarios: readonly H10AntiRepeatScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H10AntiRepeatScenarioExpectation {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly recordSha256: string;
  readonly expectedStatus: H10ExpectedAntiRepeatStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H10ExpectedAntiRepeatRecord;
}

export interface H10ExpectedAntiRepeatRecord {
  readonly guardType?: H10AntiRepeatGuardType;
  readonly regressionDrillStatus?: H10RegressionDrillStatus;
  readonly repeatedPattern?: boolean;
}

export interface H10AntiRepeatReport {
  readonly status: H10AntiRepeatStatus;
  readonly findings: readonly H10AntiRepeatFinding[];
  readonly scenario_results: readonly H10AntiRepeatScenarioResult[];
  readonly verified_refs: readonly H10VerifiedAntiRepeatRef[];
  readonly anti_repeat_summary: H10AntiRepeatSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H10AntiRepeatScenarioResult {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly status: H10AntiRepeatStatus;
  readonly expectedStatus: H10ExpectedAntiRepeatStatus;
  readonly findingKinds: readonly string[];
  readonly guardType: H10AntiRepeatGuardType | null;
  readonly regressionDrillStatus: H10RegressionDrillStatus | null;
  readonly repeatedPattern: boolean | null;
}

export interface H10VerifiedAntiRepeatRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h10_anti_repeat";
}

export interface H10AntiRepeatFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H10AntiRepeatSummary {
  readonly verified_ref_count: number;
  readonly passed_drill_count: number;
  readonly guarded_repeat_count: number;
  readonly calibrated_negative_finding_count: number;
  readonly blocking_finding_count: number;
}

interface H10AntiRepeatRecord {
  readonly schema_version?: string;
  readonly anti_repeat_id?: string;
  readonly pattern_id?: string;
  readonly source_mistake?: H10RefHash;
  readonly repeated_pattern?: boolean;
  readonly guard?: H10GuardRecord;
  readonly regression_drill?: H10RegressionDrillRecord;
  readonly non_degradation?: H10NonDegradationRecord;
  readonly waiver?: H10WaiverRecord;
  readonly bypass?: H10BypassRecord;
  readonly claims?: H10AntiRepeatClaims;
  readonly cannot_claim?: readonly string[];
}

interface H10RefHash {
  readonly ref?: string;
  readonly sha256?: string;
}

interface H10GuardRecord extends H10RefHash {
  readonly guard_type?: H10AntiRepeatGuardType;
}

interface H10RegressionDrillRecord {
  readonly status?: H10RegressionDrillStatus;
  readonly command_ref?: string;
  readonly output_sha256?: string;
  readonly product_sha?: string;
}

interface H10NonDegradationRecord extends H10RefHash {
  readonly status?: "passed" | "failed";
}

interface H10WaiverRecord {
  readonly applied?: boolean;
  readonly authority_ref?: string;
  readonly authority_sha256?: string;
  readonly reason?: string;
}

interface H10BypassRecord {
  readonly attempted?: boolean;
  readonly reason?: string;
}

interface H10AntiRepeatClaims {
  readonly all_future_mistakes_prevented?: boolean;
  readonly anti_repeat_prevents_all_regressions?: boolean;
  readonly stable_agents?: boolean;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|input\/planning_bundle|PRIVATE_PATH_SENTINEL)/u;
const UNEXPECTED_FINDING_KINDS = new Set([
  "scenario_status_unexpected",
  "expected_scenario_finding_missing",
  "scenario_expected_field_mismatch"
]);
const REQUIRED_CANNOT_CLAIM = ["all_future_mistakes_prevented", "anti_repeat_prevents_all_regressions", "stable_agents"];

export function verifyH10AntiRepeatConfig(config: H10AntiRepeatConfig): H10AntiRepeatReport {
  const findings: H10AntiRepeatFinding[] = [];
  const verifiedRefs: H10VerifiedAntiRepeatRef[] = [];
  const productShaFinding = validateGitSha(config.currentProductSha, "current_product_sha_invalid");
  if (productShaFinding) findings.push(productShaFinding);
  const scenarioResults = config.scenarios.map((scenario) => verifyScenario(config, scenario, findings, verifiedRefs));
  const unexpectedScenarioIds = new Set(
    findings
      .filter((finding) => UNEXPECTED_FINDING_KINDS.has(finding.kind) && finding.scenarioId)
      .map((finding) => finding.scenarioId)
  );
  const blockingFindingCount = findings.filter(
    (finding) =>
      finding.scenarioId === undefined ||
      UNEXPECTED_FINDING_KINDS.has(finding.kind) ||
      (finding.scenarioId !== undefined && unexpectedScenarioIds.has(finding.scenarioId))
  ).length;
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) || blockingFindingCount > 0;

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    anti_repeat_summary: {
      verified_ref_count: verifiedRefs.length,
      passed_drill_count: scenarioResults.filter(
        (result) => result.status === "passed" && result.regressionDrillStatus === "passed"
      ).length,
      guarded_repeat_count: scenarioResults.filter(
        (result) => result.status === "passed" && result.repeatedPattern === true && result.guardType !== null
      ).length,
      calibrated_negative_finding_count: Math.max(0, findings.length - blockingFindingCount),
      blocking_finding_count: blockingFindingCount
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H10AntiRepeatConfig,
  expectation: H10AntiRepeatScenarioExpectation,
  findings: H10AntiRepeatFinding[],
  verifiedRefs: H10VerifiedAntiRepeatRef[]
): H10AntiRepeatScenarioResult {
  const localFindings: H10AntiRepeatFinding[] = [];
  const hashFinding = validateSha256(expectation.recordSha256, "record_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.recordRef });

  const recordPath = resolveLogicalRef(expectation.recordRef, config.logicalRoots, localFindings);
  let record: H10AntiRepeatRecord | null = null;
  if (recordPath && existsSync(recordPath) && localFindings.length === 0) {
    const text = readFileSync(recordPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.recordSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({ kind: "record_hash_mismatch", scenarioId: expectation.scenarioId, ref: expectation.recordRef, path: recordPath, expected: expectedHash, actual: actualHash });
    } else {
      verifiedRefs.push({ ref: expectation.recordRef, path: recordPath, sha256: actualHash, source: "h10_anti_repeat" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.recordRef });
    try {
      record = JSON.parse(text) as H10AntiRepeatRecord;
    } catch (error) {
      localFindings.push({ kind: "record_json_invalid", scenarioId: expectation.scenarioId, detail: error instanceof Error ? error.message : String(error) });
    }
    if (record && containsPrivateMetadata(record)) localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.recordRef });
  } else if (recordPath && !existsSync(recordPath)) {
    localFindings.push({ kind: "record_missing", scenarioId: expectation.scenarioId, ref: expectation.recordRef, path: recordPath });
  }

  if (record) localFindings.push(...verifyRecord(expectation.scenarioId, record, config.currentProductSha));

  const status: H10AntiRepeatStatus = localFindings.length === 0 ? "passed" : "failed";
  if (status !== expectation.expectedStatus) {
    findings.push({ kind: "scenario_status_unexpected", scenarioId: expectation.scenarioId, expected: expectation.expectedStatus, actual: status });
  }
  for (const expectedFinding of expectation.expectedFindingKinds ?? []) {
    if (!localFindings.some((finding) => finding.kind === expectedFinding)) {
      findings.push({ kind: "expected_scenario_finding_missing", scenarioId: expectation.scenarioId, expected: expectedFinding });
    }
  }
  if (record && expectation.expected) compareExpectedRecord(expectation, record, localFindings, findings);

  findings.push(...localFindings);
  return {
    scenarioId: expectation.scenarioId,
    recordRef: expectation.recordRef,
    status,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    guardType: record?.guard?.guard_type ?? null,
    regressionDrillStatus: record?.regression_drill?.status ?? null,
    repeatedPattern: record?.repeated_pattern ?? null
  };
}

function verifyRecord(scenarioId: string, record: H10AntiRepeatRecord, currentProductSha: string): H10AntiRepeatFinding[] {
  const findings: H10AntiRepeatFinding[] = [];
  if (record.schema_version !== "hadaf_h10_anti_repeat_v1") findings.push({ kind: "schema_version_invalid", scenarioId, expected: "hadaf_h10_anti_repeat_v1", actual: record.schema_version ?? "missing" });
  if (!record.anti_repeat_id || PLACEHOLDER_PATTERN.test(record.anti_repeat_id)) findings.push({ kind: "anti_repeat_id_invalid", scenarioId });
  if (!record.pattern_id || PLACEHOLDER_PATTERN.test(record.pattern_id)) findings.push({ kind: "pattern_id_invalid", scenarioId });
  findings.push(...verifyRefHash(scenarioId, record.source_mistake, "source_mistake"));
  if (record.repeated_pattern === true) {
    findings.push(...verifyGuard(scenarioId, record.guard));
  }
  findings.push(...verifyRegressionDrill(scenarioId, record.regression_drill, currentProductSha));
  findings.push(...verifyNonDegradation(scenarioId, record.non_degradation));
  findings.push(...verifyWaiver(scenarioId, record.waiver));
  if (record.bypass?.attempted === true) findings.push({ kind: "anti_repeat_bypass_attempted", scenarioId });
  findings.push(...verifyClaims(scenarioId, record.claims));
  for (const requiredCannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (!record.cannot_claim?.includes(requiredCannotClaim)) findings.push({ kind: "required_cannot_claim_missing", scenarioId, expected: requiredCannotClaim });
  }
  return findings;
}

function verifyRefHash(scenarioId: string, value: H10RefHash | undefined, prefix: string): H10AntiRepeatFinding[] {
  const findings: H10AntiRepeatFinding[] = [];
  if (!value) return [{ kind: `${prefix}_missing`, scenarioId }];
  if (!value.ref || PLACEHOLDER_PATTERN.test(value.ref)) findings.push({ kind: `${prefix}_ref_missing`, scenarioId });
  const hashFinding = validateSha256(value.sha256, `${prefix}_hash_invalid`);
  if (hashFinding) findings.push({ ...hashFinding, scenarioId });
  return findings;
}

function verifyGuard(scenarioId: string, guard: H10GuardRecord | undefined): H10AntiRepeatFinding[] {
  const findings = verifyRefHash(scenarioId, guard, "guard");
  if (!guard?.guard_type) findings.push({ kind: "guard_type_missing", scenarioId });
  return findings;
}

function verifyRegressionDrill(
  scenarioId: string,
  drill: H10RegressionDrillRecord | undefined,
  currentProductSha: string
): H10AntiRepeatFinding[] {
  const findings: H10AntiRepeatFinding[] = [];
  if (!drill) return [{ kind: "regression_drill_missing", scenarioId }];
  if (drill.status !== "passed") findings.push({ kind: "regression_drill_not_passed", scenarioId, actual: drill.status ?? "missing" });
  if (!drill.command_ref || PLACEHOLDER_PATTERN.test(drill.command_ref)) findings.push({ kind: "regression_drill_command_missing", scenarioId });
  const outputHashFinding = validateSha256(drill.output_sha256, "regression_drill_output_hash_invalid");
  if (outputHashFinding) findings.push({ ...outputHashFinding, scenarioId });
  const productShaFinding = validateGitSha(drill.product_sha, "regression_drill_product_sha_invalid");
  if (productShaFinding) findings.push({ ...productShaFinding, scenarioId });
  if (drill.product_sha && drill.product_sha !== currentProductSha) {
    findings.push({ kind: "regression_drill_product_sha_stale", scenarioId, expected: currentProductSha, actual: drill.product_sha });
  }
  return findings;
}

function verifyNonDegradation(
  scenarioId: string,
  nonDegradation: H10NonDegradationRecord | undefined
): H10AntiRepeatFinding[] {
  const findings = verifyRefHash(scenarioId, nonDegradation, "non_degradation");
  if (nonDegradation?.status !== "passed") findings.push({ kind: "non_degradation_not_passed", scenarioId, actual: nonDegradation?.status ?? "missing" });
  return findings;
}

function verifyWaiver(scenarioId: string, waiver: H10WaiverRecord | undefined): H10AntiRepeatFinding[] {
  const findings: H10AntiRepeatFinding[] = [];
  if (waiver?.applied === true) {
    if (!waiver.reason) findings.push({ kind: "waiver_reason_missing", scenarioId });
    if (!waiver.authority_ref || PLACEHOLDER_PATTERN.test(waiver.authority_ref)) findings.push({ kind: "waiver_authority_missing", scenarioId });
    const waiverHashFinding = validateSha256(waiver.authority_sha256, "waiver_authority_hash_invalid");
    if (waiverHashFinding) findings.push({ ...waiverHashFinding, scenarioId });
  }
  return findings;
}

function verifyClaims(scenarioId: string, claims: H10AntiRepeatClaims | undefined): H10AntiRepeatFinding[] {
  const findings: H10AntiRepeatFinding[] = [];
  if (claims?.all_future_mistakes_prevented === true) findings.push({ kind: "all_future_mistakes_prevented_overclaim", scenarioId });
  if (claims?.anti_repeat_prevents_all_regressions === true) findings.push({ kind: "anti_repeat_prevents_all_regressions_overclaim", scenarioId });
  if (claims?.stable_agents === true) findings.push({ kind: "stable_agents_overclaim", scenarioId });
  return findings;
}

function compareExpectedRecord(
  expectation: H10AntiRepeatScenarioExpectation,
  record: H10AntiRepeatRecord,
  localFindings: H10AntiRepeatFinding[],
  findings: H10AntiRepeatFinding[]
): void {
  const expected = expectation.expected;
  if (!expected) return;
  const comparisons: Array<[string, string | boolean | undefined | null, string | boolean | undefined | null]> = [
    ["guardType", expected.guardType, record.guard?.guard_type],
    ["regressionDrillStatus", expected.regressionDrillStatus, record.regression_drill?.status],
    ["repeatedPattern", expected.repeatedPattern, record.repeated_pattern]
  ];
  for (const [field, expectedValue, actualValue] of comparisons) {
    if (expectedValue !== undefined && expectedValue !== actualValue) {
      const finding = { kind: "scenario_expected_field_mismatch", scenarioId: expectation.scenarioId, expected: `${field}:${expectedValue}`, actual: `${field}:${actualValue ?? "null"}` };
      localFindings.push(finding);
      findings.push(finding);
    }
  }
}

function validateSha256(value: string | undefined, kind: string): H10AntiRepeatFinding | null {
  if (!value || !SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) return { kind, actual: value ?? "missing" };
  return null;
}

function validateGitSha(value: string | undefined, kind: string): H10AntiRepeatFinding | null {
  if (!value || !GIT_SHA_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) return { kind, actual: value ?? "missing" };
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function resolveLogicalRef(ref: string, logicalRoots: Record<string, string>, findings: H10AntiRepeatFinding[]): string | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.+)$/u.exec(ref);
  if (!match) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const scheme = match[1];
  const rest = match[2];
  if (!scheme || !rest) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const root = logicalRoots[scheme];
  if (!root) {
    findings.push({ kind: "logical_root_missing", ref });
    return null;
  }
  if (isAbsolute(rest) || rest.includes("..")) {
    findings.push({ kind: "logical_ref_escape", ref });
    return null;
  }
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, rest);
  const relativePath = relative(resolvedRoot, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    findings.push({ kind: "logical_ref_escape", ref });
    return null;
  }
  return normalize(resolvedPath);
}

function containsPrivateMetadata(value: unknown): boolean {
  if (typeof value === "string") return PRIVATE_METADATA_PATTERN.test(value);
  if (Array.isArray(value)) return value.some((item) => containsPrivateMetadata(item));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsPrivateMetadata(item));
  return false;
}
