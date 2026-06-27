import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H10UpskillProposalStatus = "passed" | "failed";
export type H10ExpectedUpskillProposalStatus = "passed" | "failed";
export type H10UpskillType = "coding" | "planning" | "evidence" | "security" | "doctrine" | "decision";
export type H10DurableUpskillEffectType = "fixture" | "checklist_item" | "verifier_rule" | "stop_condition" | "human_gate";
export type H10PromotionStatus =
  | "fixture_tested"
  | "qualified_for_bounded_use"
  | "advisory_only"
  | "blocked"
  | "suspended"
  | "deprecated"
  | "stable"
  | "globally_qualified"
  | "independently_qualified";

export interface H10UpskillProposalConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H10UpskillProposalScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H10UpskillProposalScenarioExpectation {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly recordSha256: string;
  readonly expectedStatus: H10ExpectedUpskillProposalStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H10ExpectedUpskillProposalRecord;
}

export interface H10ExpectedUpskillProposalRecord {
  readonly upskillType?: H10UpskillType;
  readonly requestedStatus?: H10PromotionStatus;
  readonly durableEffectType?: H10DurableUpskillEffectType;
}

export interface H10UpskillProposalReport {
  readonly status: H10UpskillProposalStatus;
  readonly findings: readonly H10UpskillProposalFinding[];
  readonly scenario_results: readonly H10UpskillProposalScenarioResult[];
  readonly verified_refs: readonly H10VerifiedUpskillProposalRef[];
  readonly upskill_summary: H10UpskillProposalSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H10UpskillProposalScenarioResult {
  readonly scenarioId: string;
  readonly recordRef: string;
  readonly status: H10UpskillProposalStatus;
  readonly expectedStatus: H10ExpectedUpskillProposalStatus;
  readonly findingKinds: readonly string[];
  readonly upskillType: H10UpskillType | null;
  readonly requestedStatus: H10PromotionStatus | null;
  readonly durableEffectType: H10DurableUpskillEffectType | null;
}

export interface H10VerifiedUpskillProposalRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h10_upskill_proposals";
}

export interface H10UpskillProposalFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H10UpskillProposalSummary {
  readonly verified_ref_count: number;
  readonly proposal_count: number;
  readonly decision_upskill_count: number;
  readonly bounded_promotion_count: number;
  readonly calibrated_negative_finding_count: number;
  readonly blocking_finding_count: number;
}

interface H10UpskillProposalRecord {
  readonly schema_version?: string;
  readonly proposal_id?: string;
  readonly agent_id?: string;
  readonly agent_version?: string;
  readonly upskill_type?: H10UpskillType;
  readonly trigger?: H10UpskillTrigger;
  readonly old_behavior?: string;
  readonly proposed_behavior?: string;
  readonly durable_effect?: H10DurableUpskillEffect;
  readonly decision_upskill?: H10DecisionUpskill;
  readonly non_degradation?: H10NonDegradation;
  readonly authority_change?: H10AuthorityChange;
  readonly promotion_gate?: H10PromotionGate;
  readonly claims?: H10UpskillClaims;
  readonly cannot_claim?: readonly string[];
}

interface H10UpskillTrigger {
  readonly ref?: string;
  readonly sha256?: string;
  readonly product_sha?: string;
}

interface H10DurableUpskillEffect {
  readonly effect_type?: H10DurableUpskillEffectType;
  readonly ref?: string;
  readonly sha256?: string;
}

interface H10DecisionUpskill {
  readonly decision_context?: string;
  readonly rejected_alternatives?: readonly string[];
  readonly decision_failure?: string;
  readonly corrected_rule?: string;
  readonly future_stop_or_ask_condition?: string;
  readonly regression_checklist?: readonly string[];
  readonly cannot_claim?: readonly string[];
}

interface H10NonDegradation {
  readonly ref?: string;
  readonly sha256?: string;
}

interface H10AuthorityChange {
  readonly changes_governing_authority?: boolean;
  readonly ratified_authority_ref?: string;
  readonly ratified_authority_sha256?: string;
}

interface H10PromotionGate {
  readonly requested_status?: H10PromotionStatus;
  readonly status_reason?: string;
  readonly authority_ref?: string;
  readonly authority_sha256?: string;
  readonly cannot_claim_until_met?: readonly string[];
}

interface H10UpskillClaims {
  readonly stable_agents?: boolean;
  readonly globally_qualified_agents?: boolean;
  readonly independently_qualified_agents?: boolean;
  readonly independent_quality_auditor_qualified?: boolean;
  readonly model_weights_updated?: boolean;
  readonly all_future_mistakes_prevented?: boolean;
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
const ALLOWED_PROMOTION_STATUSES = new Set<H10PromotionStatus>([
  "fixture_tested",
  "qualified_for_bounded_use",
  "advisory_only",
  "blocked",
  "suspended",
  "deprecated"
]);
const FORBIDDEN_PROMOTION_STATUSES = new Set<H10PromotionStatus>([
  "stable",
  "globally_qualified",
  "independently_qualified"
]);
const REQUIRED_CANNOT_CLAIM = ["stable_agents", "model_weights_updated", "independent_quality_auditor_qualified"];

export function verifyH10UpskillProposalConfig(config: H10UpskillProposalConfig): H10UpskillProposalReport {
  const findings: H10UpskillProposalFinding[] = [];
  const verifiedRefs: H10VerifiedUpskillProposalRef[] = [];
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
    upskill_summary: {
      verified_ref_count: verifiedRefs.length,
      proposal_count: scenarioResults.filter((result) => result.status === "passed").length,
      decision_upskill_count: scenarioResults.filter(
        (result) => result.status === "passed" && result.upskillType === "decision"
      ).length,
      bounded_promotion_count: scenarioResults.filter(
        (result) =>
          result.status === "passed" &&
          result.requestedStatus !== null &&
          ALLOWED_PROMOTION_STATUSES.has(result.requestedStatus)
      ).length,
      calibrated_negative_finding_count: Math.max(0, findings.length - blockingFindingCount),
      blocking_finding_count: blockingFindingCount
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H10UpskillProposalConfig,
  expectation: H10UpskillProposalScenarioExpectation,
  findings: H10UpskillProposalFinding[],
  verifiedRefs: H10VerifiedUpskillProposalRef[]
): H10UpskillProposalScenarioResult {
  const localFindings: H10UpskillProposalFinding[] = [];
  const hashFinding = validateSha256(expectation.recordSha256, "record_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.recordRef });

  const recordPath = resolveLogicalRef(expectation.recordRef, config.logicalRoots, localFindings);
  let record: H10UpskillProposalRecord | null = null;
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
      verifiedRefs.push({ ref: expectation.recordRef, path: recordPath, sha256: actualHash, source: "h10_upskill_proposals" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.recordRef });
    }
    try {
      record = JSON.parse(text) as H10UpskillProposalRecord;
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

  const status: H10UpskillProposalStatus = localFindings.length === 0 ? "passed" : "failed";
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
    upskillType: record?.upskill_type ?? null,
    requestedStatus: record?.promotion_gate?.requested_status ?? null,
    durableEffectType: record?.durable_effect?.effect_type ?? null
  };
}

function verifyRecord(scenarioId: string, record: H10UpskillProposalRecord): H10UpskillProposalFinding[] {
  const findings: H10UpskillProposalFinding[] = [];
  if (record.schema_version !== "hadaf_h10_upskill_proposal_v1") {
    findings.push({
      kind: "schema_version_invalid",
      scenarioId,
      expected: "hadaf_h10_upskill_proposal_v1",
      actual: record.schema_version ?? "missing"
    });
  }
  if (!record.proposal_id || PLACEHOLDER_PATTERN.test(record.proposal_id)) findings.push({ kind: "proposal_id_invalid", scenarioId });
  if (!record.agent_id || PLACEHOLDER_PATTERN.test(record.agent_id)) findings.push({ kind: "agent_id_invalid", scenarioId });
  if (!record.agent_version || PLACEHOLDER_PATTERN.test(record.agent_version)) findings.push({ kind: "agent_version_invalid", scenarioId });
  if (!record.upskill_type) findings.push({ kind: "upskill_type_missing", scenarioId });
  findings.push(...verifyTrigger(scenarioId, record.trigger));
  if (!record.old_behavior) findings.push({ kind: "old_behavior_missing", scenarioId });
  if (!record.proposed_behavior) findings.push({ kind: "proposed_behavior_missing", scenarioId });
  findings.push(...verifyDurableEffect(scenarioId, record.durable_effect));
  if (record.upskill_type === "decision") findings.push(...verifyDecisionUpskill(scenarioId, record.decision_upskill));
  findings.push(...verifyNonDegradation(scenarioId, record.non_degradation));
  findings.push(...verifyAuthorityChange(scenarioId, record.authority_change));
  findings.push(...verifyPromotionGate(scenarioId, record.promotion_gate));
  findings.push(...verifyClaims(scenarioId, record.claims));
  for (const requiredCannotClaim of REQUIRED_CANNOT_CLAIM) {
    if (!record.cannot_claim?.includes(requiredCannotClaim)) {
      findings.push({ kind: "required_cannot_claim_missing", scenarioId, expected: requiredCannotClaim });
    }
  }
  return findings;
}

function verifyTrigger(scenarioId: string, trigger: H10UpskillTrigger | undefined): H10UpskillProposalFinding[] {
  const findings: H10UpskillProposalFinding[] = [];
  if (!trigger) return [{ kind: "trigger_missing", scenarioId }];
  if (!trigger.ref || PLACEHOLDER_PATTERN.test(trigger.ref)) findings.push({ kind: "trigger_ref_missing", scenarioId });
  const triggerHashFinding = validateSha256(trigger.sha256, "trigger_hash_invalid");
  if (triggerHashFinding) findings.push({ ...triggerHashFinding, scenarioId });
  const productShaFinding = validateGitSha(trigger.product_sha, "trigger_product_sha_invalid");
  if (productShaFinding) findings.push({ ...productShaFinding, scenarioId });
  return findings;
}

function verifyDurableEffect(
  scenarioId: string,
  durableEffect: H10DurableUpskillEffect | undefined
): H10UpskillProposalFinding[] {
  const findings: H10UpskillProposalFinding[] = [];
  if (!durableEffect) return [{ kind: "durable_effect_missing", scenarioId }];
  if (!durableEffect.effect_type) findings.push({ kind: "durable_effect_type_missing", scenarioId });
  if (!durableEffect.ref || PLACEHOLDER_PATTERN.test(durableEffect.ref)) findings.push({ kind: "durable_effect_ref_missing", scenarioId });
  const effectHashFinding = validateSha256(durableEffect.sha256, "durable_effect_hash_invalid");
  if (effectHashFinding) findings.push({ ...effectHashFinding, scenarioId });
  return findings;
}

function verifyDecisionUpskill(
  scenarioId: string,
  upskill: H10DecisionUpskill | undefined
): H10UpskillProposalFinding[] {
  const findings: H10UpskillProposalFinding[] = [];
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

function verifyNonDegradation(
  scenarioId: string,
  nonDegradation: H10NonDegradation | undefined
): H10UpskillProposalFinding[] {
  const findings: H10UpskillProposalFinding[] = [];
  if (!nonDegradation) return [{ kind: "non_degradation_missing", scenarioId }];
  if (!nonDegradation.ref || PLACEHOLDER_PATTERN.test(nonDegradation.ref)) findings.push({ kind: "non_degradation_ref_missing", scenarioId });
  const hashFinding = validateSha256(nonDegradation.sha256, "non_degradation_hash_invalid");
  if (hashFinding) findings.push({ ...hashFinding, scenarioId });
  return findings;
}

function verifyAuthorityChange(
  scenarioId: string,
  authorityChange: H10AuthorityChange | undefined
): H10UpskillProposalFinding[] {
  const findings: H10UpskillProposalFinding[] = [];
  if (authorityChange?.changes_governing_authority === true) {
    if (!authorityChange.ratified_authority_ref || PLACEHOLDER_PATTERN.test(authorityChange.ratified_authority_ref)) {
      findings.push({ kind: "silent_authority_change", scenarioId });
    }
    const authorityHashFinding = validateSha256(authorityChange.ratified_authority_sha256, "authority_change_hash_invalid");
    if (authorityHashFinding) findings.push({ ...authorityHashFinding, scenarioId });
  }
  return findings;
}

function verifyPromotionGate(scenarioId: string, promotionGate: H10PromotionGate | undefined): H10UpskillProposalFinding[] {
  const findings: H10UpskillProposalFinding[] = [];
  if (!promotionGate?.requested_status) return [{ kind: "promotion_status_missing", scenarioId }];
  if (FORBIDDEN_PROMOTION_STATUSES.has(promotionGate.requested_status)) {
    findings.push({ kind: "forbidden_promotion_status", scenarioId, actual: promotionGate.requested_status });
  } else if (!ALLOWED_PROMOTION_STATUSES.has(promotionGate.requested_status)) {
    findings.push({ kind: "promotion_status_unknown", scenarioId, actual: promotionGate.requested_status });
  }
  if (!promotionGate.status_reason) findings.push({ kind: "promotion_status_reason_missing", scenarioId });
  if (promotionGate.requested_status === "qualified_for_bounded_use") {
    if (!promotionGate.authority_ref) findings.push({ kind: "promotion_authority_ref_missing", scenarioId });
    const authorityHashFinding = validateSha256(promotionGate.authority_sha256, "promotion_authority_hash_invalid");
    if (authorityHashFinding) findings.push({ ...authorityHashFinding, scenarioId });
  }
  if (!promotionGate.cannot_claim_until_met?.length) findings.push({ kind: "promotion_cannot_claim_missing", scenarioId });
  return findings;
}

function verifyClaims(scenarioId: string, claims: H10UpskillClaims | undefined): H10UpskillProposalFinding[] {
  const findings: H10UpskillProposalFinding[] = [];
  if (claims?.stable_agents === true) findings.push({ kind: "stable_agents_overclaim", scenarioId });
  if (claims?.globally_qualified_agents === true) findings.push({ kind: "globally_qualified_agents_overclaim", scenarioId });
  if (claims?.independently_qualified_agents === true) findings.push({ kind: "independently_qualified_agents_overclaim", scenarioId });
  if (claims?.independent_quality_auditor_qualified === true) {
    findings.push({ kind: "independent_quality_auditor_overclaim", scenarioId });
  }
  if (claims?.model_weights_updated === true) findings.push({ kind: "model_weight_update_overclaim", scenarioId });
  if (claims?.all_future_mistakes_prevented === true) findings.push({ kind: "all_future_mistakes_prevented_overclaim", scenarioId });
  return findings;
}

function compareExpectedRecord(
  expectation: H10UpskillProposalScenarioExpectation,
  record: H10UpskillProposalRecord,
  localFindings: H10UpskillProposalFinding[],
  findings: H10UpskillProposalFinding[]
): void {
  const expected = expectation.expected;
  if (!expected) return;
  const comparisons: Array<[string, string | undefined | null, string | undefined | null]> = [
    ["upskillType", expected.upskillType, record.upskill_type],
    ["requestedStatus", expected.requestedStatus, record.promotion_gate?.requested_status],
    ["durableEffectType", expected.durableEffectType, record.durable_effect?.effect_type]
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

function validateSha256(value: string | undefined, kind: string): H10UpskillProposalFinding | null {
  if (!value || !SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) return { kind, actual: value ?? "missing" };
  return null;
}

function validateGitSha(value: string | undefined, kind: string): H10UpskillProposalFinding | null {
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
  findings: H10UpskillProposalFinding[]
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
