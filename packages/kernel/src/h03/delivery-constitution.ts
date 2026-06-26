import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";

import {
  normalizeH03PlanConfig,
  type H03NormalizedPlan,
  type H03PlanNormalizationConfig
} from "./plan-normalization.js";
import {
  compileH03QuestionRegisterConfig,
  type H03QuestionRegisterConfig,
  type H03QuestionRegisterRecord
} from "./question-register.js";

export type H03DeliveryConstitutionStatus = "passed" | "failed";
export type H03StructuredContractKey =
  | "box_dependency_graph"
  | "agent_topology"
  | "proof_matrix"
  | "assurance_matrix"
  | "resource_limits"
  | "performance_environment_contract"
  | "independent_review_policy";

export interface H03DeliveryConstitutionConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schemas: H03DeliveryConstitutionSchemaRefs;
  readonly planNormalization: H03PlanNormalizationConfig;
  readonly questionRegister: H03QuestionRegisterConfig;
  readonly constitution: H03DeliveryConstitutionSettings;
  readonly structuredContracts: Record<H03StructuredContractKey, H03AuthorityArtifactRef>;
  readonly questionRegisterArtifact: H03AuthorityArtifactRef;
  readonly companionArtifacts: Record<H03StructuredContractKey, H03CompanionArtifactBinding>;
  readonly ratifiedAnswerRefs?: readonly H03AuthorityArtifactRef[];
  readonly safeDefaultPolicyRefs?: readonly H03AuthorityArtifactRef[];
  readonly pendingLocalQuestionLimit: number;
  readonly correctionFfetRequiredWhenAnswerDiffers: boolean;
  readonly expectedConstitutionCandidateHash?: string;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H03DeliveryConstitutionSchemaRefs {
  readonly authorityArtifactRef: H03SchemaRef;
  readonly deliveryConstitution: H03SchemaRef & { readonly schemaVersion: "1.1.0" };
}

export interface H03SchemaRef {
  readonly ref: string;
  readonly sha256: string;
}

export interface H03AuthorityArtifactRef {
  readonly artifact_id: string;
  readonly artifact_version: string;
  readonly ref: string;
  readonly sha256: string;
  readonly schema_ref: string;
  readonly schema_sha256: string;
}

export interface H03CompanionArtifactBinding {
  readonly ref: string;
  readonly sha256: string;
  readonly schemaRef: string;
  readonly schemaSha256: string;
}

export interface H03DeliveryConstitutionSettings {
  readonly constitutionId: string;
  readonly version: string;
  readonly projectId: string;
  readonly sourceMode: H03SourceMode;
  readonly target: H03DeliveryConstitutionTarget;
  readonly boxes: readonly string[];
  readonly completionContract: string;
  readonly projectPackRef: string;
  readonly qualityProfileRef: string;
  readonly qualityProfileHash: string;
  readonly constitutionHash: string;
  readonly approvalStatus?: string;
  readonly budgets?: Record<string, number | string | boolean>;
  readonly ratifiedDefaultPolicies?: readonly string[];
  readonly rollbackPolicy?: string;
  readonly retirementContractRef?: string | null;
  readonly qualityOverrideRefs?: readonly string[];
  readonly qualityDebtPolicyRef?: string | null;
  readonly releaseQualityConditions?: readonly string[];
  readonly execution_authorized?: unknown;
}

export type H03SourceMode =
  | "READ_ONLY_DIGEST"
  | "MIGRATION_PLAN_ONLY"
  | "SHADOW_REFACTOR_LOCAL"
  | "SHADOW_REFACTOR_REMOTE"
  | "CLEAN_REBUILD"
  | "ADOPTION_BACK_INTO_SOURCE";

export interface H03DeliveryConstitutionTarget {
  readonly type: "local_folder" | "git_repository" | "plan_only";
  readonly location: string;
  readonly mutation_allowed: true;
}

export interface H03DeliveryConstitutionReport {
  readonly status: H03DeliveryConstitutionStatus;
  readonly findings: readonly H03DeliveryConstitutionFinding[];
  readonly classified_mismatches: readonly H03DeliveryConstitutionFinding[];
  readonly source_authority_set_hash: string | null;
  readonly question_register_hash: string | null;
  readonly constitution_candidate_hash: string | null;
  readonly zero_broad_ambiguity: boolean;
  readonly constitution: H03DeliveryConstitution | null;
  readonly verified_companions: readonly H03VerifiedCompanionArtifact[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H03DeliveryConstitution {
  readonly schema_version: "1.1.0";
  readonly constitution_id: string;
  readonly version: string;
  readonly project_id: string;
  readonly objective: string;
  readonly business_outcomes?: readonly string[];
  readonly source_authority: readonly H03ConstitutionAuthorityEntry[];
  readonly source_authority_set_hash: string;
  readonly source_mode: H03SourceMode;
  readonly target: H03DeliveryConstitutionTarget;
  readonly scope: readonly string[];
  readonly non_scope: readonly string[];
  readonly boxes: readonly string[];
  readonly structured_contracts: Record<H03StructuredContractKey, H03AuthorityArtifactRef>;
  readonly question_resolution: H03QuestionResolution;
  readonly public_commitments?: readonly string[];
  readonly internal_invariants?: readonly string[];
  readonly human_gates: readonly string[];
  readonly budgets?: Record<string, number | string | boolean>;
  readonly hash_contract: H03HashContract;
  readonly completion_contract: string;
  readonly cannot_claim: readonly string[];
  readonly approval: H03ConstitutionApproval;
  readonly question_register_hash: string;
  readonly project_pack_ref: string;
  readonly ratified_default_policies?: readonly string[];
  readonly rollback_policy?: string;
  readonly retirement_contract_ref?: string | null;
  readonly quality_profile_ref: string;
  readonly quality_profile_hash: string;
  readonly quality_override_refs?: readonly string[];
  readonly quality_debt_policy_ref?: string | null;
  readonly release_quality_conditions?: readonly string[];
}

export interface H03ConstitutionAuthorityEntry {
  readonly rank: number;
  readonly path_or_uri: string;
  readonly authority: string;
}

export interface H03QuestionResolution {
  readonly question_register: H03AuthorityArtifactRef;
  readonly ratified_answer_refs: readonly H03AuthorityArtifactRef[];
  readonly safe_default_policy_refs: readonly H03AuthorityArtifactRef[];
  readonly pending_local_question_limit: number;
  readonly correction_ffet_required_when_answer_differs: true;
  readonly zero_broad_ambiguity: boolean;
  readonly unresolved_broad_question_ids: readonly string[];
}

export interface H03HashContract {
  readonly algorithm: "sha256";
  readonly canonicalization: "RFC8785";
  readonly content_hash_scope: "document_excluding_approval";
  readonly schema_sha256: string;
  readonly companion_hashes_included: true;
  readonly question_authority_included: true;
}

export interface H03ConstitutionApproval {
  readonly status: "for_human_review";
  readonly constitution_hash: string;
  readonly hash_algorithm: "sha256";
  readonly canonicalization: "RFC8785";
  readonly hash_scope: "document_excluding_approval";
  readonly approved_by: null;
  readonly approved_at: null;
  readonly approval_record_ref: null;
  readonly approval_record_hash: null;
}

export interface H03VerifiedCompanionArtifact {
  readonly key: H03StructuredContractKey;
  readonly ref: string;
  readonly sha256: string;
  readonly schema_ref: string;
  readonly schema_sha256: string;
}

export interface H03DeliveryConstitutionFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly key?: string;
  readonly questionId?: string;
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
const STRUCTURED_CONTRACT_KEYS: readonly H03StructuredContractKey[] = [
  "box_dependency_graph",
  "agent_topology",
  "proof_matrix",
  "assurance_matrix",
  "resource_limits",
  "performance_environment_contract",
  "independent_review_policy"
];

export function compileH03DeliveryConstitutionConfig(
  config: H03DeliveryConstitutionConfig
): H03DeliveryConstitutionReport {
  const findings: H03DeliveryConstitutionFinding[] = [];
  const validators = loadConstitutionValidators(config, findings);
  const planReport = normalizeH03PlanConfig(config.planNormalization);
  const questionReport = compileH03QuestionRegisterConfig(config.questionRegister);

  if (planReport.status !== "passed") {
    findings.push({
      kind: "plan_normalization_failed",
      detail: planReport.findings.map((finding) => finding.kind).join(",")
    });
  }
  if (questionReport.status !== "passed") {
    findings.push({
      kind: "question_register_compilation_failed",
      detail: questionReport.findings.map((finding) => finding.kind).join(",")
    });
  }

  const verifiedCompanions = verifyCompanionArtifacts(config, validators.authorityRef, findings);
  verifyAuthorityArtifactRef(config.questionRegisterArtifact, validators.authorityRef, findings, "question_register");

  const constitution = planReport.normalized_plan && questionReport.question_register_hash
    ? buildConstitution(config, planReport.normalized_plan, {
      question_register_hash: questionReport.question_register_hash,
      zero_broad_ambiguity: questionReport.zero_broad_ambiguity,
      unresolved_broad_questions: questionReport.unresolved_broad_questions
    })
    : null;
  if (constitution) {
    validateConstitutionSemantics(config, constitution, questionReport.question_register, findings);
    validateConstitutionSchema(constitution, validators.constitution, findings);
  }

  const constitutionCandidateHash = constitution && findings.length === 0
    ? hashDeliveryConstitutionCandidate(constitution)
    : null;
  verifyExpectedConstitutionCandidateHash(config, constitutionCandidateHash, findings);

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: findings.filter((finding) => finding.kind.endsWith("_mismatch")),
    source_authority_set_hash: planReport.source_authority_set_hash,
    question_register_hash: questionReport.question_register_hash,
    constitution_candidate_hash: constitutionCandidateHash,
    zero_broad_ambiguity: questionReport.zero_broad_ambiguity,
    constitution: findings.length === 0 ? constitution : null,
    verified_companions: verifiedCompanions,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

export function hashDeliveryConstitutionCandidate(
  constitution: H03DeliveryConstitution
): string {
  return sha256Text(JSON.stringify(constitution));
}

function buildConstitution(
  config: H03DeliveryConstitutionConfig,
  plan: H03NormalizedPlan,
  questionReport: { readonly question_register_hash: string; readonly zero_broad_ambiguity: boolean; readonly unresolved_broad_questions: readonly string[] }
): H03DeliveryConstitution {
  const sections = new Map(config.planNormalization.requiredSections?.map((sectionId) => [sectionId, [] as string[]]) ?? []);
  for (const section of plan.sections) {
    sections.set(section.section_id, [...section.items]);
  }

  return stripUndefined({
    schema_version: "1.1.0",
    constitution_id: config.constitution.constitutionId,
    version: config.constitution.version,
    project_id: config.constitution.projectId,
    objective: firstItem(sections.get("objective")),
    business_outcomes: nonEmpty(sections.get("outcomes")),
    source_authority: config.planNormalization.inputAuthority.authorityManifest.map((entry) => ({
      rank: entry.rank,
      path_or_uri: inputRefForAuthority(config.planNormalization, entry.inputId),
      authority: entry.authority
    })),
    source_authority_set_hash: plan.source_authority_set_hash,
    source_mode: config.constitution.sourceMode,
    target: config.constitution.target,
    scope: nonEmpty(sections.get("scope")) ?? [],
    non_scope: nonEmpty(sections.get("non_scope")) ?? [],
    boxes: [...config.constitution.boxes],
    structured_contracts: config.structuredContracts,
    question_resolution: {
      question_register: config.questionRegisterArtifact,
      ratified_answer_refs: [...(config.ratifiedAnswerRefs ?? [])],
      safe_default_policy_refs: [...(config.safeDefaultPolicyRefs ?? [])],
      pending_local_question_limit: config.pendingLocalQuestionLimit,
      correction_ffet_required_when_answer_differs: config.correctionFfetRequiredWhenAnswerDiffers,
      zero_broad_ambiguity: questionReport.zero_broad_ambiguity,
      unresolved_broad_question_ids: [...questionReport.unresolved_broad_questions]
    },
    public_commitments: nonEmpty(sections.get("public_commitments")),
    internal_invariants: nonEmpty(sections.get("internal_invariants")),
    human_gates: nonEmpty(sections.get("human_gates")) ?? [],
    budgets: config.constitution.budgets,
    hash_contract: {
      algorithm: "sha256",
      canonicalization: "RFC8785",
      content_hash_scope: "document_excluding_approval",
      schema_sha256: normalizeSha256(config.schemas.deliveryConstitution.sha256),
      companion_hashes_included: true,
      question_authority_included: true
    },
    completion_contract: config.constitution.completionContract,
    cannot_claim: [...(config.cannotClaim ?? [])],
    approval: {
      status: "for_human_review",
      constitution_hash: normalizeSha256(config.constitution.constitutionHash),
      hash_algorithm: "sha256",
      canonicalization: "RFC8785",
      hash_scope: "document_excluding_approval",
      approved_by: null,
      approved_at: null,
      approval_record_ref: null,
      approval_record_hash: null
    },
    question_register_hash: questionReport.question_register_hash,
    project_pack_ref: config.constitution.projectPackRef,
    ratified_default_policies: nonEmpty(config.constitution.ratifiedDefaultPolicies),
    rollback_policy: config.constitution.rollbackPolicy,
    retirement_contract_ref: config.constitution.retirementContractRef,
    quality_profile_ref: config.constitution.qualityProfileRef,
    quality_profile_hash: normalizeSha256(config.constitution.qualityProfileHash),
    quality_override_refs: nonEmpty(config.constitution.qualityOverrideRefs),
    quality_debt_policy_ref: config.constitution.qualityDebtPolicyRef,
    release_quality_conditions: nonEmpty(config.constitution.releaseQualityConditions)
  }) as unknown as H03DeliveryConstitution;
}

function loadConstitutionValidators(
  config: H03DeliveryConstitutionConfig,
  findings: H03DeliveryConstitutionFinding[]
): { readonly authorityRef: ValidateFunction<unknown> | null; readonly constitution: ValidateFunction<unknown> | null } {
  if (config.schemas.deliveryConstitution.schemaVersion !== "1.1.0") {
    findings.push({
      kind: "unsupported_delivery_constitution_schema_version",
      expected: "1.1.0",
      actual: config.schemas.deliveryConstitution.schemaVersion
    });
    return { authorityRef: null, constitution: null };
  }
  const authoritySchema = loadSchema(config.schemas.authorityArtifactRef, config.logicalRoots, findings);
  const constitutionSchema = loadSchema(config.schemas.deliveryConstitution, config.logicalRoots, findings);
  if (!authoritySchema || !constitutionSchema) return { authorityRef: null, constitution: null };

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(authoritySchema);
  return {
    authorityRef: ajv.getSchema(String((authoritySchema as { readonly $id?: string }).$id)) ?? ajv.compile(authoritySchema),
    constitution: ajv.compile(constitutionSchema)
  };
}

function verifyCompanionArtifacts(
  config: H03DeliveryConstitutionConfig,
  authorityValidator: ValidateFunction<unknown> | null,
  findings: H03DeliveryConstitutionFinding[]
): H03VerifiedCompanionArtifact[] {
  const verified: H03VerifiedCompanionArtifact[] = [];
  for (const key of STRUCTURED_CONTRACT_KEYS) {
    const findingCountBeforeCompanion = findings.length;
    const artifactRef = config.structuredContracts[key];
    const binding = config.companionArtifacts[key];
    if (!artifactRef) {
      findings.push({ kind: "missing_structured_contract_ref", key });
      continue;
    }
    verifyAuthorityArtifactRef(artifactRef, authorityValidator, findings, key);
    if (!binding) {
      findings.push({ kind: "missing_companion_artifact_binding", key });
      continue;
    }
    verifyCompanionArtifact(key, artifactRef, binding, config.logicalRoots, [
      config.schemas.authorityArtifactRef
    ], findings);
    if (findings.length > findingCountBeforeCompanion) continue;
    verified.push({
      key,
      ref: artifactRef.ref,
      sha256: normalizeSha256(artifactRef.sha256),
      schema_ref: artifactRef.schema_ref,
      schema_sha256: normalizeSha256(artifactRef.schema_sha256)
    });
  }
  return verified;
}

function verifyCompanionArtifact(
  key: H03StructuredContractKey,
  artifactRef: H03AuthorityArtifactRef,
  binding: H03CompanionArtifactBinding,
  logicalRoots: Record<string, string>,
  referencedSchemaRefs: readonly H03SchemaRef[],
  findings: H03DeliveryConstitutionFinding[]
): void {
  if (
    artifactRef.ref !== binding.ref ||
    normalizeSha256(artifactRef.sha256) !== normalizeSha256(binding.sha256) ||
    artifactRef.schema_ref !== binding.schemaRef ||
    normalizeSha256(artifactRef.schema_sha256) !== normalizeSha256(binding.schemaSha256)
  ) {
    findings.push({ kind: "companion_binding_mismatch", key });
  }

  const artifact = loadJsonDocument(binding.ref, normalizeSha256(binding.sha256), logicalRoots, findings, key);
  const schema = loadJsonDocument(binding.schemaRef, normalizeSha256(binding.schemaSha256), logicalRoots, findings, `${key}:schema`);
  if (!artifact || !schema) return;
  const referencedSchemas = referencedSchemaRefs.map((schemaRef) =>
    loadSchema(schemaRef, logicalRoots, findings)
  );
  if (referencedSchemas.some((referencedSchema) => !referencedSchema)) return;

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  try {
    for (const referencedSchema of referencedSchemas) {
      ajv.addSchema(referencedSchema as AnySchema);
    }
  } catch (error) {
    findings.push({
      kind: "companion_schema_ref_registration_failed",
      key,
      detail: error instanceof Error ? error.message : "unknown schema registration error"
    });
    return;
  }
  let validator: ValidateFunction<unknown>;
  try {
    validator = ajv.compile(schema as AnySchema);
  } catch (error) {
    findings.push({
      kind: "companion_schema_compile_failed",
      key,
      detail: error instanceof Error ? error.message : "unknown schema compile error"
    });
    return;
  }
  const valid = validator(artifact);
  if (!valid) {
    findings.push({ kind: "invalid_companion_artifact", key });
  }
}

function verifyAuthorityArtifactRef(
  ref: H03AuthorityArtifactRef,
  validator: ValidateFunction<unknown> | null,
  findings: H03DeliveryConstitutionFinding[],
  key: string
): void {
  for (const [field, value] of [
    ["sha256", ref.sha256],
    ["schema_sha256", ref.schema_sha256]
  ] as const) {
    const finding = validateExpectedHash(`${key}.${field}`, value);
    if (finding) findings.push({ ...finding, key });
  }
  if (PRIVATE_PATH_PATTERN.test(JSON.stringify(ref))) {
    findings.push({ kind: "private_path_in_authority_artifact_ref", key });
  }
  if (!validator) return;
  const valid = Boolean(validator(ref));
  if (valid) return;
  findings.push({ kind: "invalid_authority_artifact_ref", key });
}

function validateConstitutionSemantics(
  config: H03DeliveryConstitutionConfig,
  constitution: H03DeliveryConstitution,
  questionRecords: readonly H03QuestionRegisterRecord[],
  findings: H03DeliveryConstitutionFinding[]
): void {
  if (PRIVATE_PATH_PATTERN.test(JSON.stringify(constitution))) {
    findings.push({ kind: "private_path_in_delivery_constitution" });
  }
  if (config.constitution.execution_authorized !== undefined || "execution_authorized" in (constitution as unknown as Record<string, unknown>)) {
    findings.push({ kind: "execution_authorization_inside_constitution_forbidden" });
  }
  if (config.constitution.approvalStatus && config.constitution.approvalStatus !== "for_human_review") {
    findings.push({ kind: "approval_status_overclaim", actual: config.constitution.approvalStatus });
  }
  for (const [field, hash] of [
    ["constitution.constitutionHash", config.constitution.constitutionHash],
    ["constitution.qualityProfileHash", config.constitution.qualityProfileHash]
  ] as const) {
    const finding = validateExpectedHash(field, hash);
    if (finding) findings.push(finding);
  }
  if (constitution.question_register_hash !== normalizeSha256(config.questionRegisterArtifact.sha256)) {
    findings.push({
      kind: "question_register_hash_mismatch",
      expected: constitution.question_register_hash,
      actual: normalizeSha256(config.questionRegisterArtifact.sha256)
    });
  }
  const unresolvedBroad = questionRecords
    .filter((record) => record.scope_class === "broad_systemic" && !["answered", "ratified"].includes(record.status))
    .map((record) => record.question_id);
  if (constitution.question_resolution.zero_broad_ambiguity && unresolvedBroad.length > 0) {
    findings.push({
      kind: "zero_broad_ambiguity_mismatch",
      actual: unresolvedBroad.join(",")
    });
  }
  validateBoxGraphAgainstConstitution(config, constitution, findings);
}

function validateBoxGraphAgainstConstitution(
  config: H03DeliveryConstitutionConfig,
  constitution: H03DeliveryConstitution,
  findings: H03DeliveryConstitutionFinding[]
): void {
  const graphBinding = config.companionArtifacts.box_dependency_graph;
  const graph = loadJsonDocument(
    graphBinding.ref,
    normalizeSha256(graphBinding.sha256),
    config.logicalRoots,
    findings,
    "box_dependency_graph:semantic"
  ) as { readonly nodes?: readonly { readonly box_id?: string }[]; readonly cycle_status?: string; readonly unresolved_dependencies?: readonly string[] } | null;
  if (!graph) return;
  const graphBoxes = [...new Set((graph.nodes ?? []).map((node) => node.box_id).filter(Boolean) as string[])].sort();
  const constitutionBoxes = [...constitution.boxes].sort();
  if (JSON.stringify(graphBoxes) !== JSON.stringify(constitutionBoxes)) {
    findings.push({
      kind: "box_graph_constitution_boxes_mismatch",
      expected: graphBoxes.join(","),
      actual: constitutionBoxes.join(",")
    });
  }
  if (graph.cycle_status && graph.cycle_status !== "acyclic") {
    findings.push({ kind: "box_graph_cycle_detected", actual: graph.cycle_status });
  }
  if ((graph.unresolved_dependencies ?? []).length > 0) {
    findings.push({
      kind: "box_graph_unresolved_dependencies",
      actual: (graph.unresolved_dependencies ?? []).join(",")
    });
  }
}

function validateConstitutionSchema(
  constitution: H03DeliveryConstitution,
  validator: ValidateFunction<unknown> | null,
  findings: H03DeliveryConstitutionFinding[]
): void {
  if (!validator) return;
  const valid = Boolean(validator(constitution));
  if (valid) return;
  for (const error of validator.errors ?? []) {
    findings.push({
      kind: `delivery_constitution_schema_${error.keyword}`,
      detail: `${error.instancePath || "/"} ${error.message ?? "schema validation failed"}`
    });
  }
}

function verifyExpectedConstitutionCandidateHash(
  config: H03DeliveryConstitutionConfig,
  constitutionCandidateHash: string | null,
  findings: H03DeliveryConstitutionFinding[]
): void {
  if (!config.expectedConstitutionCandidateHash) return;
  const finding = validateExpectedHash(
    "expectedConstitutionCandidateHash",
    config.expectedConstitutionCandidateHash
  );
  if (finding) findings.push(finding);
  if (
    constitutionCandidateHash &&
    constitutionCandidateHash !== normalizeSha256(config.expectedConstitutionCandidateHash)
  ) {
    findings.push({
      kind: "constitution_candidate_hash_mismatch",
      expected: normalizeSha256(config.expectedConstitutionCandidateHash),
      actual: constitutionCandidateHash
    });
  }
}

function loadSchema(
  ref: H03SchemaRef,
  logicalRoots: Record<string, string>,
  findings: H03DeliveryConstitutionFinding[]
): AnySchema | null {
  return loadJsonDocument(ref.ref, normalizeSha256(ref.sha256), logicalRoots, findings, ref.ref) as AnySchema | null;
}

function loadJsonDocument(
  ref: string,
  expectedHash: string,
  logicalRoots: Record<string, string>,
  findings: H03DeliveryConstitutionFinding[],
  key: string
): unknown | null {
  const hashFinding = validateExpectedHash(key, expectedHash);
  if (hashFinding) {
    findings.push({ ...hashFinding, key });
    return null;
  }
  const path = resolveLogicalRef(ref, logicalRoots, findings);
  if (!path || !existsSync(path)) {
    findings.push({ kind: "missing_ref", ref, key, actual: path ?? "unresolved" });
    return null;
  }
  const text = readFileSync(path, "utf8");
  if (PRIVATE_PATH_PATTERN.test(text)) {
    findings.push({ kind: "private_path_in_ref", ref, key });
    return null;
  }
  const actualHash = sha256Text(text);
  if (actualHash !== normalizeSha256(expectedHash)) {
    findings.push({
      kind: "ref_hash_mismatch",
      ref,
      key,
      expected: normalizeSha256(expectedHash),
      actual: actualHash
    });
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    findings.push({
      kind: "ref_json_parse_failed",
      ref,
      key,
      detail: error instanceof Error ? error.message : "unknown parse error"
    });
    return null;
  }
}

function inputRefForAuthority(config: H03PlanNormalizationConfig, inputId: string): string {
  const input = config.inputAuthority.inputs.find((candidate) => candidate.inputId === inputId);
  return input?.ref ?? `missing://${inputId}`;
}

function firstItem(items: readonly string[] | undefined): string {
  return items?.[0] ?? "No objective supplied.";
}

function nonEmpty<T>(items: readonly T[] | undefined): readonly T[] | undefined {
  return items && items.length > 0 ? [...items] : undefined;
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function validateExpectedHash(
  fieldName: string,
  hash: string
): H03DeliveryConstitutionFinding | null {
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
  findings: H03DeliveryConstitutionFinding[]
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

function normalizeSha256(hash: string): string {
  return hash.startsWith("sha256:") ? hash.slice("sha256:".length) : hash;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
