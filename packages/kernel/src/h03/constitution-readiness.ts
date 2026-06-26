import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";

import {
  compileH03DeliveryConstitutionConfig,
  type H03DeliveryConstitution,
  type H03DeliveryConstitutionConfig
} from "./delivery-constitution.js";

export type H03ConstitutionReadinessStatus = "passed" | "failed";
export type H03ApprovalState = "for_human_review" | "approved" | "rejected" | "superseded";
export type H03ExecutionAuthorizationState = "not_authorized" | "authorized" | "invalid";
export type H03CompletionGateStatus = "passed" | "failed" | "blocked" | "not_applicable_with_reason";

export interface H03ConstitutionReadinessConfig {
  readonly logicalRoots: Record<string, string>;
  readonly deliveryConstitutionConfigRef: string;
  readonly deliveryConstitutionConfigSha256: string;
  readonly deliveryConstitutionOverrides?: H03DeliveryConstitutionOverrides;
  readonly currentProduct: H03CurrentProductTruth;
  readonly predecessorCloseouts: readonly H03PredecessorCloseoutExpectation[];
  readonly schemas?: H03ApprovalExecutionSchemas;
  readonly approvalRecord?: H03RecordBinding;
  readonly executionAuthorizationRecord?: H03RecordBinding;
  readonly completionGates: readonly H03CompletionGate[];
  readonly expectedConstitutionContentHash?: string;
  readonly expectedApprovalState?: H03ApprovalState;
  readonly expectedExecutionAuthorized: boolean;
  readonly expectedCanonicalization?: string;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H03DeliveryConstitutionOverrides {
  readonly constitutionHash?: string;
  readonly expectedConstitutionCandidateHash?: string | null;
  readonly targetLocation?: string;
  readonly approvalStatus?: string;
}

export interface H03CurrentProductTruth {
  readonly expectedSha: string;
  readonly actualSha: string;
  readonly expectedTreeHash?: string;
  readonly actualTreeHash?: string;
}

export interface H03PredecessorCloseoutExpectation {
  readonly ffetId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: "closeout_complete";
}

export interface H03ApprovalExecutionSchemas {
  readonly approvalRecord?: H03SchemaBinding;
  readonly executionAuthorizationRecord?: H03SchemaBinding;
}

export interface H03SchemaBinding {
  readonly ref: string;
  readonly sha256: string;
}

export interface H03RecordBinding {
  readonly ref: string;
  readonly sha256: string;
  readonly schemaRef: string;
  readonly schemaSha256: string;
}

export interface H03CompletionGate {
  readonly gateId: string;
  readonly status: H03CompletionGateStatus;
  readonly required: boolean;
  readonly detail?: string;
}

export interface H03ConstitutionReadinessReport {
  readonly status: H03ConstitutionReadinessStatus;
  readonly findings: readonly H03ConstitutionReadinessFinding[];
  readonly classified_mismatches: readonly H03ConstitutionReadinessFinding[];
  readonly constitution_id: string | null;
  readonly constitution_content_hash: string | null;
  readonly approval_state: H03ApprovalState | null;
  readonly execution_authorization_state: H03ExecutionAuthorizationState;
  readonly execution_authorized: boolean;
  readonly verified_predecessors: readonly H03VerifiedPredecessor[];
  readonly verified_records: readonly H03VerifiedRecord[];
  readonly completion_gates: readonly H03CompletionGate[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H03VerifiedPredecessor {
  readonly ffetId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly status: string;
}

export interface H03VerifiedRecord {
  readonly kind: "approval_record" | "execution_authorization_record";
  readonly ref: string;
  readonly sha256: string;
}

export interface H03ConstitutionReadinessFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly gateId?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface ConstitutionApprovalRecord {
  readonly constitution_id: string;
  readonly constitution_version: string;
  readonly constitution_hash: string;
  readonly constitution_document_hash: string;
  readonly decision: H03ApprovalState;
}

interface ExecutionAuthorizationRecord {
  readonly constitution_id: string;
  readonly constitution_hash: string;
  readonly approval_record_ref: string;
  readonly approval_record_hash: string;
  readonly status: "authorized" | "suspended" | "revoked" | "completed";
}

type AddFormats = (ajv: Ajv2020) => void;
const addFormats = ((addFormatsModule as unknown as { readonly default?: AddFormats }).default ??
  (addFormatsModule as unknown as AddFormats));
const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;

export function verifyH03ConstitutionReadinessConfig(
  config: H03ConstitutionReadinessConfig
): H03ConstitutionReadinessReport {
  const findings: H03ConstitutionReadinessFinding[] = [];
  const deliveryConfig = loadDeliveryConstitutionConfig(config, findings);
  const deliveryReport = deliveryConfig
    ? compileH03DeliveryConstitutionConfig(deliveryConfig)
    : null;

  if (deliveryReport && deliveryReport.status !== "passed") {
    findings.push({
      kind: "delivery_constitution_compilation_failed",
      detail: deliveryReport.findings.map((finding) => finding.kind).join(",")
    });
  }

  const constitution = deliveryReport?.constitution ?? null;
  const constitutionContentHash = constitution ? hashDeliveryConstitutionContent(constitution) : null;
  if (constitution && constitutionContentHash) validateConstitutionBinding(config, constitution, constitutionContentHash, findings);

  const verifiedPredecessors = verifyPredecessorCloseouts(config, findings);
  const approvalResult = verifyApprovalRecord(config, constitution, constitutionContentHash, findings);
  const executionResult = verifyExecutionAuthorizationRecord(config, constitution, constitutionContentHash, approvalResult, findings);
  validateCurrentProduct(config.currentProduct, findings);
  validateCompletionGates(config.completionGates, findings);
  validateExpectations(config, constitutionContentHash, approvalResult.approvalState, executionResult.executionAuthorized, findings);

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: findings.filter((finding) => finding.kind.endsWith("_mismatch") || finding.kind.includes("stale")),
    constitution_id: constitution?.constitution_id ?? null,
    constitution_content_hash: findings.length === 0 ? constitutionContentHash : null,
    approval_state: approvalResult.approvalState,
    execution_authorization_state: executionResult.executionAuthorizationState,
    execution_authorized: executionResult.executionAuthorized,
    verified_predecessors: findings.length === 0 ? verifiedPredecessors : [],
    verified_records: findings.length === 0 ? [...approvalResult.verifiedRecords, ...executionResult.verifiedRecords] : [],
    completion_gates: [...config.completionGates],
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

export function hashDeliveryConstitutionContent(
  constitution: H03DeliveryConstitution
): string {
  const { approval: _approval, ...documentWithoutApproval } = constitution;
  return sha256Text(canonicalizeJsonForHash(documentWithoutApproval));
}

export function canonicalizeJsonForHash(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("non_finite_number_not_supported");
    }
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJsonForHash(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJsonForHash(record[key])}`).join(",")}}`;
  }
  throw new Error("unsupported_json_value");
}

function loadDeliveryConstitutionConfig(
  config: H03ConstitutionReadinessConfig,
  findings: H03ConstitutionReadinessFinding[]
): H03DeliveryConstitutionConfig | null {
  const loaded = loadJsonDocument(
    config.deliveryConstitutionConfigRef,
    config.deliveryConstitutionConfigSha256,
    config.logicalRoots,
    findings,
    "delivery_constitution_config"
  ) as H03DeliveryConstitutionConfig | null;
  if (!loaded) return null;
  const clone = JSON.parse(JSON.stringify(loaded)) as H03DeliveryConstitutionConfig & {
    constitution: {
      constitutionHash: string;
      target: { location: string };
      approvalStatus?: string;
    };
  };
  if (config.deliveryConstitutionOverrides?.constitutionHash) {
    clone.constitution.constitutionHash = config.deliveryConstitutionOverrides.constitutionHash;
  }
  if (config.deliveryConstitutionOverrides?.expectedConstitutionCandidateHash !== undefined) {
    if (config.deliveryConstitutionOverrides.expectedConstitutionCandidateHash === null) {
      delete (clone as { expectedConstitutionCandidateHash?: string }).expectedConstitutionCandidateHash;
    } else {
      (clone as { expectedConstitutionCandidateHash?: string }).expectedConstitutionCandidateHash =
        config.deliveryConstitutionOverrides.expectedConstitutionCandidateHash;
    }
  } else if (config.deliveryConstitutionOverrides?.constitutionHash) {
    delete (clone as { expectedConstitutionCandidateHash?: string }).expectedConstitutionCandidateHash;
  }
  if (config.deliveryConstitutionOverrides?.targetLocation) {
    if (PRIVATE_PATH_PATTERN.test(config.deliveryConstitutionOverrides.targetLocation)) {
      findings.push({ kind: "private_path_in_constitution" });
    }
    clone.constitution.target.location = config.deliveryConstitutionOverrides.targetLocation;
  }
  if (config.deliveryConstitutionOverrides?.approvalStatus) {
    clone.constitution.approvalStatus = config.deliveryConstitutionOverrides.approvalStatus;
  }
  return clone;
}

function validateConstitutionBinding(
  config: H03ConstitutionReadinessConfig,
  constitution: H03DeliveryConstitution,
  constitutionContentHash: string,
  findings: H03ConstitutionReadinessFinding[]
): void {
  if (PRIVATE_PATH_PATTERN.test(JSON.stringify(constitution))) {
    findings.push({ kind: "private_path_in_constitution" });
  }
  if (constitution.hash_contract.algorithm !== "sha256") {
    findings.push({ kind: "unsupported_hash_algorithm", expected: "sha256", actual: constitution.hash_contract.algorithm });
  }
  if (constitution.hash_contract.canonicalization !== "RFC8785") {
    findings.push({ kind: "unsupported_canonicalization", expected: "RFC8785", actual: constitution.hash_contract.canonicalization });
  }
  if (config.expectedCanonicalization && config.expectedCanonicalization !== "RFC8785") {
    findings.push({ kind: "unsupported_expected_canonicalization", expected: "RFC8785", actual: config.expectedCanonicalization });
  }
  if (constitution.hash_contract.content_hash_scope !== "document_excluding_approval") {
    findings.push({
      kind: "unsupported_content_hash_scope",
      expected: "document_excluding_approval",
      actual: constitution.hash_contract.content_hash_scope
    });
  }
  if (constitution.approval.status !== "for_human_review") {
    findings.push({ kind: "constitution_approval_status_overclaim", expected: "for_human_review", actual: constitution.approval.status });
  }
  if (constitution.approval.constitution_hash !== constitutionContentHash) {
    findings.push({
      kind: "constitution_content_hash_mismatch",
      expected: constitutionContentHash,
      actual: constitution.approval.constitution_hash
    });
  }
}

function verifyPredecessorCloseouts(
  config: H03ConstitutionReadinessConfig,
  findings: H03ConstitutionReadinessFinding[]
): H03VerifiedPredecessor[] {
  const verified: H03VerifiedPredecessor[] = [];
  for (const predecessor of config.predecessorCloseouts) {
    const closeout = loadJsonDocument(
      predecessor.ref,
      predecessor.sha256,
      config.logicalRoots,
      findings,
      predecessor.ffetId
    ) as { readonly status?: string } | null;
    if (!closeout) continue;
    if (closeout.status !== predecessor.expectedStatus) {
      findings.push({
        kind: "predecessor_closeout_status_mismatch",
        ref: predecessor.ref,
        expected: predecessor.expectedStatus,
        actual: closeout.status ?? "missing"
      });
      continue;
    }
    verified.push({
      ffetId: predecessor.ffetId,
      ref: predecessor.ref,
      sha256: normalizeSha256(predecessor.sha256),
      status: closeout.status
    });
  }
  return verified;
}

function verifyApprovalRecord(
  config: H03ConstitutionReadinessConfig,
  constitution: H03DeliveryConstitution | null,
  constitutionContentHash: string | null,
  findings: H03ConstitutionReadinessFinding[]
): { readonly approvalState: H03ApprovalState | null; readonly approvalRecordHash: string | null; readonly approvalRecordRef: string | null; readonly verifiedRecords: readonly H03VerifiedRecord[] } {
  if (!config.approvalRecord) {
    return {
      approvalState: constitution ? "for_human_review" : null,
      approvalRecordHash: null,
      approvalRecordRef: null,
      verifiedRecords: []
    };
  }
  const record = loadAndValidateBoundRecord<ConstitutionApprovalRecord>(
    "approval_record",
    config.approvalRecord,
    config.schemas?.approvalRecord,
    config.logicalRoots,
    findings
  );
  if (!record || !constitution || !constitutionContentHash) {
    return { approvalState: "for_human_review", approvalRecordHash: null, approvalRecordRef: null, verifiedRecords: [] };
  }
  if (record.constitution_id !== constitution.constitution_id) {
    findings.push({ kind: "approval_record_constitution_id_mismatch", expected: constitution.constitution_id, actual: record.constitution_id });
  }
  if (record.constitution_version !== constitution.version) {
    findings.push({ kind: "approval_record_constitution_version_mismatch", expected: constitution.version, actual: record.constitution_version });
  }
  if (record.constitution_hash !== constitutionContentHash || record.constitution_document_hash !== constitutionContentHash) {
    findings.push({ kind: "approval_record_constitution_hash_mismatch", expected: constitutionContentHash, actual: record.constitution_hash });
  }
  return {
    approvalState: record.decision,
    approvalRecordHash: normalizeSha256(config.approvalRecord.sha256),
    approvalRecordRef: config.approvalRecord.ref,
    verifiedRecords: [
      {
        kind: "approval_record",
        ref: config.approvalRecord.ref,
        sha256: normalizeSha256(config.approvalRecord.sha256)
      }
    ]
  };
}

function verifyExecutionAuthorizationRecord(
  config: H03ConstitutionReadinessConfig,
  constitution: H03DeliveryConstitution | null,
  constitutionContentHash: string | null,
  approvalResult: { readonly approvalState: H03ApprovalState | null; readonly approvalRecordHash: string | null; readonly approvalRecordRef: string | null },
  findings: H03ConstitutionReadinessFinding[]
): { readonly executionAuthorizationState: H03ExecutionAuthorizationState; readonly executionAuthorized: boolean; readonly verifiedRecords: readonly H03VerifiedRecord[] } {
  if (!config.executionAuthorizationRecord) {
    return { executionAuthorizationState: "not_authorized", executionAuthorized: false, verifiedRecords: [] };
  }
  const record = loadAndValidateBoundRecord<ExecutionAuthorizationRecord>(
    "execution_authorization_record",
    config.executionAuthorizationRecord,
    config.schemas?.executionAuthorizationRecord,
    config.logicalRoots,
    findings
  );
  if (!record || !constitution || !constitutionContentHash) {
    return { executionAuthorizationState: "invalid", executionAuthorized: false, verifiedRecords: [] };
  }
  if (approvalResult.approvalState !== "approved") {
    findings.push({ kind: "execution_authorization_without_approved_constitution" });
  }
  if (record.constitution_id !== constitution.constitution_id) {
    findings.push({ kind: "execution_authorization_constitution_id_mismatch", expected: constitution.constitution_id, actual: record.constitution_id });
  }
  if (record.constitution_hash !== constitutionContentHash) {
    findings.push({ kind: "execution_authorization_constitution_hash_mismatch", expected: constitutionContentHash, actual: record.constitution_hash });
  }
  if (approvalResult.approvalRecordRef && record.approval_record_ref !== approvalResult.approvalRecordRef) {
    findings.push({ kind: "execution_authorization_approval_ref_mismatch", expected: approvalResult.approvalRecordRef, actual: record.approval_record_ref });
  }
  if (approvalResult.approvalRecordHash && record.approval_record_hash !== approvalResult.approvalRecordHash) {
    findings.push({ kind: "execution_authorization_approval_hash_mismatch", expected: approvalResult.approvalRecordHash, actual: record.approval_record_hash });
  }
  return {
    executionAuthorizationState: record.status === "authorized" ? "authorized" : "not_authorized",
    executionAuthorized: record.status === "authorized",
    verifiedRecords: [
      {
        kind: "execution_authorization_record",
        ref: config.executionAuthorizationRecord.ref,
        sha256: normalizeSha256(config.executionAuthorizationRecord.sha256)
      }
    ]
  };
}

function loadAndValidateBoundRecord<T>(
  kind: string,
  binding: H03RecordBinding,
  configuredSchema: H03SchemaBinding | undefined,
  logicalRoots: Record<string, string>,
  findings: H03ConstitutionReadinessFinding[]
): T | null {
  if (!configuredSchema) {
    findings.push({ kind: `${kind}_schema_missing`, ref: binding.ref });
    return null;
  }
  if (binding.schemaRef !== configuredSchema.ref || normalizeSha256(binding.schemaSha256) !== normalizeSha256(configuredSchema.sha256)) {
    findings.push({ kind: `${kind}_schema_binding_mismatch`, ref: binding.ref });
  }
  const record = loadJsonDocument(binding.ref, binding.sha256, logicalRoots, findings, kind) as T | null;
  const schema = loadJsonDocument(binding.schemaRef, binding.schemaSha256, logicalRoots, findings, `${kind}:schema`) as AnySchema | null;
  if (!record || !schema) return null;
  const validator = compileSchema(schema);
  if (!validator(record)) {
    findings.push({
      kind: `${kind}_schema_invalid`,
      ref: binding.ref,
      detail: validator.errors?.map((error) => `${error.instancePath} ${error.message}`).join(";") ?? "schema validation failed"
    });
  }
  return record;
}

function validateCurrentProduct(
  currentProduct: H03CurrentProductTruth,
  findings: H03ConstitutionReadinessFinding[]
): void {
  if (currentProduct.actualSha !== currentProduct.expectedSha) {
    findings.push({
      kind: "stale_product_sha",
      expected: currentProduct.expectedSha,
      actual: currentProduct.actualSha
    });
  }
  if (currentProduct.expectedTreeHash && currentProduct.actualTreeHash && currentProduct.expectedTreeHash !== currentProduct.actualTreeHash) {
    findings.push({
      kind: "stale_product_tree_hash",
      expected: currentProduct.expectedTreeHash,
      actual: currentProduct.actualTreeHash
    });
  }
}

function validateCompletionGates(
  completionGates: readonly H03CompletionGate[],
  findings: H03ConstitutionReadinessFinding[]
): void {
  const gateIds = new Set<string>();
  for (const gate of completionGates) {
    if (gateIds.has(gate.gateId)) {
      findings.push({ kind: "duplicate_completion_gate", gateId: gate.gateId });
    }
    gateIds.add(gate.gateId);
    if (gate.required && gate.status !== "passed") {
      findings.push({
        kind: "required_completion_gate_not_passed",
        gateId: gate.gateId,
        expected: "passed",
        actual: gate.status
      });
    }
  }
}

function validateExpectations(
  config: H03ConstitutionReadinessConfig,
  constitutionContentHash: string | null,
  approvalState: H03ApprovalState | null,
  executionAuthorized: boolean,
  findings: H03ConstitutionReadinessFinding[]
): void {
  if (config.expectedConstitutionContentHash) {
    const finding = validateExpectedHash("expectedConstitutionContentHash", config.expectedConstitutionContentHash);
    if (finding) findings.push(finding);
    if (constitutionContentHash && normalizeSha256(config.expectedConstitutionContentHash) !== constitutionContentHash) {
      findings.push({
        kind: "expected_constitution_content_hash_mismatch",
        expected: normalizeSha256(config.expectedConstitutionContentHash),
        actual: constitutionContentHash
      });
    }
  }
  if (config.expectedApprovalState && approvalState !== config.expectedApprovalState) {
    findings.push({
      kind: "approval_state_mismatch",
      expected: config.expectedApprovalState,
      actual: approvalState ?? "null"
    });
  }
  if (config.expectedExecutionAuthorized !== executionAuthorized) {
    findings.push({
      kind: "execution_authorized_mismatch",
      expected: String(config.expectedExecutionAuthorized),
      actual: String(executionAuthorized)
    });
  }
}

function compileSchema(schema: AnySchema): ValidateFunction<unknown> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function loadJsonDocument(
  ref: string,
  expectedHash: string,
  logicalRoots: Record<string, string>,
  findings: H03ConstitutionReadinessFinding[],
  key: string
): unknown | null {
  const hashFinding = validateExpectedHash(key, expectedHash);
  if (hashFinding) {
    findings.push(hashFinding);
    return null;
  }
  const path = resolveLogicalRef(ref, logicalRoots, findings);
  if (!path || !existsSync(path)) {
    findings.push({ kind: "missing_ref", ref, actual: path ?? "unresolved" });
    return null;
  }
  const text = readFileSync(path, "utf8");
  if (PRIVATE_PATH_PATTERN.test(text)) {
    findings.push({ kind: "private_path_in_ref", ref });
    return null;
  }
  const actualHash = sha256Text(text);
  if (actualHash !== normalizeSha256(expectedHash)) {
    findings.push({
      kind: "ref_hash_mismatch",
      ref,
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
      detail: error instanceof Error ? error.message : "unknown parse error"
    });
    return null;
  }
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H03ConstitutionReadinessFinding[]
): string | null {
  const match = /^(?<scheme>[a-z][a-z0-9+.-]*):\/\/(?<path>.+)$/iu.exec(ref);
  if (!match?.groups) {
    findings.push({ kind: "invalid_logical_ref", ref });
    return null;
  }
  const scheme = match.groups.scheme;
  const logicalPath = match.groups.path;
  if (!scheme) {
    findings.push({ kind: "invalid_logical_ref", ref });
    return null;
  }
  const root = logicalRoots[scheme];
  if (!root || !logicalPath) {
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

function validateExpectedHash(
  fieldName: string,
  hash: string
): H03ConstitutionReadinessFinding | null {
  if (!SHA256_PATTERN.test(hash)) {
    return { kind: "invalid_sha256", ref: fieldName, actual: hash };
  }
  if (PLACEHOLDER_PATTERN.test(hash)) {
    return { kind: "placeholder_sha256", ref: fieldName, actual: hash };
  }
  return null;
}

function normalizeSha256(hash: string): string {
  return hash.startsWith("sha256:") ? hash.slice("sha256:".length) : hash;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
