import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H05UpskillRecordStatus = "passed" | "failed";
export type H05ExpectedUpskillRecordStatus = "passed" | "failed";

export interface H05UpskillRecordsConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H05UpskillRecordSchemaDescriptor;
  readonly schemaRefs?: readonly H05UpskillRecordSchemaDescriptor[];
  readonly records: readonly H05UpskillRecordExpectation[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H05UpskillRecordSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H05UpskillRecordExpectation {
  readonly recordId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H05ExpectedUpskillRecordStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H05UpskillRecordsReport {
  readonly status: H05UpskillRecordStatus;
  readonly findings: readonly H05UpskillRecordFinding[];
  readonly classified_mismatches: readonly H05UpskillRecordFinding[];
  readonly verified_refs: readonly H05VerifiedUpskillRef[];
  readonly hash_failures: readonly H05UpskillRecordFinding[];
  readonly record_results: readonly H05UpskillRecordValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H05UpskillRecordValidationResult {
  readonly recordId: string;
  readonly ref: string;
  readonly status: H05ExpectedUpskillRecordStatus;
  readonly expectedStatus: H05ExpectedUpskillRecordStatus;
  readonly learningDimensions: readonly H05LearningDimension[];
  readonly findingKinds: readonly string[];
}

export interface H05VerifiedUpskillRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "schema_ref" | "record" | "linked_ref";
}

export interface H05UpskillRecordFinding {
  readonly kind: string;
  readonly recordId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H05UpskillRecord {
  readonly schema_version: string;
  readonly upskill_id: string;
  readonly triggering_event_ref: H05RefHash;
  readonly learning_dimensions: readonly H05LearningDimension[];
  readonly mistake_or_no_change_reason: string;
  readonly durable_change_refs: readonly H05RefHash[];
  readonly regression_fixture_refs: readonly H05RefHash[];
  readonly effective_from: string;
  readonly non_degradation_result: "passed" | "failed" | "not_applicable_with_reason";
  readonly cannot_claim: readonly string[];
}

interface H05RefHash {
  readonly ref: string;
  readonly sha256: string;
}

type H05LearningDimension =
  | "coding"
  | "planning"
  | "evidence"
  | "security"
  | "doctrine"
  | "decision"
  | "claim_escalation"
  | "audit_assumption";

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const STALE_SHA256_VALUES = new Set([
  "0000000000000000000000000000000000000000000000000000000000000000",
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
]);
const STABLE_AGENT_PATTERN = /\bstable(?:[_\s-]+agent|[_\s-]+agents)?\b/iu;
const MECHANICAL_INDEPENDENCE_PATTERN =
  /\b(?:mechanically[_\s-]+independent|independent[_\s-]+quality[_\s-]+auditor|independent[_\s-]+process)(?:\b|[_\s-])/iu;
const SELF_HOSTING_OR_RELEASE_PATTERN =
  /\b(?:self[_\s-]+hosting[_\s-]+ready|release[_\s-]+candidate|production[_\s-]+ready)\b/iu;
const FUTURE_SCOPE_PATTERN =
  /\b(?:H06[_\s-]+started|H07[_\s-]+proof[_\s-]+engine[_\s-]+implemented|runtime[_\s-]+upskill[_\s-]+enforcement)\b/iu;
const SILENT_AUTHORITY_CHANGE_PATTERN =
  /\b(?:silent(?:ly)?[_\s-]+(?:change|changes|changing)[_\s-]+authority|authority[_\s-]+override|overrides?[_\s-]+control[_\s-]+authority|changes?[_\s-]+governing[_\s-]+authority[_\s-]+without[_\s-]+human)\b/iu;

const DECISION_MARKERS = [
  ["decision_context:", "decision_upskill_missing_context"],
  ["rejected_alternatives:", "decision_upskill_missing_rejected_alternatives"],
  ["decision_failure:", "decision_upskill_missing_decision_failure"],
  ["corrected_rule:", "decision_upskill_missing_corrected_rule"],
  ["regression_checklist:", "decision_upskill_missing_regression_checklist"]
] as const;

export function verifyH05UpskillRecordsConfig(
  config: H05UpskillRecordsConfig
): H05UpskillRecordsReport {
  const findings: H05UpskillRecordFinding[] = [];
  const classifiedMismatches: H05UpskillRecordFinding[] = [];
  const verifiedRefs: H05VerifiedUpskillRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const recordResults: H05UpskillRecordValidationResult[] = [];

  for (const recordExpectation of config.records) {
    recordResults.push(
      verifyRecordExpectation(
        config,
        recordExpectation,
        schemaValidator,
        findings,
        classifiedMismatches,
        verifiedRefs
      )
    );
  }

  const hashFailures = [...findings, ...classifiedMismatches].filter(
    (finding) =>
      finding.kind.includes("hash") ||
      finding.kind.includes("sha") ||
      finding.kind.includes("placeholder")
  );

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: classifiedMismatches,
    verified_refs: verifiedRefs,
    hash_failures: hashFailures,
    record_results: recordResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H05UpskillRecordsConfig,
  findings: H05UpskillRecordFinding[],
  verifiedRefs: H05VerifiedUpskillRef[]
): ValidateFunction<unknown> | null {
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  for (const schemaRef of config.schemaRefs ?? []) {
    const parsedRefSchema = loadSchema(config, schemaRef, "schema_ref", findings, verifiedRefs);
    if (!parsedRefSchema) return null;
    try {
      ajv.addSchema(parsedRefSchema as AnySchema);
    } catch (error) {
      findings.push({
        kind: "schema_ref_compile_failed",
        ref: schemaRef.ref,
        detail: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  const parsedSchema = loadSchema(config, config.schema, "schema", findings, verifiedRefs);
  if (!parsedSchema) return null;

  try {
    return ajv.compile(parsedSchema as AnySchema);
  } catch (error) {
    findings.push({
      kind: "schema_compile_failed",
      ref: config.schema.ref,
      detail: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function loadSchema(
  config: H05UpskillRecordsConfig,
  schema: H05UpskillRecordSchemaDescriptor,
  source: "schema" | "schema_ref",
  findings: H05UpskillRecordFinding[],
  verifiedRefs: H05VerifiedUpskillRef[]
): unknown | null {
  const hashFinding = validateSha256(schema.sha256, `${source}_hash_invalid`);
  if (hashFinding) {
    findings.push({ ...hashFinding, ref: schema.ref });
    return null;
  }

  const schemaPath = resolveLogicalRef(schema.ref, config.logicalRoots, findings);
  if (!schemaPath) return null;
  if (!existsSync(schemaPath)) {
    findings.push({ kind: `${source}_missing`, ref: schema.ref, path: schemaPath });
    return null;
  }

  const schemaText = readFileSync(schemaPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(schemaText)) {
    findings.push({ kind: `private_path_in_${source}`, ref: schema.ref, path: schemaPath });
    return null;
  }

  const actualHash = sha256Text(schemaText);
  const expectedHash = normalizeSha256(schema.sha256);
  if (actualHash !== expectedHash) {
    findings.push({
      kind: `${source}_hash_mismatch`,
      ref: schema.ref,
      path: schemaPath,
      expected: expectedHash,
      actual: actualHash
    });
    return null;
  }

  verifiedRefs.push({ ref: schema.ref, path: schemaPath, sha256: actualHash, source });
  return parseJson(schemaText, schema.ref, findings);
}

function verifyRecordExpectation(
  config: H05UpskillRecordsConfig,
  expectation: H05UpskillRecordExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H05UpskillRecordFinding[],
  classifiedMismatches: H05UpskillRecordFinding[],
  verifiedRefs: H05VerifiedUpskillRef[]
): H05UpskillRecordValidationResult {
  const recordFindings: H05UpskillRecordFinding[] = [];
  const recordPath = resolveLogicalRef(expectation.ref, config.logicalRoots, recordFindings);
  if (!recordPath || !existsSync(recordPath)) {
    const finding: H05UpskillRecordFinding = {
      kind: "upskill_record_missing",
      recordId: expectation.recordId,
      ref: expectation.ref
    };
    recordFindings.push(recordPath ? { ...finding, path: recordPath } : finding);
    return finishRecordResult(expectation, [], recordFindings, findings, classifiedMismatches);
  }

  const hashFinding = validateSha256(expectation.sha256, "upskill_record_hash_invalid");
  if (hashFinding) {
    recordFindings.push({ ...hashFinding, recordId: expectation.recordId, ref: expectation.ref });
  }

  const recordText = readFileSync(recordPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(recordText)) {
    recordFindings.push({
      kind: "private_path_in_upskill_record",
      recordId: expectation.recordId,
      ref: expectation.ref,
      path: recordPath
    });
  }

  const actualHash = sha256Text(recordText);
  const expectedHash = normalizeSha256(expectation.sha256);
  if (!hashFinding && actualHash !== expectedHash) {
    recordFindings.push({
      kind: "upskill_record_hash_mismatch",
      recordId: expectation.recordId,
      ref: expectation.ref,
      path: recordPath,
      expected: expectedHash,
      actual: actualHash
    });
  }

  verifiedRefs.push({
    ref: expectation.ref,
    path: recordPath,
    sha256: actualHash,
    source: "record"
  });

  const parsed = parseJson(recordText, expectation.ref, recordFindings);
  const record = parseUpskillRecord(expectation, parsed, recordFindings);
  if (!record) {
    return finishRecordResult(expectation, [], recordFindings, findings, classifiedMismatches);
  }

  validateRecordWithSchema(expectation, record, schemaValidator, recordFindings);
  verifyRecordSemantics(config, expectation, record, recordFindings, verifiedRefs);

  return finishRecordResult(
    expectation,
    record.learning_dimensions ?? [],
    recordFindings,
    findings,
    classifiedMismatches
  );
}

function parseUpskillRecord(
  expectation: H05UpskillRecordExpectation,
  parsed: unknown,
  recordFindings: H05UpskillRecordFinding[]
): H05UpskillRecord | null {
  if (!isRecord(parsed)) {
    recordFindings.push({
      kind: "upskill_record_not_object",
      recordId: expectation.recordId,
      ref: expectation.ref
    });
    return null;
  }

  const recordId = parsed.upskill_id;
  if (recordId !== expectation.recordId) {
    recordFindings.push({
      kind: "upskill_id_mismatch",
      recordId: expectation.recordId,
      ref: expectation.ref,
      expected: expectation.recordId,
      actual: typeof recordId === "string" ? recordId : "missing_or_invalid"
    });
  }

  return parsed as unknown as H05UpskillRecord;
}

function validateRecordWithSchema(
  expectation: H05UpskillRecordExpectation,
  record: H05UpskillRecord,
  schemaValidator: ValidateFunction<unknown> | null,
  recordFindings: H05UpskillRecordFinding[]
): void {
  if (!schemaValidator) {
    recordFindings.push({ kind: "schema_validator_unavailable", recordId: expectation.recordId });
    return;
  }

  if (!schemaValidator(record)) {
    for (const issue of schemaValidator.errors ?? []) {
      const finding: H05UpskillRecordFinding = {
        kind: schemaIssueKind(issue),
        recordId: expectation.recordId
      };
      recordFindings.push(issue.message ? { ...finding, detail: issue.message } : finding);
    }
  }
}

function verifyRecordSemantics(
  config: H05UpskillRecordsConfig,
  expectation: H05UpskillRecordExpectation,
  record: H05UpskillRecord,
  recordFindings: H05UpskillRecordFinding[],
  verifiedRefs: H05VerifiedUpskillRef[]
): void {
  validateRefHash("triggering_event_ref", config, expectation, record.triggering_event_ref, recordFindings, verifiedRefs);
  validateRefHashes("durable_change_ref", config, expectation, record.durable_change_refs ?? [], recordFindings, verifiedRefs);
  validateRefHashes("regression_fixture_ref", config, expectation, record.regression_fixture_refs ?? [], recordFindings, verifiedRefs);
  validateEffectiveFrom(expectation, record, recordFindings);
  validateDurableEffect(expectation, record, recordFindings);
  validateDecisionUpskill(expectation, record, recordFindings);
  validateCannotClaim(config, expectation, record, recordFindings);
  validateOverclaims(expectation, record, recordFindings);
}

function validateRefHashes(
  collectionKind: string,
  config: H05UpskillRecordsConfig,
  expectation: H05UpskillRecordExpectation,
  refs: readonly H05RefHash[],
  recordFindings: H05UpskillRecordFinding[],
  verifiedRefs: H05VerifiedUpskillRef[]
): void {
  const hashesByRef = new Map<string, string>();
  for (const refHash of refs) {
    validateRefHash(collectionKind, config, expectation, refHash, recordFindings, verifiedRefs);
    const normalizedHash = normalizeSha256(refHash.sha256);
    const priorHash = hashesByRef.get(refHash.ref);
    if (priorHash && priorHash !== normalizedHash) {
      recordFindings.push({
        kind: `${collectionKind}_duplicate_ref_conflicting_hash`,
        recordId: expectation.recordId,
        ref: refHash.ref,
        expected: priorHash,
        actual: normalizedHash
      });
    }
    hashesByRef.set(refHash.ref, normalizedHash);
  }
}

function validateRefHash(
  collectionKind: string,
  config: H05UpskillRecordsConfig,
  expectation: H05UpskillRecordExpectation,
  refHash: H05RefHash | undefined,
  recordFindings: H05UpskillRecordFinding[],
  verifiedRefs: H05VerifiedUpskillRef[]
): void {
  if (!refHash || typeof refHash.ref !== "string" || typeof refHash.sha256 !== "string") {
    recordFindings.push({ kind: `${collectionKind}_missing_or_invalid`, recordId: expectation.recordId });
    return;
  }

  const hashFinding = validateSha256(refHash.sha256, `${collectionKind}_sha256_invalid`);
  if (hashFinding) {
    recordFindings.push({
      ...hashFinding,
      recordId: expectation.recordId,
      ref: refHash.ref
    });
    return;
  }

  const normalizedHash = normalizeSha256(refHash.sha256);
  if (STALE_SHA256_VALUES.has(normalizedHash)) {
    recordFindings.push({
      kind: `${collectionKind}_stale_sha256`,
      recordId: expectation.recordId,
      ref: refHash.ref,
      actual: normalizedHash
    });
  }

  const resolvedPath = resolveLogicalRef(refHash.ref, config.logicalRoots, []);
  if (!resolvedPath || !existsSync(resolvedPath)) return;

  const linkedText = readFileSync(resolvedPath, "utf8");
  const linkedHash = sha256Text(linkedText);
  if (linkedHash !== normalizedHash) {
    recordFindings.push({
      kind: `${collectionKind}_hash_mismatch`,
      recordId: expectation.recordId,
      ref: refHash.ref,
      path: resolvedPath,
      expected: normalizedHash,
      actual: linkedHash
    });
    return;
  }

  verifiedRefs.push({
    ref: refHash.ref,
    path: resolvedPath,
    sha256: linkedHash,
    source: "linked_ref"
  });
}

function validateEffectiveFrom(
  expectation: H05UpskillRecordExpectation,
  record: H05UpskillRecord,
  recordFindings: H05UpskillRecordFinding[]
): void {
  if (typeof record.effective_from !== "string" || record.effective_from.length === 0) {
    recordFindings.push({ kind: "effective_from_missing", recordId: expectation.recordId });
    return;
  }
  if (record.effective_from.startsWith("/") || PRIVATE_PATH_PATTERN.test(record.effective_from)) {
    recordFindings.push({
      kind: "private_path_in_effective_from",
      recordId: expectation.recordId,
      ref: record.effective_from
    });
  }
}

function validateDurableEffect(
  expectation: H05UpskillRecordExpectation,
  record: H05UpskillRecord,
  recordFindings: H05UpskillRecordFinding[]
): void {
  const hasDurableEffect =
    (record.durable_change_refs ?? []).length > 0 || (record.regression_fixture_refs ?? []).length > 0;
  if (hasDurableEffect) return;

  const reason = record.mistake_or_no_change_reason ?? "";
  const hasNoChangeJustification =
    record.non_degradation_result === "not_applicable_with_reason" &&
    /\bno[_\s-]+change[_\s-]+required\b/iu.test(reason) &&
    /\b(?:existing[_\s-]+guard|already[_\s-]+covered|non[_\s-]+degradation)\b/iu.test(reason);

  if (!hasNoChangeJustification) {
    recordFindings.push({
      kind: "lesson_without_durable_effect",
      recordId: expectation.recordId
    });
  }
}

function validateDecisionUpskill(
  expectation: H05UpskillRecordExpectation,
  record: H05UpskillRecord,
  recordFindings: H05UpskillRecordFinding[]
): void {
  if (!(record.learning_dimensions ?? []).includes("decision")) return;

  const reason = (record.mistake_or_no_change_reason ?? "").toLowerCase();
  for (const [marker, findingKind] of DECISION_MARKERS) {
    if (!reason.includes(marker)) {
      recordFindings.push({ kind: findingKind, recordId: expectation.recordId });
    }
  }

  if (!reason.includes("future_stop_condition:") && !reason.includes("future_ask_condition:")) {
    recordFindings.push({
      kind: "decision_upskill_missing_future_stop_or_ask_condition",
      recordId: expectation.recordId
    });
  }

  if ((record.cannot_claim ?? []).length === 0) {
    recordFindings.push({
      kind: "decision_upskill_missing_cannot_claim",
      recordId: expectation.recordId
    });
  }
}

function validateCannotClaim(
  config: H05UpskillRecordsConfig,
  expectation: H05UpskillRecordExpectation,
  record: H05UpskillRecord,
  recordFindings: H05UpskillRecordFinding[]
): void {
  const claims = new Set(record.cannot_claim ?? []);
  for (const requiredClaim of config.requiredCannotClaim ?? []) {
    if (!claims.has(requiredClaim)) {
      recordFindings.push({
        kind: "cannot_claim_missing_required",
        recordId: expectation.recordId,
        expected: requiredClaim
      });
    }
  }

  if ((record.cannot_claim ?? []).some((claim) => PLACEHOLDER_PATTERN.test(claim))) {
    recordFindings.push({ kind: "cannot_claim_placeholder", recordId: expectation.recordId });
  }
}

function validateOverclaims(
  expectation: H05UpskillRecordExpectation,
  record: H05UpskillRecord,
  recordFindings: H05UpskillRecordFinding[]
): void {
  const claimText = [
    record.mistake_or_no_change_reason,
    record.effective_from,
    ...(record.durable_change_refs ?? []).map((refHash) => refHash.ref),
    ...(record.regression_fixture_refs ?? []).map((refHash) => refHash.ref)
  ].join(" ");

  if (STABLE_AGENT_PATTERN.test(claimText)) {
    recordFindings.push({ kind: "stable_agent_overclaim", recordId: expectation.recordId });
  }
  if (MECHANICAL_INDEPENDENCE_PATTERN.test(claimText)) {
    recordFindings.push({ kind: "mechanical_independence_overclaim", recordId: expectation.recordId });
  }
  if (SELF_HOSTING_OR_RELEASE_PATTERN.test(claimText)) {
    recordFindings.push({ kind: "self_hosting_release_or_production_overclaim", recordId: expectation.recordId });
  }
  if (FUTURE_SCOPE_PATTERN.test(claimText)) {
    recordFindings.push({ kind: "future_scope_overclaim", recordId: expectation.recordId });
  }
  if (SILENT_AUTHORITY_CHANGE_PATTERN.test(claimText)) {
    recordFindings.push({ kind: "silent_authority_change_forbidden", recordId: expectation.recordId });
  }
}

function finishRecordResult(
  expectation: H05UpskillRecordExpectation,
  learningDimensions: readonly H05LearningDimension[],
  recordFindings: H05UpskillRecordFinding[],
  findings: H05UpskillRecordFinding[],
  classifiedMismatches: H05UpskillRecordFinding[]
): H05UpskillRecordValidationResult {
  const actualStatus: H05ExpectedUpskillRecordStatus =
    recordFindings.length === 0 ? "passed" : "failed";
  const findingKinds = recordFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "upskill_record_status_unexpected",
      recordId: expectation.recordId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedFinding of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedFinding)) {
      findings.push({
        kind: "expected_negative_finding_missing",
        recordId: expectation.recordId,
        ref: expectation.ref,
        expected: expectedFinding,
        actual: findingKinds.join(",")
      });
    }
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...recordFindings);
  } else {
    findings.push(...recordFindings);
  }

  return {
    recordId: expectation.recordId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    learningDimensions,
    findingKinds
  };
}

function schemaIssueKind(issue: ErrorObject): string {
  if (issue.keyword === "required") return "json_schema_required";
  if (issue.keyword === "additionalProperties") return "json_schema_additional_property";
  if (issue.keyword === "enum" || issue.keyword === "const") return "json_schema_enum";
  if (issue.keyword === "pattern") return "json_schema_pattern";
  return `json_schema_${issue.keyword}`;
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H05UpskillRecordFinding[]
): string | null {
  const prefix = Object.keys(logicalRoots)
    .sort((first, second) => second.length - first.length)
    .find((candidate) => ref === candidate || ref.startsWith(rootPrefixWithSeparator(candidate)));
  if (!prefix) {
    findings.push({ kind: "logical_root_missing", ref });
    return null;
  }

  const logicalRoot = logicalRoots[prefix];
  if (!logicalRoot) {
    findings.push({ kind: "logical_root_missing", ref });
    return null;
  }

  const root = resolve(logicalRoot);
  const suffix = ref.slice(prefix.length).replace(/^\/+/u, "");
  const target = resolve(root, suffix);
  if (!isInside(root, target)) {
    findings.push({ kind: "logical_path_escape", ref, path: target });
    return null;
  }
  return target;
}

function rootPrefixWithSeparator(root: string): string {
  return root.endsWith("/") ? root : `${root}/`;
}

function isInside(root: string, target: string): boolean {
  const normalizedRoot = normalize(root);
  const normalizedTarget = normalize(target);
  const rel = relative(normalizedRoot, normalizedTarget);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function parseJson(
  text: string,
  ref: string,
  findings: H05UpskillRecordFinding[]
): unknown | null {
  try {
    return JSON.parse(text);
  } catch (error) {
    findings.push({
      kind: "json_parse_failed",
      ref,
      detail: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function validateSha256(sha256: string, kind: string): H05UpskillRecordFinding | null {
  if (!SHA256_PATTERN.test(sha256) || PLACEHOLDER_PATTERN.test(sha256)) {
    return { kind, actual: sha256 };
  }
  return null;
}

function normalizeSha256(sha256: string): string {
  return sha256.replace(/^sha256:/u, "");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
