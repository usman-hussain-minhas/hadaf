import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";

import {
  normalizeH03PlanConfig,
  type H03NormalizedPlan,
  type H03NormalizedPlanSection,
  type H03PlanNormalizationConfig,
  type H03PlanSectionId
} from "./plan-normalization.js";

export type H03QuestionRegisterStatus = "passed" | "failed";
export type H03QuestionScopeClass = "broad_systemic" | "narrow_local";
export type H03QuestionRiskClass = "critical" | "high" | "medium" | "low";
export type H03QuestionStatus =
  | "open"
  | "awaiting_human"
  | "default_authorized"
  | "answered"
  | "ratified"
  | "pending_run_completion"
  | "correction_required"
  | "superseded";
export type H03DecisionDeadlineKind =
  | "before_affected_execution"
  | "before_box_acceptance"
  | "before_release"
  | "absolute_time";

export interface H03QuestionRegisterConfig {
  readonly logicalRoots: Record<string, string>;
  readonly questionRegisterSchema: H03QuestionRegisterSchemaRef;
  readonly planNormalization: H03PlanNormalizationConfig;
  readonly expectedNormalizedPlanHash: string;
  readonly questionCandidates: readonly H03QuestionCandidate[];
  readonly authorityConflicts?: readonly H03AuthorityConflict[];
  readonly expectedQuestionRegisterHash?: string;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H03QuestionRegisterSchemaRef {
  readonly ref: string;
  readonly sha256: string;
  readonly schemaVersion: "1.1.0";
}

export interface H03QuestionCandidate {
  readonly candidateId: string;
  readonly category: string;
  readonly question: string;
  readonly context?: Record<string, unknown>;
  readonly sourceSectionId: H03PlanSectionId;
  readonly affectedBoxes?: readonly string[];
  readonly affectedFfets?: readonly string[];
  readonly scopeClass: H03QuestionScopeClass;
  readonly riskClass: H03QuestionRiskClass;
  readonly options?: readonly string[];
  readonly recommendedDefault?: string | null;
  readonly safeDefaultAuthority?: string | null;
  readonly decisionDeadline: H03DecisionDeadline;
  readonly humanAnswer?: unknown;
  readonly authorityRecord?: string | null;
  readonly ratifiedAt?: string | null;
  readonly status: H03QuestionStatus;
  readonly correctionFfetRequired?: boolean;
  readonly cannotClaim: readonly string[];
}

export interface H03AuthorityConflict {
  readonly conflictId: string;
  readonly category: string;
  readonly question: string;
  readonly claims: readonly H03AuthorityConflictClaim[];
  readonly sourceSectionIds: readonly H03PlanSectionId[];
  readonly affectedBoxes?: readonly string[];
  readonly affectedFfets?: readonly string[];
  readonly riskClass?: H03QuestionRiskClass;
  readonly decisionDeadline?: H03DecisionDeadline;
  readonly humanAnswer?: unknown;
  readonly authorityRecord?: string | null;
  readonly ratifiedAt?: string | null;
  readonly status?: H03QuestionStatus;
  readonly cannotClaim?: readonly string[];
}

export interface H03AuthorityConflictClaim {
  readonly sourceReference: string;
  readonly summary: string;
}

export interface H03DecisionDeadline {
  readonly kind: H03DecisionDeadlineKind;
  readonly at: string | null;
  readonly basis: string;
}

export interface H03QuestionRegisterReport {
  readonly status: H03QuestionRegisterStatus;
  readonly findings: readonly H03QuestionRegisterFinding[];
  readonly classified_mismatches: readonly H03QuestionRegisterFinding[];
  readonly normalized_plan_hash: string | null;
  readonly question_register_hash: string | null;
  readonly zero_broad_ambiguity: boolean;
  readonly unresolved_broad_questions: readonly string[];
  readonly question_register: readonly H03QuestionRegisterRecord[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H03QuestionRegisterRecord {
  readonly schema_version: "1.1.0";
  readonly question_id: string;
  readonly category: string;
  readonly question: string;
  readonly context: Record<string, unknown>;
  readonly source_reference: string;
  readonly affected_boxes?: readonly string[];
  readonly affected_ffets?: readonly string[];
  readonly scope_class: H03QuestionScopeClass;
  readonly risk_class: H03QuestionRiskClass;
  readonly options?: readonly string[];
  readonly recommended_default?: string | null;
  readonly safe_default_authority?: string | null;
  readonly decision_deadline: H03DecisionDeadline;
  readonly human_answer?: unknown;
  readonly authority_record?: string | null;
  readonly ratified_at?: string | null;
  readonly status: H03QuestionStatus;
  readonly correction_ffet_required?: boolean;
  readonly cannot_claim: readonly string[];
}

export interface H03QuestionRegisterFinding {
  readonly kind: string;
  readonly candidateId?: string;
  readonly conflictId?: string;
  readonly questionId?: string;
  readonly ref?: string;
  readonly sectionId?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

type AddFormats = (ajv: Ajv2020) => void;
const addFormats = ((addFormatsModule as unknown as { readonly default?: AddFormats }).default ??
  (addFormatsModule as unknown as AddFormats));
const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const BROAD_RESOLVED_STATUSES = new Set<H03QuestionStatus>(["answered", "ratified"]);
const LOCAL_PROCEED_STATUSES = new Set<H03QuestionStatus>([
  "default_authorized",
  "answered",
  "ratified",
  "pending_run_completion",
  "superseded"
]);

export function compileH03QuestionRegisterConfig(
  config: H03QuestionRegisterConfig
): H03QuestionRegisterReport {
  const findings: H03QuestionRegisterFinding[] = [];
  const validator = loadQuestionRegisterValidator(config, findings);
  const planReport = normalizeH03PlanConfig(config.planNormalization);
  if (planReport.status !== "passed") {
    findings.push({
      kind: "plan_normalization_failed",
      detail: planReport.findings.map((finding) => finding.kind).join(",")
    });
  }

  verifyExpectedHash("expectedNormalizedPlanHash", config.expectedNormalizedPlanHash, findings);
  const normalizedPlanHash = planReport.normalized_plan_hash;
  if (normalizedPlanHash && normalizedPlanHash !== normalizeSha256(config.expectedNormalizedPlanHash)) {
    findings.push({
      kind: "normalized_plan_hash_mismatch",
      expected: normalizeSha256(config.expectedNormalizedPlanHash),
      actual: normalizedPlanHash
    });
  }

  const records = planReport.normalized_plan
    ? compileRecords(config, planReport.normalized_plan, validator, findings)
    : [];
  const sortedRecords = [...records].sort((left, right) =>
    left.question_id.localeCompare(right.question_id)
  );
  const duplicateIds = findDuplicateQuestionIds(sortedRecords);
  for (const questionId of duplicateIds) {
    findings.push({ kind: "duplicate_question_id", questionId });
  }

  const unresolvedBroadQuestions = sortedRecords
    .filter((record) =>
      record.scope_class === "broad_systemic" && !BROAD_RESOLVED_STATUSES.has(record.status)
    )
    .map((record) => record.question_id);
  for (const questionId of unresolvedBroadQuestions) {
    findings.push({ kind: "unresolved_broad_systemic_question", questionId });
  }

  const questionRegisterHash = findings.length === 0
    ? hashQuestionRegister(sortedRecords)
    : null;
  verifyExpectedQuestionRegisterHash(config, questionRegisterHash, findings);

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: findings.filter((finding) => finding.kind.endsWith("_mismatch")),
    normalized_plan_hash: normalizedPlanHash,
    question_register_hash: questionRegisterHash,
    zero_broad_ambiguity: unresolvedBroadQuestions.length === 0,
    unresolved_broad_questions: unresolvedBroadQuestions,
    question_register: sortedRecords,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

export function hashQuestionRegister(records: readonly H03QuestionRegisterRecord[]): string {
  return sha256Text(JSON.stringify(records));
}

function compileRecords(
  config: H03QuestionRegisterConfig,
  plan: H03NormalizedPlan,
  validator: ValidateFunction<unknown> | null,
  findings: H03QuestionRegisterFinding[]
): H03QuestionRegisterRecord[] {
  const sectionsById = new Map(plan.sections.map((section) => [section.section_id, section]));
  const records: H03QuestionRegisterRecord[] = [];
  const candidateIds = new Set<string>();

  for (const candidate of config.questionCandidates) {
    if (candidateIds.has(candidate.candidateId)) {
      findings.push({ kind: "duplicate_question_candidate", candidateId: candidate.candidateId });
      continue;
    }
    candidateIds.add(candidate.candidateId);
    const section = sectionsById.get(candidate.sourceSectionId);
    if (!section) {
      findings.push({
        kind: "unknown_question_source_section",
        candidateId: candidate.candidateId,
        sectionId: candidate.sourceSectionId
      });
      continue;
    }
    const record = questionCandidateToRecord(candidate, section);
    validateRecord(record, validator, findings, { candidateId: candidate.candidateId });
    validateQuestionSemantics(record, findings, { candidateId: candidate.candidateId });
    records.push(record);
  }

  for (const conflict of config.authorityConflicts ?? []) {
    const record = authorityConflictToRecord(conflict, sectionsById, findings);
    if (!record) continue;
    validateRecord(record, validator, findings, { conflictId: conflict.conflictId });
    validateQuestionSemantics(record, findings, { conflictId: conflict.conflictId });
    if (!BROAD_RESOLVED_STATUSES.has(record.status)) {
      findings.push({
        kind: "authority_conflict_unresolved",
        conflictId: conflict.conflictId,
        questionId: record.question_id
      });
    }
    records.push(record);
  }

  return records;
}

function questionCandidateToRecord(
  candidate: H03QuestionCandidate,
  section: H03NormalizedPlanSection
): H03QuestionRegisterRecord {
  const sourceReference = `${section.source_ref}#${section.section_id}`;
  const record: H03QuestionRegisterRecord = {
    schema_version: "1.1.0",
    question_id: questionIdFor("candidate", candidate.candidateId, sourceReference, candidate.question),
    category: candidate.category,
    question: candidate.question,
    context: {
      ...(candidate.context ?? {}),
      candidate_id: candidate.candidateId,
      source_section_id: candidate.sourceSectionId,
      source_sha256: section.source_sha256
    },
    source_reference: sourceReference,
    scope_class: candidate.scopeClass,
    risk_class: candidate.riskClass,
    decision_deadline: candidate.decisionDeadline,
    status: candidate.status,
    cannot_claim: [...candidate.cannotClaim]
  };
  return stripUndefined({
    ...record,
    affected_boxes: candidate.affectedBoxes ? [...candidate.affectedBoxes] : undefined,
    affected_ffets: candidate.affectedFfets ? [...candidate.affectedFfets] : undefined,
    options: candidate.options ? [...candidate.options] : undefined,
    recommended_default: candidate.recommendedDefault,
    safe_default_authority: candidate.safeDefaultAuthority,
    human_answer: candidate.humanAnswer,
    authority_record: candidate.authorityRecord,
    ratified_at: candidate.ratifiedAt,
    correction_ffet_required: candidate.correctionFfetRequired
  }) as unknown as H03QuestionRegisterRecord;
}

function authorityConflictToRecord(
  conflict: H03AuthorityConflict,
  sectionsById: ReadonlyMap<H03PlanSectionId, H03NormalizedPlanSection>,
  findings: H03QuestionRegisterFinding[]
): H03QuestionRegisterRecord | null {
  const sourceSections: H03NormalizedPlanSection[] = [];
  for (const sectionId of conflict.sourceSectionIds) {
    const section = sectionsById.get(sectionId);
    if (!section) {
      findings.push({
        kind: "unknown_conflict_source_section",
        conflictId: conflict.conflictId,
        sectionId
      });
      return null;
    }
    sourceSections.push(section);
  }
  const sourceReference = sourceSections
    .map((section) => `${section.source_ref}#${section.section_id}`)
    .join(",");
  const status = conflict.status ?? "awaiting_human";
  return stripUndefined({
    schema_version: "1.1.0",
    question_id: questionIdFor("conflict", conflict.conflictId, sourceReference, conflict.question),
    category: conflict.category,
    question: conflict.question,
    context: {
      conflict_id: conflict.conflictId,
      claims: conflict.claims.map((claim) => ({
        source_reference: claim.sourceReference,
        summary: claim.summary
      })),
      source_section_ids: [...conflict.sourceSectionIds]
    },
    source_reference: sourceReference,
    affected_boxes: conflict.affectedBoxes ? [...conflict.affectedBoxes] : undefined,
    affected_ffets: conflict.affectedFfets ? [...conflict.affectedFfets] : undefined,
    scope_class: "broad_systemic",
    risk_class: conflict.riskClass ?? "high",
    decision_deadline: conflict.decisionDeadline ?? {
      kind: "before_affected_execution",
      at: null,
      basis: "Authority conflicts must be resolved before affected execution."
    },
    human_answer: conflict.humanAnswer,
    authority_record: conflict.authorityRecord,
    ratified_at: conflict.ratifiedAt,
    status,
    cannot_claim: [...(conflict.cannotClaim ?? ["authority_conflict_resolved"])]
  }) as unknown as H03QuestionRegisterRecord;
}

function validateQuestionSemantics(
  record: H03QuestionRegisterRecord,
  findings: H03QuestionRegisterFinding[],
  owner: { readonly candidateId?: string; readonly conflictId?: string }
): void {
  const text = JSON.stringify(record);
  if (PRIVATE_PATH_PATTERN.test(text)) {
    findings.push({ kind: "private_path_in_question_record", questionId: record.question_id, ...owner });
  }
  if (record.cannot_claim.length === 0) {
    findings.push({ kind: "missing_question_cannot_claim", questionId: record.question_id, ...owner });
  }
  if (record.scope_class === "broad_systemic" && record.status === "default_authorized") {
    findings.push({
      kind: "broad_systemic_default_forbidden",
      questionId: record.question_id,
      ...owner
    });
  }
  if (
    record.status === "default_authorized" &&
    (!record.recommended_default || !record.safe_default_authority)
  ) {
    findings.push({
      kind: "default_authority_missing",
      questionId: record.question_id,
      ...owner
    });
  }
  if (record.scope_class === "narrow_local" && !LOCAL_PROCEED_STATUSES.has(record.status)) {
    findings.push({
      kind: "narrow_local_without_authorized_default",
      questionId: record.question_id,
      ...owner
    });
  }
  if (record.status === "pending_run_completion" && record.decision_deadline.kind === "before_affected_execution") {
    findings.push({
      kind: "pending_local_deadline_blocks_execution",
      questionId: record.question_id,
      ...owner
    });
  }
}

function validateRecord(
  record: H03QuestionRegisterRecord,
  validator: ValidateFunction<unknown> | null,
  findings: H03QuestionRegisterFinding[],
  owner: { readonly candidateId?: string; readonly conflictId?: string }
): void {
  if (!validator) return;
  const questionId = record.question_id;
  const valid = Boolean(validator(record));
  if (valid) return;
  for (const error of validator.errors ?? []) {
    findings.push({
      kind: `question_schema_${error.keyword}`,
      questionId,
      detail: `${error.instancePath || "/"} ${error.message ?? "schema validation failed"}`,
      ...owner
    });
  }
}

function loadQuestionRegisterValidator(
  config: H03QuestionRegisterConfig,
  findings: H03QuestionRegisterFinding[]
): ValidateFunction<unknown> | null {
  if (config.questionRegisterSchema.schemaVersion !== "1.1.0") {
    findings.push({
      kind: "unsupported_question_register_schema_version",
      expected: "1.1.0",
      actual: config.questionRegisterSchema.schemaVersion
    });
    return null;
  }
  const hashFinding = validateExpectedHash(
    "questionRegisterSchema.sha256",
    config.questionRegisterSchema.sha256
  );
  if (hashFinding) {
    findings.push(hashFinding);
    return null;
  }
  const schemaPath = resolveLogicalRef(config.questionRegisterSchema.ref, config.logicalRoots, findings);
  if (!schemaPath || !existsSync(schemaPath)) {
    findings.push({
      kind: "missing_question_register_schema",
      ref: config.questionRegisterSchema.ref,
      actual: schemaPath ?? "unresolved"
    });
    return null;
  }
  const schemaText = readFileSync(schemaPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(schemaText)) {
    findings.push({
      kind: "private_path_in_question_register_schema",
      ref: config.questionRegisterSchema.ref
    });
    return null;
  }
  const actualHash = sha256Text(schemaText);
  if (actualHash !== normalizeSha256(config.questionRegisterSchema.sha256)) {
    findings.push({
      kind: "question_register_schema_hash_mismatch",
      ref: config.questionRegisterSchema.ref,
      expected: normalizeSha256(config.questionRegisterSchema.sha256),
      actual: actualHash
    });
    return null;
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(schemaText) as AnySchema);
}

function verifyExpectedQuestionRegisterHash(
  config: H03QuestionRegisterConfig,
  questionRegisterHash: string | null,
  findings: H03QuestionRegisterFinding[]
): void {
  if (!config.expectedQuestionRegisterHash) return;
  verifyExpectedHash("expectedQuestionRegisterHash", config.expectedQuestionRegisterHash, findings);
  if (questionRegisterHash && questionRegisterHash !== normalizeSha256(config.expectedQuestionRegisterHash)) {
    findings.push({
      kind: "question_register_hash_mismatch",
      expected: normalizeSha256(config.expectedQuestionRegisterHash),
      actual: questionRegisterHash
    });
  }
}

function verifyExpectedHash(
  fieldName: string,
  hash: string,
  findings: H03QuestionRegisterFinding[]
): void {
  const finding = validateExpectedHash(fieldName, hash);
  if (finding) findings.push(finding);
}

function validateExpectedHash(
  fieldName: string,
  hash: string
): H03QuestionRegisterFinding | null {
  if (!SHA256_PATTERN.test(hash)) {
    return { kind: "invalid_sha256", ref: fieldName, actual: hash };
  }
  if (PLACEHOLDER_PATTERN.test(hash)) {
    return { kind: "placeholder_sha256", ref: fieldName, actual: hash };
  }
  return null;
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H03QuestionRegisterFinding[]
): string | null {
  const match = /^(?<scheme>[a-z][a-z0-9+.-]*):\/\/(?<path>.+)$/iu.exec(ref);
  if (!match?.groups) {
    findings.push({ kind: "invalid_logical_ref", ref });
    return null;
  }
  const scheme = match.groups.scheme;
  const logicalPath = match.groups.path;
  if (!scheme || !logicalPath) {
    findings.push({ kind: "invalid_logical_ref", ref });
    return null;
  }
  const root = logicalRoots[scheme];
  if (!root) {
    findings.push({ kind: "unknown_logical_root", ref, actual: scheme });
    return null;
  }
  if (isAbsolute(logicalPath)) {
    findings.push({ kind: "absolute_path_in_logical_ref", ref });
    return null;
  }
  const resolvedRoot = normalize(root);
  const resolvedPath = normalize(join(resolvedRoot, logicalPath));
  const rel = relative(resolvedRoot, resolvedPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    findings.push({ kind: "logical_ref_escape", ref, actual: resolvedPath });
    return null;
  }
  return resolvedPath;
}

function findDuplicateQuestionIds(records: readonly H03QuestionRegisterRecord[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const record of records) {
    if (seen.has(record.question_id)) duplicates.add(record.question_id);
    seen.add(record.question_id);
  }
  return [...duplicates].sort();
}

function questionIdFor(kind: string, id: string, sourceReference: string, question: string): string {
  return `H03-QR-${sha256Text(JSON.stringify({ kind, id, sourceReference, question })).slice(0, 12)}`;
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function normalizeSha256(hash: string): string {
  return hash.startsWith("sha256:") ? hash.slice("sha256:".length) : hash;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
