import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { normalize, relative, resolve } from "node:path";

export type H06LocksCheckpointsQuarantineStatus = "passed" | "failed";
export type H06ExpectedRuntimeRecordStatus = "passed" | "failed";

export interface H06LocksCheckpointsQuarantineConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schemas: H06RuntimeSchemaSet;
  readonly locks: readonly H06RuntimeRecordExpectation[];
  readonly checkpoints: readonly H06RuntimeRecordExpectation[];
  readonly quarantines: readonly H06RuntimeRecordExpectation[];
  readonly expectedProductSha: string;
  readonly expectedTreeHash: string;
  readonly freshnessCheckedAt: string;
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H06RuntimeSchemaSet {
  readonly common: H06RuntimeSchemaDescriptor;
  readonly lock: H06RuntimeSchemaDescriptor;
  readonly checkpoint: H06RuntimeSchemaDescriptor;
  readonly quarantine: H06RuntimeSchemaDescriptor;
}

export interface H06RuntimeSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H06RuntimeRecordExpectation {
  readonly recordId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H06ExpectedRuntimeRecordStatus;
  readonly collisionRole?: "holder" | "contender";
  readonly expectedFindingKinds?: readonly string[];
}

export interface H06LocksCheckpointsQuarantineReport {
  readonly status: H06LocksCheckpointsQuarantineStatus;
  readonly findings: readonly H06LocksCheckpointsQuarantineFinding[];
  readonly classified_mismatches: readonly H06LocksCheckpointsQuarantineFinding[];
  readonly verified_refs: readonly H06VerifiedRuntimeRef[];
  readonly hash_failures: readonly H06LocksCheckpointsQuarantineFinding[];
  readonly lock_results: readonly H06RuntimeValidationResult[];
  readonly checkpoint_results: readonly H06RuntimeValidationResult[];
  readonly quarantine_results: readonly H06RuntimeValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H06RuntimeValidationResult {
  readonly recordId: string;
  readonly ref: string;
  readonly recordType: H06RuntimeRecordType;
  readonly status: H06ExpectedRuntimeRecordStatus;
  readonly expectedStatus: H06ExpectedRuntimeRecordStatus;
  readonly runtimeStatus: string | null;
  readonly findingKinds: readonly string[];
}

export interface H06VerifiedRuntimeRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "runtime_record";
}

export interface H06LocksCheckpointsQuarantineFinding {
  readonly kind: string;
  readonly recordId?: string;
  readonly recordType?: H06RuntimeRecordType;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

type H06RuntimeRecordType = "lock" | "checkpoint" | "quarantine";

interface H06RuntimeLockRecord {
  readonly schema_version: string;
  readonly lock_id: string;
  readonly lock_type: string;
  readonly resource_ref: string;
  readonly owner_ref: string;
  readonly scope: string;
  readonly acquired_at: string;
  readonly expires_at: string;
  readonly status: "active" | "released" | "stale" | "blocked" | "superseded";
  readonly stale_policy: string;
  readonly release_policy: string;
  readonly cannot_claim: readonly string[];
}

interface H06RuntimeCheckpointRecord {
  readonly schema_version: string;
  readonly checkpoint_id: string;
  readonly box_id: string;
  readonly ffet_id: string;
  readonly product_sha: string;
  readonly tree_hash: string;
  readonly control_state_hash: string;
  readonly evidence_state_hash: string;
  readonly runtime_state_hash: string;
  readonly resume_part: string;
  readonly rollback_ref: string;
  readonly freshness_status: "fresh" | "stale" | "superseded" | "unknown" | "not_applicable_with_reason";
  readonly cannot_claim: readonly string[];
}

interface H06RuntimeQuarantineRecord {
  readonly schema_version: string;
  readonly quarantine_id: string;
  readonly incident_type: string;
  readonly affected_paths_or_resources: readonly string[];
  readonly source_worktree_ref: string;
  readonly detected_at: string;
  readonly evidence_ref?: {
    readonly ref?: string;
    readonly sha256?: string;
  };
  readonly disposition: "contained" | "cleanup_pending" | "human_decision_required" | "released" | "superseded";
  readonly cleanup_allowed: boolean;
  readonly human_decision_required: boolean;
  readonly cannot_claim: readonly string[];
}

interface LoadedRuntimeRecord<TRecord> {
  readonly expectation: H06RuntimeRecordExpectation;
  readonly record: TRecord | null;
  readonly text: string | null;
  readonly path: string | null;
  readonly findings: H06LocksCheckpointsQuarantineFinding[];
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const PRODUCTION_ORCHESTRATION_CLAIM_PATTERN =
  /\b(?:production[_\s-]+resource[_\s-]+orchestration|production[_\s-]+ready|release[_\s-]+candidate|self[_\s-]+hosting[_\s-]+ready)\b/iu;
const FUTURE_CAPABILITY_CLAIM_PATTERNS: readonly [RegExp, string][] = [
  [/\b(?:stable[_\s-]+agents?|mechanically[_\s-]+independent[_\s-]+agents?)\b/iu, "agent_independence_or_stability_overclaim"],
  [/\b(?:H07[_\s-]+proof[_\s-]+engine|H08[_\s/-]+git[_\s/-]+ci[_\s/-]+pr[_\s-]+merge[_\s-]+conductor)\b/iu, "future_box_capability_overclaim"]
];

export function verifyH06LocksCheckpointsQuarantineConfig(
  config: H06LocksCheckpointsQuarantineConfig
): H06LocksCheckpointsQuarantineReport {
  const findings: H06LocksCheckpointsQuarantineFinding[] = [];
  const classifiedMismatches: H06LocksCheckpointsQuarantineFinding[] = [];
  const verifiedRefs: H06VerifiedRuntimeRef[] = [];
  const validators = loadSchemaValidators(config, findings, verifiedRefs);

  const loadedLocks = config.locks.map((expectation) =>
    loadRuntimeRecord<H06RuntimeLockRecord>(config, expectation, "lock", validators.lock, isRuntimeLockRecord, verifiedRefs)
  );
  addWriteSetCollisionFindings(loadedLocks);
  const lockResults = loadedLocks.map((loaded) =>
    finishRuntimeResult(loaded.expectation, "lock", loaded.record?.status ?? null, loaded.findings, findings, classifiedMismatches)
  );

  const checkpointResults = config.checkpoints.map((expectation) => {
    const loaded = loadRuntimeRecord<H06RuntimeCheckpointRecord>(
      config,
      expectation,
      "checkpoint",
      validators.checkpoint,
      isRuntimeCheckpointRecord,
      verifiedRefs
    );
    if (loaded.record) {
      loaded.findings.push(...checkpointSemanticFindings(config, expectation, loaded.record));
    }
    return finishRuntimeResult(
      expectation,
      "checkpoint",
      loaded.record?.freshness_status ?? null,
      loaded.findings,
      findings,
      classifiedMismatches
    );
  });

  const quarantineResults = config.quarantines.map((expectation) => {
    const loaded = loadRuntimeRecord<H06RuntimeQuarantineRecord>(
      config,
      expectation,
      "quarantine",
      validators.quarantine,
      isRuntimeQuarantineRecord,
      verifiedRefs
    );
    if (loaded.record) {
      loaded.findings.push(...quarantineSemanticFindings(config, expectation, loaded.record));
    }
    return finishRuntimeResult(
      expectation,
      "quarantine",
      loaded.record?.disposition ?? null,
      loaded.findings,
      findings,
      classifiedMismatches
    );
  });

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
    lock_results: lockResults,
    checkpoint_results: checkpointResults,
    quarantine_results: quarantineResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidators(
  config: H06LocksCheckpointsQuarantineConfig,
  findings: H06LocksCheckpointsQuarantineFinding[],
  verifiedRefs: H06VerifiedRuntimeRef[]
): Record<H06RuntimeRecordType, ValidateFunction<unknown> | null> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const commonSchema = loadSchema(config, config.schemas.common, findings, verifiedRefs);
  if (commonSchema) {
    try {
      ajv.addSchema(commonSchema as AnySchema);
    } catch (error) {
      findings.push({ kind: "common_schema_compile_failed", detail: errorDetail(error) });
    }
  }

  return {
    lock: compileSchema(config, config.schemas.lock, ajv, findings, verifiedRefs),
    checkpoint: compileSchema(config, config.schemas.checkpoint, ajv, findings, verifiedRefs),
    quarantine: compileSchema(config, config.schemas.quarantine, ajv, findings, verifiedRefs)
  };
}

function compileSchema(
  config: H06LocksCheckpointsQuarantineConfig,
  schema: H06RuntimeSchemaDescriptor,
  ajv: Ajv2020,
  findings: H06LocksCheckpointsQuarantineFinding[],
  verifiedRefs: H06VerifiedRuntimeRef[]
): ValidateFunction<unknown> | null {
  const parsedSchema = loadSchema(config, schema, findings, verifiedRefs);
  if (!parsedSchema) return null;
  try {
    return ajv.compile(parsedSchema as AnySchema);
  } catch (error) {
    findings.push({ kind: "schema_compile_failed", ref: schema.ref, detail: errorDetail(error) });
    return null;
  }
}

function loadSchema(
  config: H06LocksCheckpointsQuarantineConfig,
  schema: H06RuntimeSchemaDescriptor,
  findings: H06LocksCheckpointsQuarantineFinding[],
  verifiedRefs: H06VerifiedRuntimeRef[]
): unknown | null {
  const hashFinding = validateSha256(schema.sha256, "schema_hash_invalid");
  if (hashFinding) {
    findings.push({ ...hashFinding, ref: schema.ref });
    return null;
  }

  const schemaPath = resolveLogicalRef(schema.ref, config.logicalRoots, findings);
  if (!schemaPath) return null;
  if (!existsSync(schemaPath)) {
    findings.push({ kind: "schema_missing", ref: schema.ref, path: schemaPath });
    return null;
  }

  const schemaText = readFileSync(schemaPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(schemaText)) {
    findings.push({ kind: "private_path_in_schema", ref: schema.ref, path: schemaPath });
    return null;
  }

  const actualHash = sha256Text(schemaText);
  const expectedHash = normalizeSha256(schema.sha256);
  if (actualHash !== expectedHash) {
    findings.push({
      kind: "schema_hash_mismatch",
      ref: schema.ref,
      path: schemaPath,
      expected: expectedHash,
      actual: actualHash
    });
    return null;
  }

  verifiedRefs.push({ ref: schema.ref, path: schemaPath, sha256: actualHash, source: "schema" });
  return parseJson(schemaText, schema.ref, findings);
}

function loadRuntimeRecord<TRecord extends { readonly cannot_claim: readonly string[] }>(
  config: H06LocksCheckpointsQuarantineConfig,
  expectation: H06RuntimeRecordExpectation,
  recordType: H06RuntimeRecordType,
  schemaValidator: ValidateFunction<unknown> | null,
  isRecord: (value: unknown) => value is TRecord,
  verifiedRefs: H06VerifiedRuntimeRef[]
): LoadedRuntimeRecord<TRecord> {
  const recordFindings: H06LocksCheckpointsQuarantineFinding[] = [];
  const recordPath = resolveLogicalRef(expectation.ref, config.logicalRoots, recordFindings);
  if (!recordPath || !existsSync(recordPath)) {
    const missingFinding: H06LocksCheckpointsQuarantineFinding = {
      kind: `${recordType}_record_missing`,
      recordType,
      recordId: expectation.recordId,
      ref: expectation.ref
    };
    recordFindings.push(recordPath ? { ...missingFinding, path: recordPath } : missingFinding);
    return { expectation, record: null, text: null, path: recordPath, findings: recordFindings };
  }

  const hashFinding = validateSha256(expectation.sha256, `${recordType}_record_hash_invalid`);
  if (hashFinding) {
    recordFindings.push({ ...hashFinding, recordType, recordId: expectation.recordId, ref: expectation.ref });
  }

  const recordText = readFileSync(recordPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(recordText)) {
    recordFindings.push({
      kind: `private_path_in_${recordType}_record`,
      recordType,
      recordId: expectation.recordId,
      ref: expectation.ref,
      path: recordPath
    });
  }

  const actualHash = sha256Text(recordText);
  const expectedHash = normalizeSha256(expectation.sha256);
  if (!hashFinding && actualHash !== expectedHash) {
    recordFindings.push({
      kind: `${recordType}_record_hash_mismatch`,
      recordType,
      recordId: expectation.recordId,
      ref: expectation.ref,
      path: recordPath,
      expected: expectedHash,
      actual: actualHash
    });
  }

  const parsed = parseJson(recordText, expectation.ref, recordFindings);
  if (!parsed) {
    return { expectation, record: null, text: recordText, path: recordPath, findings: recordFindings };
  }

  if (schemaValidator) {
    const schemaValid = schemaValidator(parsed);
    if (!schemaValid) {
      recordFindings.push({
        kind: "schema_validation_failed",
        recordType,
        recordId: expectation.recordId,
        ref: expectation.ref,
        detail: formatAjvErrors(schemaValidator.errors)
      });
    }
  } else {
    recordFindings.push({ kind: "schema_validator_unavailable", recordType, recordId: expectation.recordId, ref: expectation.ref });
  }

  if (!hashFinding && actualHash === expectedHash) {
    verifiedRefs.push({ ref: expectation.ref, path: recordPath, sha256: actualHash, source: "runtime_record" });
  }

  if (!isRecord(parsed)) {
    recordFindings.push({ kind: `${recordType}_record_shape_unavailable`, recordType, recordId: expectation.recordId, ref: expectation.ref });
    return { expectation, record: null, text: recordText, path: recordPath, findings: recordFindings };
  }

  recordFindings.push(...sharedRuntimeRecordFindings(config, expectation, recordType, parsed));
  if (recordType === "lock") {
    recordFindings.push(...lockSemanticFindings(config, expectation, parsed as unknown as H06RuntimeLockRecord));
  }

  const claimText = claimBearingText(recordType, parsed);
  if (PRODUCTION_ORCHESTRATION_CLAIM_PATTERN.test(claimText)) {
    recordFindings.push({ kind: "production_or_future_posture_overclaim", recordType, recordId: expectation.recordId, ref: expectation.ref });
  }
  for (const [pattern, kind] of FUTURE_CAPABILITY_CLAIM_PATTERNS) {
    if (pattern.test(claimText)) {
      recordFindings.push({ kind, recordType, recordId: expectation.recordId, ref: expectation.ref });
    }
  }

  return { expectation, record: parsed, text: recordText, path: recordPath, findings: recordFindings };
}

function sharedRuntimeRecordFindings(
  config: H06LocksCheckpointsQuarantineConfig,
  expectation: H06RuntimeRecordExpectation,
  recordType: H06RuntimeRecordType,
  record: { readonly cannot_claim: readonly string[] }
): H06LocksCheckpointsQuarantineFinding[] {
  const findings: H06LocksCheckpointsQuarantineFinding[] = [];
  for (const claim of config.requiredCannotClaim ?? []) {
    if (!record.cannot_claim.includes(claim)) {
      findings.push({ kind: "required_cannot_claim_missing", recordType, recordId: expectation.recordId, ref: expectation.ref, expected: claim });
    }
  }
  return findings;
}

function lockSemanticFindings(
  config: H06LocksCheckpointsQuarantineConfig,
  expectation: H06RuntimeRecordExpectation,
  record: H06RuntimeLockRecord
): H06LocksCheckpointsQuarantineFinding[] {
  const findings: H06LocksCheckpointsQuarantineFinding[] = [];
  if (record.lock_id !== expectation.recordId) {
    findings.push({
      kind: "lock_id_mismatch",
      recordType: "lock",
      recordId: expectation.recordId,
      ref: expectation.ref,
      expected: expectation.recordId,
      actual: record.lock_id
    });
  }

  const checkedAt = Date.parse(config.freshnessCheckedAt);
  const expiresAt = Date.parse(record.expires_at);
  if (record.status === "active" && Number.isFinite(checkedAt) && Number.isFinite(expiresAt) && expiresAt <= checkedAt) {
    findings.push({ kind: "stale_active_lock", recordType: "lock", recordId: expectation.recordId, ref: expectation.ref });
  }

  if (record.status === "stale" && !/\b(?:release|quarantine|cleanup|supersede)\b/iu.test(record.stale_policy)) {
    findings.push({ kind: "stale_lock_without_disposition_policy", recordType: "lock", recordId: expectation.recordId, ref: expectation.ref });
  }

  if (record.status === "released" && !/\b(?:released|cleanup|removed)\b/iu.test(record.release_policy)) {
    findings.push({ kind: "released_lock_without_release_policy", recordType: "lock", recordId: expectation.recordId, ref: expectation.ref });
  }

  if (record.lock_type === "file_write_set" && !record.resource_ref.startsWith("product://")) {
    findings.push({
      kind: "write_set_lock_resource_not_product_ref",
      recordType: "lock",
      recordId: expectation.recordId,
      ref: expectation.ref,
      actual: record.resource_ref
    });
  }

  return findings;
}

function addWriteSetCollisionFindings(loadedLocks: readonly LoadedRuntimeRecord<H06RuntimeLockRecord>[]): void {
  const activeWriteSets = new Map<string, LoadedRuntimeRecord<H06RuntimeLockRecord>[]>();
  for (const loaded of loadedLocks) {
    if (!loaded.record || loaded.record.lock_type !== "file_write_set" || loaded.record.status !== "active") continue;
    const existing = activeWriteSets.get(loaded.record.resource_ref) ?? [];
    existing.push(loaded);
    activeWriteSets.set(loaded.record.resource_ref, existing);
  }

  for (const [resourceRef, records] of activeWriteSets) {
    if (records.length < 2) continue;
    for (const loaded of records) {
      if (loaded.expectation.collisionRole === "holder") continue;
      loaded.findings.push({
        kind: "write_set_collision_detected",
        recordType: "lock",
        recordId: loaded.expectation.recordId,
        ref: loaded.expectation.ref,
        actual: resourceRef
      });
    }
  }
}

function claimBearingText(recordType: H06RuntimeRecordType, value: unknown): string {
  if (recordType === "lock" && isRuntimeLockRecord(value)) {
    return [
      value.lock_type,
      value.resource_ref,
      value.owner_ref,
      value.scope,
      value.stale_policy,
      value.release_policy,
      value.status
    ].join(" ");
  }
  if (recordType === "checkpoint" && isRuntimeCheckpointRecord(value)) {
    return [
      value.box_id,
      value.ffet_id,
      value.resume_part,
      value.rollback_ref,
      value.freshness_status
    ].join(" ");
  }
  if (recordType === "quarantine" && isRuntimeQuarantineRecord(value)) {
    return [
      value.incident_type,
      ...value.affected_paths_or_resources,
      value.source_worktree_ref,
      value.disposition
    ].join(" ");
  }
  return JSON.stringify(value);
}

function checkpointSemanticFindings(
  config: H06LocksCheckpointsQuarantineConfig,
  expectation: H06RuntimeRecordExpectation,
  record: H06RuntimeCheckpointRecord
): H06LocksCheckpointsQuarantineFinding[] {
  const findings: H06LocksCheckpointsQuarantineFinding[] = [];
  if (record.checkpoint_id !== expectation.recordId) {
    findings.push({
      kind: "checkpoint_id_mismatch",
      recordType: "checkpoint",
      recordId: expectation.recordId,
      ref: expectation.ref,
      expected: expectation.recordId,
      actual: record.checkpoint_id
    });
  }
  if (record.product_sha !== config.expectedProductSha) {
    findings.push({
      kind: "checkpoint_product_sha_stale",
      recordType: "checkpoint",
      recordId: expectation.recordId,
      ref: expectation.ref,
      expected: config.expectedProductSha,
      actual: record.product_sha
    });
  }
  if (record.tree_hash !== config.expectedTreeHash) {
    findings.push({
      kind: "checkpoint_tree_hash_stale",
      recordType: "checkpoint",
      recordId: expectation.recordId,
      ref: expectation.ref,
      expected: config.expectedTreeHash,
      actual: record.tree_hash
    });
  }
  for (const [field, value] of [
    ["control_state_hash", record.control_state_hash],
    ["evidence_state_hash", record.evidence_state_hash],
    ["runtime_state_hash", record.runtime_state_hash]
  ] as const) {
    const hashFinding = validateSha256(value, "checkpoint_state_hash_invalid");
    if (hashFinding) {
      findings.push({
        ...hashFinding,
        kind: hashFinding.kind.includes("placeholder") ? "checkpoint_placeholder_state_hash" : hashFinding.kind,
        recordType: "checkpoint",
        recordId: expectation.recordId,
        ref: expectation.ref,
        detail: field
      });
    }
  }
  if (record.freshness_status !== "fresh") {
    findings.push({
      kind: "checkpoint_freshness_not_fresh",
      recordType: "checkpoint",
      recordId: expectation.recordId,
      ref: expectation.ref,
      actual: record.freshness_status
    });
  }
  if (!record.resume_part.includes("PART-09")) {
    findings.push({
      kind: "checkpoint_resume_part_unexpected",
      recordType: "checkpoint",
      recordId: expectation.recordId,
      ref: expectation.ref,
      actual: record.resume_part
    });
  }
  return findings;
}

function quarantineSemanticFindings(
  config: H06LocksCheckpointsQuarantineConfig,
  expectation: H06RuntimeRecordExpectation,
  record: H06RuntimeQuarantineRecord
): H06LocksCheckpointsQuarantineFinding[] {
  const findings: H06LocksCheckpointsQuarantineFinding[] = [];
  if (record.quarantine_id !== expectation.recordId) {
    findings.push({
      kind: "quarantine_id_mismatch",
      recordType: "quarantine",
      recordId: expectation.recordId,
      ref: expectation.ref,
      expected: expectation.recordId,
      actual: record.quarantine_id
    });
  }
  for (const affected of record.affected_paths_or_resources) {
    if (affected.startsWith("/") || affected.startsWith("file://")) {
      findings.push({ kind: "absolute_affected_path", recordType: "quarantine", recordId: expectation.recordId, ref: expectation.ref, actual: affected });
    }
  }
  if (!record.evidence_ref?.ref || !record.evidence_ref?.sha256) {
    findings.push({ kind: "quarantine_evidence_hash_missing", recordType: "quarantine", recordId: expectation.recordId, ref: expectation.ref });
  } else {
    const evidenceHashFinding = validateSha256(record.evidence_ref.sha256, "quarantine_evidence_hash_invalid");
    if (evidenceHashFinding) {
      findings.push({ ...evidenceHashFinding, recordType: "quarantine", recordId: expectation.recordId, ref: expectation.ref });
    }
  }
  if (record.incident_type === "secret_exposure" && record.cleanup_allowed) {
    findings.push({ kind: "secret_exposure_cleanup_allowed_without_human_decision", recordType: "quarantine", recordId: expectation.recordId, ref: expectation.ref });
  }
  if (record.human_decision_required && record.cleanup_allowed) {
    findings.push({ kind: "human_required_cleanup_allowed", recordType: "quarantine", recordId: expectation.recordId, ref: expectation.ref });
  }
  if (record.disposition === "released" && record.human_decision_required) {
    findings.push({ kind: "released_quarantine_still_requires_human", recordType: "quarantine", recordId: expectation.recordId, ref: expectation.ref });
  }
  if (record.disposition === "cleanup_pending" && !record.human_decision_required && !record.cleanup_allowed) {
    findings.push({ kind: "cleanup_pending_without_path_to_resolution", recordType: "quarantine", recordId: expectation.recordId, ref: expectation.ref });
  }
  if (record.source_worktree_ref.includes("product://runtime")) {
    findings.push({ kind: "quarantine_source_inside_product_runtime", recordType: "quarantine", recordId: expectation.recordId, ref: expectation.ref });
  }
  return findings.concat(sharedRuntimeRecordFindings(config, expectation, "quarantine", record));
}

function finishRuntimeResult(
  expectation: H06RuntimeRecordExpectation,
  recordType: H06RuntimeRecordType,
  runtimeStatus: string | null,
  recordFindings: H06LocksCheckpointsQuarantineFinding[],
  findings: H06LocksCheckpointsQuarantineFinding[],
  classifiedMismatches: H06LocksCheckpointsQuarantineFinding[]
): H06RuntimeValidationResult {
  const actualStatus: H06ExpectedRuntimeRecordStatus = recordFindings.length === 0 ? "passed" : "failed";
  const findingKinds = recordFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: `${recordType}_record_status_unexpected`,
      recordType,
      recordId: expectation.recordId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus,
      detail: findingKinds.join(",")
    });
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...recordFindings);
    for (const expectedKind of expectation.expectedFindingKinds ?? []) {
      if (!findingKinds.includes(expectedKind)) {
        findings.push({
          kind: "expected_negative_finding_missing",
          recordType,
          recordId: expectation.recordId,
          ref: expectation.ref,
          expected: expectedKind,
          actual: findingKinds.join(",")
        });
      }
    }
  } else {
    findings.push(...recordFindings);
  }

  return {
    recordId: expectation.recordId,
    ref: expectation.ref,
    recordType,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    runtimeStatus,
    findingKinds
  };
}

function isRuntimeLockRecord(value: unknown): value is H06RuntimeLockRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<H06RuntimeLockRecord>;
  return (
    typeof candidate.schema_version === "string" &&
    typeof candidate.lock_id === "string" &&
    typeof candidate.lock_type === "string" &&
    typeof candidate.resource_ref === "string" &&
    typeof candidate.owner_ref === "string" &&
    typeof candidate.scope === "string" &&
    typeof candidate.acquired_at === "string" &&
    typeof candidate.expires_at === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.stale_policy === "string" &&
    typeof candidate.release_policy === "string" &&
    Array.isArray(candidate.cannot_claim)
  );
}

function isRuntimeCheckpointRecord(value: unknown): value is H06RuntimeCheckpointRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<H06RuntimeCheckpointRecord>;
  return (
    typeof candidate.schema_version === "string" &&
    typeof candidate.checkpoint_id === "string" &&
    typeof candidate.box_id === "string" &&
    typeof candidate.ffet_id === "string" &&
    typeof candidate.product_sha === "string" &&
    typeof candidate.tree_hash === "string" &&
    typeof candidate.control_state_hash === "string" &&
    typeof candidate.evidence_state_hash === "string" &&
    typeof candidate.runtime_state_hash === "string" &&
    typeof candidate.resume_part === "string" &&
    typeof candidate.rollback_ref === "string" &&
    typeof candidate.freshness_status === "string" &&
    Array.isArray(candidate.cannot_claim)
  );
}

function isRuntimeQuarantineRecord(value: unknown): value is H06RuntimeQuarantineRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<H06RuntimeQuarantineRecord>;
  return (
    typeof candidate.schema_version === "string" &&
    typeof candidate.quarantine_id === "string" &&
    typeof candidate.incident_type === "string" &&
    Array.isArray(candidate.affected_paths_or_resources) &&
    typeof candidate.source_worktree_ref === "string" &&
    typeof candidate.detected_at === "string" &&
    typeof candidate.disposition === "string" &&
    typeof candidate.cleanup_allowed === "boolean" &&
    typeof candidate.human_decision_required === "boolean" &&
    Array.isArray(candidate.cannot_claim)
  );
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H06LocksCheckpointsQuarantineFinding[]
): string | null {
  if (ref.startsWith("/") || ref.startsWith("file://")) {
    findings.push({ kind: "absolute_or_file_ref_forbidden", ref });
    return null;
  }

  const [scheme, rest] = ref.split("://", 2);
  if (!scheme || rest === undefined) {
    findings.push({ kind: "logical_ref_scheme_missing", ref });
    return null;
  }

  const root = logicalRoots[scheme];
  if (!root) {
    findings.push({ kind: "logical_root_missing", ref, detail: scheme });
    return null;
  }

  const rootPath = resolve(root);
  const resolvedPath = resolve(rootPath, rest);
  if (relative(rootPath, resolvedPath).startsWith("..")) {
    findings.push({ kind: "logical_path_escape", ref, path: resolvedPath });
    return null;
  }
  return normalize(resolvedPath);
}

function parseJson(
  text: string,
  ref: string,
  findings: H06LocksCheckpointsQuarantineFinding[]
): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    findings.push({ kind: "json_parse_failed", ref, detail: errorDetail(error) });
    return null;
  }
}

function validateSha256(value: string, kindPrefix: string): H06LocksCheckpointsQuarantineFinding | null {
  if (PLACEHOLDER_PATTERN.test(value)) {
    return { kind: `${kindPrefix}_placeholder`, actual: value };
  }
  if (!SHA256_PATTERN.test(value)) {
    return { kind: kindPrefix, actual: value };
  }
  const normalized = normalizeSha256(value);
  if (
    normalized === "0000000000000000000000000000000000000000000000000000000000000000" ||
    normalized === "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  ) {
    return { kind: `${kindPrefix}_stale_or_sentinel`, actual: value };
  }
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function formatAjvErrors(errors: ValidateFunction<unknown>["errors"]): string {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ");
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isGitSha(value: string): boolean {
  return GIT_SHA_PATTERN.test(value);
}
