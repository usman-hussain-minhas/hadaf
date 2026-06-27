import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H10MistakeLedgerStatus = "passed" | "failed";
export type H10ExpectedMistakeLedgerStatus = "passed" | "failed";
export type H10MistakeSeverity = "low" | "medium" | "high" | "critical";
export type H10MistakeType = "coding" | "planning" | "evidence" | "security" | "doctrine" | "decision";

export interface H10MistakeLedgerConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H10MistakeLedgerScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H10MistakeLedgerScenarioExpectation {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly recordSha256: string;
  readonly expectedStatus: H10ExpectedMistakeLedgerStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H10ExpectedMistakeLedgerRecord;
}

export interface H10ExpectedMistakeLedgerRecord {
  readonly mistakeType?: H10MistakeType;
  readonly severity?: H10MistakeSeverity;
  readonly evidenceRefCount?: number;
  readonly regressionGuardType?: string;
}

export interface H10MistakeLedgerReport {
  readonly status: H10MistakeLedgerStatus;
  readonly findings: readonly H10MistakeLedgerFinding[];
  readonly scenario_results: readonly H10MistakeLedgerScenarioResult[];
  readonly verified_refs: readonly H10VerifiedMistakeLedgerRef[];
  readonly ledger_summary: H10MistakeLedgerSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H10MistakeLedgerScenarioResult {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly status: H10MistakeLedgerStatus;
  readonly expectedStatus: H10ExpectedMistakeLedgerStatus;
  readonly findingKinds: readonly string[];
  readonly mistakeType: H10MistakeType | null;
  readonly severity: H10MistakeSeverity | null;
  readonly evidenceRefCount: number;
  readonly regressionGuardType: string | null;
}

export interface H10VerifiedMistakeLedgerRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h10_mistake_ledger";
}

export interface H10MistakeLedgerFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H10MistakeLedgerSummary {
  readonly verified_ref_count: number;
  readonly mistake_count: number;
  readonly decision_mistake_count: number;
  readonly repeated_mistake_count: number;
  readonly calibrated_negative_finding_count: number;
  readonly blocking_finding_count: number;
}

interface H10MistakeLedgerRecord {
  readonly schema_version?: string;
  readonly mistake_id?: string;
  readonly ledger_entry_id?: string;
  readonly source_event?: H10SourceEventRecord;
  readonly classification?: H10ClassificationRecord;
  readonly evidence?: H10EvidenceRecord;
  readonly impact?: H10ImpactRecord;
  readonly correction?: H10CorrectionRecord;
  readonly decision_upskill?: H10DecisionUpskillRecord;
  readonly claims?: H10MistakeClaimsRecord;
  readonly cannot_claim?: readonly string[];
}

interface H10SourceEventRecord {
  readonly event_type?: "product_pr" | "ffet" | "control_transaction" | "evidence_transaction" | "runtime_transaction";
  readonly ref?: string;
  readonly sha256?: string;
  readonly product_sha?: string;
  readonly terminal_outcome?: "merged" | "closed" | "complete" | "blocked" | "superseded";
}

interface H10ClassificationRecord {
  readonly mistake_type?: H10MistakeType;
  readonly severity?: H10MistakeSeverity;
  readonly repeated?: boolean;
  readonly systemic?: boolean;
  readonly pattern_id?: string;
}

interface H10EvidenceRecord {
  readonly refs?: readonly H10EvidenceRefRecord[];
}

interface H10EvidenceRefRecord {
  readonly ref?: string;
  readonly sha256?: string;
  readonly purpose?: string;
}

interface H10ImpactRecord {
  readonly affected_box?: string;
  readonly affected_ffet?: string;
  readonly affected_files?: readonly string[];
}

interface H10CorrectionRecord {
  readonly corrected_rule?: string;
  readonly regression_guard?: {
    readonly guard_type?: "fixture" | "checklist_item" | "verifier_rule" | "stop_condition" | "human_gate";
    readonly ref?: string;
    readonly sha256?: string;
  };
  readonly non_degradation_ref?: string;
  readonly non_degradation_sha256?: string;
  readonly future_stop_condition?: string;
}

interface H10DecisionUpskillRecord {
  readonly decision_context?: string;
  readonly rejected_alternatives?: readonly string[];
  readonly decision_failure?: string;
  readonly corrected_rule?: string;
  readonly future_stop_or_ask_condition?: string;
  readonly regression_checklist?: readonly string[];
  readonly cannot_claim?: readonly string[];
}

interface H10MistakeClaimsRecord {
  readonly stable_agents?: boolean;
  readonly globally_qualified_agents?: boolean;
  readonly independently_qualified_agents?: boolean;
  readonly model_weights_updated?: boolean;
  readonly generated_status_as_authority?: boolean;
  readonly all_future_mistakes_prevented?: boolean;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle|PRIVATE_PATH_SENTINEL)/u;
const UNEXPECTED_FINDING_KINDS = new Set([
  "scenario_status_unexpected",
  "expected_scenario_finding_missing",
  "scenario_expected_field_mismatch"
]);
const REQUIRED_CANNOT_CLAIM = [
  "stable_agents",
  "model_weights_updated",
  "independent_quality_auditor_qualified"
];

export function verifyH10MistakeLedgerConfig(config: H10MistakeLedgerConfig): H10MistakeLedgerReport {
  const findings: H10MistakeLedgerFinding[] = [];
  const verifiedRefs: H10VerifiedMistakeLedgerRef[] = [];
  const scenarioResults = config.scenarios.map((scenario) => verifyScenario(config, scenario, findings, verifiedRefs));
  const unexpectedScenarioIds = new Set(
    findings
      .filter((finding) => UNEXPECTED_FINDING_KINDS.has(finding.kind) && finding.scenarioId)
      .map((finding) => finding.scenarioId)
  );
  const blockingFindingCount = findings.filter(
    (finding) =>
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
    ledger_summary: {
      verified_ref_count: verifiedRefs.length,
      mistake_count: scenarioResults.filter((result) => result.status === "passed").length,
      decision_mistake_count: scenarioResults.filter((result) => result.mistakeType === "decision").length,
      repeated_mistake_count: scenarioResults.filter((result) =>
        findings.some((finding) => finding.scenarioId === result.scenarioId && finding.kind === "repeated_mistake_unclassified")
      ).length,
      calibrated_negative_finding_count: Math.max(0, findings.length - blockingFindingCount),
      blocking_finding_count: blockingFindingCount
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H10MistakeLedgerConfig,
  expectation: H10MistakeLedgerScenarioExpectation,
  findings: H10MistakeLedgerFinding[],
  verifiedRefs: H10VerifiedMistakeLedgerRef[]
): H10MistakeLedgerScenarioResult {
  const localFindings: H10MistakeLedgerFinding[] = [];
  const hashFinding = validateSha256(expectation.recordSha256, "record_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.recordRef });

  const recordPath = resolveLogicalRef(expectation.recordRef, config.logicalRoots, localFindings);
  let record: H10MistakeLedgerRecord | null = null;
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
      verifiedRefs.push({ ref: expectation.recordRef, path: recordPath, sha256: actualHash, source: "h10_mistake_ledger" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.recordRef });
    }
    try {
      record = JSON.parse(text) as H10MistakeLedgerRecord;
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

  if (record) localFindings.push(...verifyRecord(expectation.scenarioId, record));

  const status: H10MistakeLedgerStatus = localFindings.length === 0 ? "passed" : "failed";
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
    mistakeType: record?.classification?.mistake_type ?? null,
    severity: record?.classification?.severity ?? null,
    evidenceRefCount: record?.evidence?.refs?.length ?? 0,
    regressionGuardType: record?.correction?.regression_guard?.guard_type ?? null
  };
}

function verifyRecord(scenarioId: string, record: H10MistakeLedgerRecord): H10MistakeLedgerFinding[] {
  const findings: H10MistakeLedgerFinding[] = [];
  if (record.schema_version !== "hadaf_h10_mistake_ledger_v1") {
    findings.push({
      kind: "schema_version_invalid",
      scenarioId,
      expected: "hadaf_h10_mistake_ledger_v1",
      actual: record.schema_version ?? "missing"
    });
  }
  if (!record.mistake_id || PLACEHOLDER_PATTERN.test(record.mistake_id)) findings.push({ kind: "mistake_id_invalid", scenarioId });
  if (!record.ledger_entry_id || PLACEHOLDER_PATTERN.test(record.ledger_entry_id)) {
    findings.push({ kind: "ledger_entry_id_invalid", scenarioId });
  }
  findings.push(...verifySourceEvent(scenarioId, record.source_event));
  findings.push(...verifyClassification(scenarioId, record.classification));
  findings.push(...verifyEvidence(scenarioId, record.evidence));
  findings.push(...verifyImpact(scenarioId, record.impact));
  findings.push(...verifyCorrection(scenarioId, record.correction));
  if (record.classification?.mistake_type === "decision") {
    findings.push(...verifyDecisionUpskill(scenarioId, record.decision_upskill));
  }
  findings.push(...verifyClaims(scenarioId, record.claims));
  for (const requiredCannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (!record.cannot_claim?.includes(requiredCannotClaim)) {
      findings.push({ kind: "required_cannot_claim_missing", scenarioId, expected: requiredCannotClaim });
    }
  }
  return findings;
}

function verifySourceEvent(scenarioId: string, sourceEvent: H10SourceEventRecord | undefined): H10MistakeLedgerFinding[] {
  const findings: H10MistakeLedgerFinding[] = [];
  if (!sourceEvent) return [{ kind: "source_event_missing", scenarioId }];
  if (!sourceEvent.event_type) findings.push({ kind: "source_event_type_missing", scenarioId });
  if (!sourceEvent.ref || PLACEHOLDER_PATTERN.test(sourceEvent.ref)) findings.push({ kind: "source_event_ref_missing", scenarioId });
  const sourceHashFinding = validateSha256(sourceEvent.sha256, "source_event_hash_invalid");
  if (sourceHashFinding) findings.push({ ...sourceHashFinding, scenarioId });
  if (!sourceEvent.product_sha || !GIT_SHA_PATTERN.test(sourceEvent.product_sha) || PLACEHOLDER_PATTERN.test(sourceEvent.product_sha)) {
    findings.push({ kind: "source_event_product_sha_invalid", scenarioId, actual: sourceEvent.product_sha ?? "missing" });
  }
  if (!sourceEvent.terminal_outcome) findings.push({ kind: "source_event_terminal_outcome_missing", scenarioId });
  return findings;
}

function verifyClassification(scenarioId: string, classification: H10ClassificationRecord | undefined): H10MistakeLedgerFinding[] {
  const findings: H10MistakeLedgerFinding[] = [];
  if (!classification) return [{ kind: "classification_missing", scenarioId }];
  if (!classification.mistake_type) findings.push({ kind: "mistake_type_missing", scenarioId });
  if (!classification.severity) findings.push({ kind: "severity_missing", scenarioId });
  if (classification.repeated === true && classification.systemic !== true) {
    findings.push({ kind: "repeated_mistake_unclassified", scenarioId });
  }
  if (classification.repeated === true && (!classification.pattern_id || PLACEHOLDER_PATTERN.test(classification.pattern_id))) {
    findings.push({ kind: "repeated_pattern_id_missing", scenarioId });
  }
  return findings;
}

function verifyEvidence(scenarioId: string, evidence: H10EvidenceRecord | undefined): H10MistakeLedgerFinding[] {
  const findings: H10MistakeLedgerFinding[] = [];
  if (!evidence?.refs?.length) return [{ kind: "evidence_refs_missing", scenarioId }];
  for (const [index, ref] of evidence.refs.entries()) {
    if (!ref.ref || PLACEHOLDER_PATTERN.test(ref.ref)) findings.push({ kind: "evidence_ref_missing", scenarioId, detail: String(index) });
    const hashFinding = validateSha256(ref.sha256, "evidence_hash_invalid");
    if (hashFinding) findings.push(ref.ref ? { ...hashFinding, scenarioId, ref: ref.ref } : { ...hashFinding, scenarioId });
    if (!ref.purpose) findings.push(ref.ref ? { kind: "evidence_purpose_missing", scenarioId, ref: ref.ref } : { kind: "evidence_purpose_missing", scenarioId });
  }
  return findings;
}

function verifyImpact(scenarioId: string, impact: H10ImpactRecord | undefined): H10MistakeLedgerFinding[] {
  if (!impact?.affected_box || !impact.affected_ffet) return [{ kind: "impact_scope_missing", scenarioId }];
  return [];
}

function verifyCorrection(scenarioId: string, correction: H10CorrectionRecord | undefined): H10MistakeLedgerFinding[] {
  const findings: H10MistakeLedgerFinding[] = [];
  if (!correction) return [{ kind: "correction_missing", scenarioId }];
  if (!correction.corrected_rule) findings.push({ kind: "corrected_rule_missing", scenarioId });
  if (!correction.future_stop_condition) findings.push({ kind: "future_stop_condition_missing", scenarioId });
  if (!correction.regression_guard?.guard_type) findings.push({ kind: "regression_guard_type_missing", scenarioId });
  if (!correction.regression_guard?.ref) findings.push({ kind: "regression_guard_ref_missing", scenarioId });
  const guardHashFinding = validateSha256(correction.regression_guard?.sha256, "regression_guard_hash_invalid");
  if (guardHashFinding) findings.push({ ...guardHashFinding, scenarioId });
  if (!correction.non_degradation_ref) findings.push({ kind: "non_degradation_ref_missing", scenarioId });
  const nonDegradationHashFinding = validateSha256(correction.non_degradation_sha256, "non_degradation_hash_invalid");
  if (nonDegradationHashFinding) findings.push({ ...nonDegradationHashFinding, scenarioId });
  return findings;
}

function verifyDecisionUpskill(scenarioId: string, upskill: H10DecisionUpskillRecord | undefined): H10MistakeLedgerFinding[] {
  const findings: H10MistakeLedgerFinding[] = [];
  if (!upskill) return [{ kind: "decision_upskill_missing", scenarioId }];
  if (!upskill.decision_context) findings.push({ kind: "decision_context_missing", scenarioId });
  if (!upskill.rejected_alternatives?.length) findings.push({ kind: "decision_rejected_alternatives_missing", scenarioId });
  if (!upskill.decision_failure) findings.push({ kind: "decision_failure_missing", scenarioId });
  if (!upskill.corrected_rule) findings.push({ kind: "decision_corrected_rule_missing", scenarioId });
  if (!upskill.future_stop_or_ask_condition) findings.push({ kind: "decision_future_stop_missing", scenarioId });
  if (!upskill.regression_checklist?.length) findings.push({ kind: "decision_regression_checklist_missing", scenarioId });
  if (!upskill.cannot_claim?.length) findings.push({ kind: "decision_cannot_claim_missing", scenarioId });
  return findings;
}

function verifyClaims(scenarioId: string, claims: H10MistakeClaimsRecord | undefined): H10MistakeLedgerFinding[] {
  const findings: H10MistakeLedgerFinding[] = [];
  if (claims?.stable_agents === true) findings.push({ kind: "stable_agents_overclaim", scenarioId });
  if (claims?.globally_qualified_agents === true) findings.push({ kind: "globally_qualified_agents_overclaim", scenarioId });
  if (claims?.independently_qualified_agents === true) findings.push({ kind: "independently_qualified_agents_overclaim", scenarioId });
  if (claims?.model_weights_updated === true) findings.push({ kind: "model_weight_update_overclaim", scenarioId });
  if (claims?.generated_status_as_authority === true) findings.push({ kind: "generated_status_authority_overclaim", scenarioId });
  if (claims?.all_future_mistakes_prevented === true) findings.push({ kind: "all_future_mistakes_prevented_overclaim", scenarioId });
  return findings;
}

function compareExpectedRecord(
  expectation: H10MistakeLedgerScenarioExpectation,
  record: H10MistakeLedgerRecord,
  localFindings: H10MistakeLedgerFinding[],
  findings: H10MistakeLedgerFinding[]
): void {
  const expected = expectation.expected;
  if (!expected) return;
  const comparisons: Array<[string, string | number | undefined | null, string | number | undefined | null]> = [
    ["mistakeType", expected.mistakeType, record.classification?.mistake_type],
    ["severity", expected.severity, record.classification?.severity],
    ["evidenceRefCount", expected.evidenceRefCount, record.evidence?.refs?.length ?? 0],
    ["regressionGuardType", expected.regressionGuardType, record.correction?.regression_guard?.guard_type]
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

function validateSha256(value: string | undefined, kind: string): H10MistakeLedgerFinding | null {
  if (!value || !SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) return { kind, actual: value ?? "missing" };
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
  findings: H10MistakeLedgerFinding[]
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
