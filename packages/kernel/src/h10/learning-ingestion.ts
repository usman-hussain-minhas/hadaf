import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H10LearningIngestionStatus = "passed" | "failed";
export type H10ExpectedLearningIngestionStatus = "passed" | "failed";
export type H10TerminalLearningEventType =
  | "product_pr"
  | "ffet"
  | "control_transaction"
  | "evidence_transaction"
  | "runtime_transaction";
export type H10TerminalOutcome = "merged" | "closed" | "complete" | "blocked" | "superseded";
export type H10DurableEffectType = "fixture" | "checklist_item" | "verifier_rule" | "stop_condition" | "human_gate";

export interface H10LearningIngestionConfig {
  readonly logicalRoots: Record<string, string>;
  readonly currentProductSha: string;
  readonly scenarios: readonly H10LearningIngestionScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H10LearningIngestionScenarioExpectation {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly recordSha256: string;
  readonly expectedStatus: H10ExpectedLearningIngestionStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H10ExpectedLearningRecord;
}

export interface H10ExpectedLearningRecord {
  readonly eventType?: H10TerminalLearningEventType;
  readonly terminalOutcome?: H10TerminalOutcome;
  readonly durableEffectType?: H10DurableEffectType;
  readonly evidenceRefCount?: number;
}

export interface H10LearningIngestionReport {
  readonly status: H10LearningIngestionStatus;
  readonly findings: readonly H10LearningIngestionFinding[];
  readonly scenario_results: readonly H10LearningIngestionScenarioResult[];
  readonly verified_refs: readonly H10VerifiedLearningRef[];
  readonly learning_summary: H10LearningIngestionSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H10LearningIngestionScenarioResult {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly status: H10LearningIngestionStatus;
  readonly expectedStatus: H10ExpectedLearningIngestionStatus;
  readonly findingKinds: readonly string[];
  readonly eventType: H10TerminalLearningEventType | null;
  readonly terminalOutcome: H10TerminalOutcome | null;
  readonly durableEffectType: H10DurableEffectType | null;
  readonly evidenceRefCount: number;
}

export interface H10VerifiedLearningRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h10_learning_ingestion";
}

export interface H10LearningIngestionFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H10LearningIngestionSummary {
  readonly verified_ref_count: number;
  readonly learning_record_count: number;
  readonly transaction_learning_count: number;
  readonly calibrated_negative_finding_count: number;
  readonly blocking_finding_count: number;
}

interface H10LearningRecord {
  readonly schema_version?: string;
  readonly learning_id?: string;
  readonly source_event?: H10LearningSourceEvent;
  readonly closeout?: H10CloseoutBinding;
  readonly evidence?: H10LearningEvidence;
  readonly lesson?: H10LessonEffect;
  readonly non_degradation?: H10NonDegradationBinding;
  readonly authority?: H10LearningAuthorityBoundary;
  readonly claims?: H10LearningClaims;
  readonly cannot_claim?: readonly string[];
}

interface H10LearningSourceEvent {
  readonly event_type?: H10TerminalLearningEventType;
  readonly ref?: string;
  readonly sha256?: string;
  readonly product_sha?: string;
  readonly terminal_outcome?: H10TerminalOutcome;
}

interface H10CloseoutBinding {
  readonly ref?: string;
  readonly sha256?: string;
  readonly status?: "closeout_complete" | "terminal_learning_complete" | "complete";
}

interface H10LearningEvidence {
  readonly refs?: readonly H10LearningEvidenceRef[];
}

interface H10LearningEvidenceRef {
  readonly ref?: string;
  readonly sha256?: string;
  readonly purpose?: string;
}

interface H10LessonEffect {
  readonly summary?: string;
  readonly durable_effect?: {
    readonly effect_type?: H10DurableEffectType;
    readonly ref?: string;
    readonly sha256?: string;
  };
}

interface H10NonDegradationBinding {
  readonly ref?: string;
  readonly sha256?: string;
}

interface H10LearningAuthorityBoundary {
  readonly generated_status_used_as_authority?: boolean;
}

interface H10LearningClaims {
  readonly all_future_mistakes_prevented?: boolean;
  readonly stable_agents?: boolean;
  readonly model_weights_updated?: boolean;
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
const REQUIRED_CANNOT_CLAIM = ["stable_agents", "model_weights_updated", "automated_model_updating"];
const TRANSACTION_EVENT_TYPES = new Set<H10TerminalLearningEventType>([
  "control_transaction",
  "evidence_transaction",
  "runtime_transaction"
]);

export function verifyH10LearningIngestionConfig(config: H10LearningIngestionConfig): H10LearningIngestionReport {
  const findings: H10LearningIngestionFinding[] = [];
  const verifiedRefs: H10VerifiedLearningRef[] = [];
  const currentShaFinding = validateGitSha(config.currentProductSha, "current_product_sha_invalid");
  if (currentShaFinding) findings.push(currentShaFinding);
  const scenarioResults = config.scenarios.map((scenario) =>
    verifyScenario(config, scenario, findings, verifiedRefs)
  );
  const unexpectedScenarioIds = new Set(
    findings
      .filter((finding) => UNEXPECTED_FINDING_KINDS.has(finding.kind) && finding.scenarioId)
      .map((finding) => finding.scenarioId)
  );
  const blockingFindingCount = findings.filter(
    (finding) =>
      finding.scenarioId === undefined ||
      UNEXPECTED_FINDING_KINDS.has(finding.kind) ||
      unexpectedScenarioIds.has(finding.scenarioId)
  ).length;
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) || blockingFindingCount > 0;

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    learning_summary: {
      verified_ref_count: verifiedRefs.length,
      learning_record_count: scenarioResults.filter((result) => result.status === "passed").length,
      transaction_learning_count: scenarioResults.filter(
        (result) => result.eventType !== null && TRANSACTION_EVENT_TYPES.has(result.eventType)
      ).length,
      calibrated_negative_finding_count: Math.max(0, findings.length - blockingFindingCount),
      blocking_finding_count: blockingFindingCount
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H10LearningIngestionConfig,
  expectation: H10LearningIngestionScenarioExpectation,
  findings: H10LearningIngestionFinding[],
  verifiedRefs: H10VerifiedLearningRef[]
): H10LearningIngestionScenarioResult {
  const localFindings: H10LearningIngestionFinding[] = [];
  const hashFinding = validateSha256(expectation.recordSha256, "record_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.recordRef });

  const recordPath = resolveLogicalRef(expectation.recordRef, config.logicalRoots, localFindings);
  let record: H10LearningRecord | null = null;
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
      verifiedRefs.push({ ref: expectation.recordRef, path: recordPath, sha256: actualHash, source: "h10_learning_ingestion" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.recordRef });
    }
    try {
      record = JSON.parse(text) as H10LearningRecord;
    } catch (error) {
      localFindings.push({
        kind: "record_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.recordRef });
    }
  } else if (recordPath && !existsSync(recordPath)) {
    localFindings.push({ kind: "record_missing", scenarioId: expectation.scenarioId, ref: expectation.recordRef, path: recordPath });
  }

  if (record) localFindings.push(...verifyRecord(expectation.scenarioId, record, config.currentProductSha));

  const status: H10LearningIngestionStatus = localFindings.length === 0 ? "passed" : "failed";
  if (status !== expectation.expectedStatus) {
    findings.push({
      kind: "scenario_status_unexpected",
      scenarioId: expectation.scenarioId,
      expected: expectation.expectedStatus,
      actual: status
    });
  }
  for (const expectedFinding of expectation.expectedFindingKinds ?? []) {
    if (!localFindings.some((finding) => finding.kind === expectedFinding)) {
      findings.push({ kind: "expected_scenario_finding_missing", scenarioId: expectation.scenarioId, expected: expectedFinding });
    }
  }

  if (record && expectation.expected) {
    compareExpectedRecord(expectation, record, localFindings, findings);
  }

  findings.push(...localFindings);
  return {
    scenarioId: expectation.scenarioId,
    recordRef: expectation.recordRef,
    status,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    eventType: record?.source_event?.event_type ?? null,
    terminalOutcome: record?.source_event?.terminal_outcome ?? null,
    durableEffectType: record?.lesson?.durable_effect?.effect_type ?? null,
    evidenceRefCount: record?.evidence?.refs?.length ?? 0
  };
}

function verifyRecord(
  scenarioId: string,
  record: H10LearningRecord,
  currentProductSha: string
): H10LearningIngestionFinding[] {
  const findings: H10LearningIngestionFinding[] = [];
  if (record.schema_version !== "hadaf_h10_terminal_learning_v1") {
    findings.push({
      kind: "schema_version_invalid",
      scenarioId,
      expected: "hadaf_h10_terminal_learning_v1",
      actual: record.schema_version ?? "missing"
    });
  }
  if (!record.learning_id || PLACEHOLDER_PATTERN.test(record.learning_id)) findings.push({ kind: "learning_id_invalid", scenarioId });
  findings.push(...verifySourceEvent(scenarioId, record.source_event, currentProductSha));
  findings.push(...verifyCloseout(scenarioId, record.closeout));
  findings.push(...verifyEvidence(scenarioId, record.evidence));
  findings.push(...verifyLesson(scenarioId, record.lesson));
  findings.push(...verifyNonDegradation(scenarioId, record.non_degradation));
  findings.push(...verifyAuthorityBoundary(scenarioId, record.authority));
  findings.push(...verifyClaims(scenarioId, record.claims));
  for (const requiredCannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (!record.cannot_claim?.includes(requiredCannotClaim)) {
      findings.push({ kind: "required_cannot_claim_missing", scenarioId, expected: requiredCannotClaim });
    }
  }
  return findings;
}

function verifySourceEvent(
  scenarioId: string,
  sourceEvent: H10LearningSourceEvent | undefined,
  currentProductSha: string
): H10LearningIngestionFinding[] {
  const findings: H10LearningIngestionFinding[] = [];
  if (!sourceEvent) return [{ kind: "source_event_missing", scenarioId }];
  if (!sourceEvent.event_type) findings.push({ kind: "source_event_type_missing", scenarioId });
  if (!sourceEvent.ref || PLACEHOLDER_PATTERN.test(sourceEvent.ref)) findings.push({ kind: "source_event_ref_missing", scenarioId });
  const sourceHashFinding = validateSha256(sourceEvent.sha256, "source_event_hash_invalid");
  if (sourceHashFinding) findings.push({ ...sourceHashFinding, scenarioId });
  const productShaFinding = validateGitSha(sourceEvent.product_sha, "source_event_product_sha_invalid");
  if (productShaFinding) findings.push({ ...productShaFinding, scenarioId });
  if (sourceEvent.product_sha && sourceEvent.product_sha !== currentProductSha) {
    findings.push({
      kind: "source_event_product_sha_stale",
      scenarioId,
      expected: currentProductSha,
      actual: sourceEvent.product_sha
    });
  }
  if (!sourceEvent.terminal_outcome) findings.push({ kind: "source_event_terminal_outcome_missing", scenarioId });
  return findings;
}

function verifyCloseout(scenarioId: string, closeout: H10CloseoutBinding | undefined): H10LearningIngestionFinding[] {
  const findings: H10LearningIngestionFinding[] = [];
  if (!closeout) return [{ kind: "closeout_missing", scenarioId }];
  if (!closeout.ref || PLACEHOLDER_PATTERN.test(closeout.ref)) findings.push({ kind: "closeout_ref_missing", scenarioId });
  const closeoutHashFinding = validateSha256(closeout.sha256, "closeout_hash_invalid");
  if (closeoutHashFinding) findings.push({ ...closeoutHashFinding, scenarioId });
  if (!closeout.status) findings.push({ kind: "closeout_status_missing", scenarioId });
  return findings;
}

function verifyEvidence(scenarioId: string, evidence: H10LearningEvidence | undefined): H10LearningIngestionFinding[] {
  const findings: H10LearningIngestionFinding[] = [];
  if (!evidence?.refs?.length) return [{ kind: "evidence_refs_missing", scenarioId }];
  for (const [index, ref] of evidence.refs.entries()) {
    if (!ref.ref || PLACEHOLDER_PATTERN.test(ref.ref)) findings.push({ kind: "evidence_ref_missing", scenarioId, detail: String(index) });
    const hashFinding = validateSha256(ref.sha256, "evidence_hash_invalid");
    if (hashFinding) findings.push(ref.ref ? { ...hashFinding, scenarioId, ref: ref.ref } : { ...hashFinding, scenarioId });
    if (!ref.purpose) {
      findings.push(ref.ref ? { kind: "evidence_purpose_missing", scenarioId, ref: ref.ref } : { kind: "evidence_purpose_missing", scenarioId });
    }
  }
  return findings;
}

function verifyLesson(scenarioId: string, lesson: H10LessonEffect | undefined): H10LearningIngestionFinding[] {
  const findings: H10LearningIngestionFinding[] = [];
  if (!lesson) return [{ kind: "lesson_missing", scenarioId }];
  if (!lesson.summary || PLACEHOLDER_PATTERN.test(lesson.summary)) findings.push({ kind: "lesson_summary_invalid", scenarioId });
  if (!lesson.durable_effect) return [...findings, { kind: "durable_effect_missing", scenarioId }];
  if (!lesson.durable_effect.effect_type) findings.push({ kind: "durable_effect_type_missing", scenarioId });
  if (!lesson.durable_effect.ref || PLACEHOLDER_PATTERN.test(lesson.durable_effect.ref)) {
    findings.push({ kind: "durable_effect_ref_missing", scenarioId });
  }
  const effectHashFinding = validateSha256(lesson.durable_effect.sha256, "durable_effect_hash_invalid");
  if (effectHashFinding) findings.push({ ...effectHashFinding, scenarioId });
  return findings;
}

function verifyNonDegradation(
  scenarioId: string,
  nonDegradation: H10NonDegradationBinding | undefined
): H10LearningIngestionFinding[] {
  const findings: H10LearningIngestionFinding[] = [];
  if (!nonDegradation) return [{ kind: "non_degradation_missing", scenarioId }];
  if (!nonDegradation.ref || PLACEHOLDER_PATTERN.test(nonDegradation.ref)) findings.push({ kind: "non_degradation_ref_missing", scenarioId });
  const hashFinding = validateSha256(nonDegradation.sha256, "non_degradation_hash_invalid");
  if (hashFinding) findings.push({ ...hashFinding, scenarioId });
  return findings;
}

function verifyAuthorityBoundary(
  scenarioId: string,
  authority: H10LearningAuthorityBoundary | undefined
): H10LearningIngestionFinding[] {
  if (authority?.generated_status_used_as_authority === true) {
    return [{ kind: "generated_status_authority_overclaim", scenarioId }];
  }
  return [];
}

function verifyClaims(scenarioId: string, claims: H10LearningClaims | undefined): H10LearningIngestionFinding[] {
  const findings: H10LearningIngestionFinding[] = [];
  if (claims?.all_future_mistakes_prevented === true) findings.push({ kind: "all_future_mistakes_prevented_overclaim", scenarioId });
  if (claims?.stable_agents === true) findings.push({ kind: "stable_agents_overclaim", scenarioId });
  if (claims?.model_weights_updated === true) findings.push({ kind: "model_weight_update_overclaim", scenarioId });
  return findings;
}

function compareExpectedRecord(
  expectation: H10LearningIngestionScenarioExpectation,
  record: H10LearningRecord,
  localFindings: H10LearningIngestionFinding[],
  findings: H10LearningIngestionFinding[]
): void {
  const expected = expectation.expected;
  if (!expected) return;
  const comparisons: Array<[string, string | number | undefined | null, string | number | undefined | null]> = [
    ["eventType", expected.eventType, record.source_event?.event_type],
    ["terminalOutcome", expected.terminalOutcome, record.source_event?.terminal_outcome],
    ["durableEffectType", expected.durableEffectType, record.lesson?.durable_effect?.effect_type],
    ["evidenceRefCount", expected.evidenceRefCount, record.evidence?.refs?.length ?? 0]
  ];
  for (const [field, expectedValue, actualValue] of comparisons) {
    if (expectedValue !== undefined && expectedValue !== actualValue) {
      const finding = {
        kind: "scenario_expected_field_mismatch",
        scenarioId: expectation.scenarioId,
        expected: `${field}:${expectedValue}`,
        actual: `${field}:${actualValue ?? "null"}`
      };
      localFindings.push(finding);
      findings.push(finding);
    }
  }
}

function validateSha256(value: string | undefined, kind: string): H10LearningIngestionFinding | null {
  if (!value || !SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) return { kind, actual: value ?? "missing" };
  return null;
}

function validateGitSha(value: string | undefined, kind: string): H10LearningIngestionFinding | null {
  if (!value || !GIT_SHA_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) return { kind, actual: value ?? "missing" };
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H10LearningIngestionFinding[]
): string | null {
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
