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
export type H03ReadinessMode = "test_mode" | "calibration_mode" | "final_mode";
export type H03EvidencePurpose =
  | "fixture_only"
  | "test_calibration"
  | "generated_view"
  | "implementation_evidence"
  | "qualification_evidence"
  | "ratification_candidate"
  | "ratified_authority"
  | "release_candidate"
  | "production_evidence";
export type H03TruthSourceClass =
  | "fixture_state"
  | "generated_view"
  | "runtime_checkpoint"
  | "control_authority"
  | "evidence_attestation"
  | "git_truth"
  | "github_truth"
  | "human_ratification"
  | "unavailable"
  | "stale"
  | "conflicting";

export interface H03ConstitutionReadinessConfig {
  readonly logicalRoots: Record<string, string>;
  readonly deliveryConstitutionConfigRef: string;
  readonly deliveryConstitutionConfigSha256: string;
  readonly deliveryConstitutionOverrides?: H03DeliveryConstitutionOverrides;
  readonly readinessMode?: H03ReadinessMode;
  readonly terminalClaim?: H03TerminalClaimEligibilityConfig;
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

export interface H03TerminalClaimEligibilityConfig {
  readonly claimId: string;
  readonly claimedPosture: string;
  readonly minimumEvidencePurpose: H03EvidencePurpose;
  readonly forbiddenEvidencePurposes: readonly H03EvidencePurpose[];
  readonly forbiddenTruthSources?: readonly H03TruthSourceClass[];
  readonly requiredAuthorityRoots: readonly H03ClaimEvidenceRoot[];
  readonly mandatoryEvidence: readonly H03ClaimEvidenceRoot[];
  readonly expectedRootOfTrustTrace?: readonly string[];
  readonly hmcMaturity?: string;
  readonly separateRealRatificationPackageExists?: boolean;
}

export interface H03ClaimEvidenceRoot {
  readonly evidenceId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly purpose: H03EvidencePurpose;
  readonly authorityClass: string;
  readonly truthSource: H03TruthSourceClass;
  readonly required: boolean;
  readonly freshnessStatus: "current" | "stale" | "unavailable" | "conflicting";
  readonly schemaRef?: string;
  readonly schemaSha256?: string;
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
  readonly readiness_mode: H03ReadinessMode;
  readonly claim_eligibility: H03ClaimEligibilityResult | null;
  readonly verified_predecessors: readonly H03VerifiedPredecessor[];
  readonly verified_records: readonly H03VerifiedRecord[];
  readonly completion_gates: readonly H03CompletionGate[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H03ClaimEligibilityResult {
  readonly claim_id: string;
  readonly claimed_posture: string;
  readonly eligibility_result: "passed" | "failed" | "not_applicable_with_reason";
  readonly weakest_mandatory_evidence_maturity: H03EvidencePurpose | null;
  readonly forbidden_evidence_scan: readonly string[];
  readonly root_of_trust_verified: boolean;
  readonly blocking_reasons: readonly string[];
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
const FORBIDDEN_FINAL_REF_PATTERN = /(?:^|["'\s])(?:fixture:\/\/|test:\/\/|example:\/\/)|(?:^|\/)(?:fixtures?|__fixtures__|testdata|examples?)(?:\/|$)/u;
const TRANSIENT_REF_PATTERN = /^(?:tmp|scratch|temp):\/\//u;
const TRANSIENT_ROOT_PATTERN = /(?:^|\/)(?:tmp|var\/folders)(?:\/|$)|\/private\/var\//u;
const HASH_STRING_PATTERN = /^[a-f0-9]{64}$/u;
const PURPOSE_RANK: Record<H03EvidencePurpose, number> = {
  fixture_only: 0,
  test_calibration: 1,
  generated_view: 2,
  implementation_evidence: 3,
  qualification_evidence: 4,
  ratification_candidate: 5,
  ratified_authority: 6,
  release_candidate: 7,
  production_evidence: 8
};
const DEFAULT_FINAL_FORBIDDEN_PURPOSES: readonly H03EvidencePurpose[] = [
  "fixture_only",
  "test_calibration",
  "generated_view"
];
const DEFAULT_FINAL_FORBIDDEN_TRUTH_SOURCES: readonly H03TruthSourceClass[] = [
  "fixture_state",
  "generated_view",
  "runtime_checkpoint",
  "unavailable",
  "stale",
  "conflicting"
];

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
  const readinessMode = config.readinessMode ?? "test_mode";
  const claimEligibility = validateReadinessModeAndClaimEligibility(readinessMode, config, constitution, findings);

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: findings.filter((finding) => finding.kind.endsWith("_mismatch") || finding.kind.includes("stale")),
    constitution_id: constitution?.constitution_id ?? null,
    constitution_content_hash: findings.length === 0 ? constitutionContentHash : null,
    approval_state: approvalResult.approvalState,
    execution_authorization_state: executionResult.executionAuthorizationState,
    execution_authorized: executionResult.executionAuthorized,
    readiness_mode: readinessMode,
    claim_eligibility: claimEligibility,
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

function validateReadinessModeAndClaimEligibility(
  readinessMode: H03ReadinessMode,
  config: H03ConstitutionReadinessConfig,
  constitution: H03DeliveryConstitution | null,
  findings: H03ConstitutionReadinessFinding[]
): H03ClaimEligibilityResult | null {
  if (readinessMode !== "final_mode" && config.finalPostureRecommendation === "H03_RATIFICATION_READY") {
    findings.push({
      kind: "non_final_mode_ratification_ready_forbidden",
      expected: "final_mode",
      actual: readinessMode
    });
  }

  if (!config.terminalClaim) {
    if (readinessMode === "final_mode") {
      findings.push({ kind: "terminal_claim_missing" });
    }
    return null;
  }

  const claim = config.terminalClaim;
  const blockingReasons: string[] = [];
  const forbiddenScan: string[] = [];

  if (readinessMode !== "final_mode" && claim.claimedPosture === "H03_RATIFICATION_READY") {
    findings.push({
      kind: "non_final_mode_ratification_ready_forbidden",
      expected: "final_mode",
      actual: readinessMode
    });
    blockingReasons.push("non_final_mode_ratification_ready_forbidden");
  }

  const mandatoryEvidence = [...claim.requiredAuthorityRoots, ...claim.mandatoryEvidence];
  if (mandatoryEvidence.length === 0) {
    findings.push({ kind: "terminal_claim_mandatory_evidence_missing" });
    blockingReasons.push("terminal_claim_mandatory_evidence_missing");
  }

  const forbiddenPurposes = new Set([
    ...DEFAULT_FINAL_FORBIDDEN_PURPOSES,
    ...claim.forbiddenEvidencePurposes
  ]);
  const forbiddenTruthSources = new Set([
    ...DEFAULT_FINAL_FORBIDDEN_TRUTH_SOURCES,
    ...(claim.forbiddenTruthSources ?? [])
  ]);
  let weakestPurpose: H03EvidencePurpose | null = null;

  for (const evidence of mandatoryEvidence) {
    const evidencePrefix = `terminal_claim.${evidence.evidenceId}`;
    verifyClaimEvidenceRoot(evidencePrefix, evidence, config.logicalRoots, readinessMode === "final_mode", findings, blockingReasons, forbiddenScan);
    if (readinessMode === "final_mode") {
      if (forbiddenPurposes.has(evidence.purpose)) {
        findings.push({ kind: "ineligible_evidence_purpose", ref: evidence.ref, expected: claim.minimumEvidencePurpose, actual: evidence.purpose });
        blockingReasons.push(`ineligible_evidence_purpose:${evidence.evidenceId}`);
      }
      if (forbiddenTruthSources.has(evidence.truthSource)) {
        findings.push({ kind: "ineligible_truth_source", ref: evidence.ref, actual: evidence.truthSource });
        blockingReasons.push(`ineligible_truth_source:${evidence.evidenceId}`);
      }
      if (evidence.freshnessStatus !== "current") {
        findings.push({ kind: "evidence_not_current", ref: evidence.ref, expected: "current", actual: evidence.freshnessStatus });
        blockingReasons.push(`evidence_not_current:${evidence.evidenceId}`);
      }
      if (PURPOSE_RANK[evidence.purpose] < PURPOSE_RANK[claim.minimumEvidencePurpose]) {
        findings.push({ kind: "weakest_evidence_below_claim_minimum", ref: evidence.ref, expected: claim.minimumEvidencePurpose, actual: evidence.purpose });
        blockingReasons.push(`weakest_evidence_below_claim_minimum:${evidence.evidenceId}`);
      }
    }
    weakestPurpose = weakerPurpose(weakestPurpose, evidence.purpose);
  }

  const constitutionText = constitution ? JSON.stringify(constitution) : "";
  if (readinessMode === "final_mode") {
    if (claim.hmcMaturity === "fixture_backed" && !claim.separateRealRatificationPackageExists) {
      findings.push({ kind: "cross_plane_fixture_maturity_blocks_ratification" });
      blockingReasons.push("cross_plane_fixture_maturity_blocks_ratification");
    }
    if (constitution?.constitution_id.toLowerCase().includes("fixture")) {
      findings.push({ kind: "fixture_constitution_id_forbidden", actual: constitution.constitution_id });
      blockingReasons.push("fixture_constitution_id_forbidden");
    }
    if (FORBIDDEN_FINAL_REF_PATTERN.test(constitutionText)) {
      findings.push({ kind: "fixture_ref_in_final_constitution" });
      forbiddenScan.push("fixture_ref_in_final_constitution");
      blockingReasons.push("fixture_ref_in_final_constitution");
    }
    if (hasDummyHashValue(constitution)) {
      findings.push({ kind: "dummy_hash_in_final_constitution" });
      blockingReasons.push("dummy_hash_in_final_constitution");
    }
    if (claim.claimedPosture === "H03_RATIFICATION_READY" && PURPOSE_RANK[weakestPurpose ?? "fixture_only"] < PURPOSE_RANK[claim.minimumEvidencePurpose]) {
      findings.push({
        kind: "claim_maturity_exceeds_weakest_evidence",
        expected: claim.minimumEvidencePurpose,
        actual: weakestPurpose ?? "none"
      });
      blockingReasons.push("claim_maturity_exceeds_weakest_evidence");
    }
  }

  return {
    claim_id: claim.claimId,
    claimed_posture: claim.claimedPosture,
    eligibility_result: blockingReasons.length === 0 ? "passed" : "failed",
    weakest_mandatory_evidence_maturity: weakestPurpose,
    forbidden_evidence_scan: forbiddenScan,
    root_of_trust_verified: blockingReasons.length === 0 && mandatoryEvidence.length > 0,
    blocking_reasons: [...new Set(blockingReasons)]
  };
}

function verifyClaimEvidenceRoot(
  evidencePrefix: string,
  evidence: H03ClaimEvidenceRoot,
  logicalRoots: Record<string, string>,
  strictFinalMode: boolean,
  findings: H03ConstitutionReadinessFinding[],
  blockingReasons: string[],
  forbiddenScan: string[]
): void {
  const hashFinding = validateExpectedHash(evidencePrefix, evidence.sha256);
  if (hashFinding) {
    findings.push(hashFinding);
    blockingReasons.push(`${evidence.evidenceId}:invalid_hash`);
    return;
  }
  if (hasDummyHashString(normalizeSha256(evidence.sha256))) {
    findings.push({ kind: "dummy_sha256", ref: evidence.ref, actual: normalizeSha256(evidence.sha256) });
    blockingReasons.push(`${evidence.evidenceId}:dummy_hash`);
  }
  if (strictFinalMode && FORBIDDEN_FINAL_REF_PATTERN.test(evidence.ref)) {
    findings.push({ kind: "fixture_or_test_ref_forbidden_in_final_root", ref: evidence.ref });
    forbiddenScan.push(evidence.ref);
    blockingReasons.push(`${evidence.evidenceId}:fixture_or_test_ref`);
  }
  if (strictFinalMode && TRANSIENT_REF_PATTERN.test(evidence.ref)) {
    findings.push({ kind: "transient_ref_forbidden", ref: evidence.ref });
    blockingReasons.push(`${evidence.evidenceId}:transient_ref`);
  }
  const path = resolveLogicalRef(evidence.ref, logicalRoots, findings);
  if (!path || !existsSync(path)) {
    findings.push({ kind: "missing_terminal_claim_ref", ref: evidence.ref, actual: path ?? "unresolved" });
    blockingReasons.push(`${evidence.evidenceId}:missing_ref`);
    return;
  }
  const scheme = evidence.ref.split("://", 1)[0] ?? "";
  const root = logicalRoots[scheme];
  if (strictFinalMode && root && TRANSIENT_ROOT_PATTERN.test(normalize(root))) {
    findings.push({ kind: "transient_root_forbidden", ref: evidence.ref, actual: root });
    blockingReasons.push(`${evidence.evidenceId}:transient_root`);
  }
  const text = readFileSync(path, "utf8");
  if (PRIVATE_PATH_PATTERN.test(text)) {
    findings.push({ kind: "private_path_in_terminal_claim_ref", ref: evidence.ref });
    blockingReasons.push(`${evidence.evidenceId}:private_path`);
  }
  if (hasDummyHashValue(JSON.parse(safeJsonOrString(text)))) {
    findings.push({ kind: "dummy_hash_in_terminal_claim_ref", ref: evidence.ref });
    blockingReasons.push(`${evidence.evidenceId}:dummy_hash_in_content`);
  }
  const actualHash = sha256Text(text);
  if (actualHash !== normalizeSha256(evidence.sha256)) {
    findings.push({
      kind: "terminal_claim_ref_hash_mismatch",
      ref: evidence.ref,
      expected: normalizeSha256(evidence.sha256),
      actual: actualHash
    });
    blockingReasons.push(`${evidence.evidenceId}:hash_mismatch`);
  }
}

function safeJsonOrString(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return JSON.stringify(text);
  }
}

function weakerPurpose(current: H03EvidencePurpose | null, candidate: H03EvidencePurpose): H03EvidencePurpose {
  if (!current) return candidate;
  return PURPOSE_RANK[candidate] < PURPOSE_RANK[current] ? candidate : current;
}

function hasDummyHashValue(value: unknown): boolean {
  if (typeof value === "string") return HASH_STRING_PATTERN.test(value) && hasDummyHashString(value);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => hasDummyHashValue(entry));
  return Object.values(value as Record<string, unknown>).some((entry) => hasDummyHashValue(entry));
}

function hasDummyHashString(hash: string): boolean {
  const normalized = normalizeSha256(hash);
  return HASH_STRING_PATTERN.test(normalized) && new Set(normalized.split("")).size === 1;
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
