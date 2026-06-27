import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { normalize, relative, resolve } from "node:path";

export type H06PodSchedulerStatus = "passed" | "failed";
export type H06ExpectedPodSchedulerStatus = "passed" | "failed";

export interface H06PodSchedulerConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schemas: H06PodSchedulerSchemaSet;
  readonly pods: readonly H06PodSchedulerExpectation[];
  readonly expectedBoxId?: string;
  readonly blockedFfetRefs?: readonly string[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H06PodSchedulerSchemaSet {
  readonly common: H06PodSchedulerSchemaDescriptor;
  readonly pod: H06PodSchedulerSchemaDescriptor;
}

export interface H06PodSchedulerSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H06PodSchedulerExpectation {
  readonly recordId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H06ExpectedPodSchedulerStatus;
  readonly collisionRole?: "holder" | "contender";
  readonly expectedFindingKinds?: readonly string[];
}

export interface H06PodSchedulerReport {
  readonly status: H06PodSchedulerStatus;
  readonly findings: readonly H06PodSchedulerFinding[];
  readonly classified_mismatches: readonly H06PodSchedulerFinding[];
  readonly verified_refs: readonly H06VerifiedPodSchedulerRef[];
  readonly hash_failures: readonly H06PodSchedulerFinding[];
  readonly pod_results: readonly H06PodSchedulerValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H06PodSchedulerValidationResult {
  readonly recordId: string;
  readonly ref: string;
  readonly status: H06ExpectedPodSchedulerStatus;
  readonly expectedStatus: H06ExpectedPodSchedulerStatus;
  readonly admissionResult: string | null;
  readonly collisionResult: string | null;
  readonly serialFallback: boolean | null;
  readonly findingKinds: readonly string[];
}

export interface H06VerifiedPodSchedulerRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "pod_record";
}

export interface H06PodSchedulerFinding {
  readonly kind: string;
  readonly recordId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H06PodSchedulerRecord {
  readonly schema_version: string;
  readonly pod_id: string;
  readonly box_id: string;
  readonly role_refs: readonly string[];
  readonly ffet_refs: readonly string[];
  readonly write_set: readonly string[];
  readonly shared_resources: readonly string[];
  readonly admission_result: "admitted" | "blocked" | "queued" | "serial_fallback";
  readonly collision_result: "none" | "detected" | "unable_to_verify";
  readonly serial_fallback: boolean;
  readonly runtime_refs: readonly H06RuntimeRefHash[];
  readonly cannot_claim: readonly string[];
}

interface H06RuntimeRefHash {
  readonly ref: string;
  readonly sha256: string;
}

interface LoadedPodRecord {
  readonly expectation: H06PodSchedulerExpectation;
  readonly record: H06PodSchedulerRecord | null;
  readonly path: string | null;
  readonly findings: H06PodSchedulerFinding[];
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const FORBIDDEN_CLAIM_PATTERNS: readonly [RegExp, string][] = [
  [
    /\b(?:production[_\s-]+resource[_\s-]+orchestration|production[_\s-]+ready|release[_\s-]+candidate|self[_\s-]+hosting[_\s-]+ready)\b/iu,
    "production_or_future_posture_overclaim"
  ],
  [/\b(?:stable[_\s-]+agents?|mechanically[_\s-]+independent[_\s-]+agents?)\b/iu, "agent_independence_or_stability_overclaim"],
  [
    /\b(?:H07[_\s-]+proof[_\s-]+engine|H08[_\s/-]+git[_\s/-]+ci[_\s/-]+pr[_\s-]+merge[_\s-]+conductor)(?:[_\s-]+implemented)?\b/iu,
    "future_box_capability_overclaim"
  ]
];

export function verifyH06PodSchedulerConfig(config: H06PodSchedulerConfig): H06PodSchedulerReport {
  const findings: H06PodSchedulerFinding[] = [];
  const classifiedMismatches: H06PodSchedulerFinding[] = [];
  const verifiedRefs: H06VerifiedPodSchedulerRef[] = [];
  const podValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const loadedPods = config.pods.map((expectation) => loadPodRecord(config, expectation, podValidator, verifiedRefs));

  addWriteSetOverlapFindings(loadedPods);

  const podResults = loadedPods.map((loaded) =>
    finishPodResult(loaded.expectation, loaded.record, loaded.findings, findings, classifiedMismatches)
  );

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
    pod_results: podResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H06PodSchedulerConfig,
  findings: H06PodSchedulerFinding[],
  verifiedRefs: H06VerifiedPodSchedulerRef[]
): ValidateFunction<unknown> | null {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const commonSchema = loadSchema(config, config.schemas.common, findings, verifiedRefs);
  if (!commonSchema) return null;
  try {
    ajv.addSchema(commonSchema as AnySchema);
  } catch (error) {
    findings.push({ kind: "common_schema_compile_failed", detail: errorDetail(error) });
    return null;
  }

  const podSchema = loadSchema(config, config.schemas.pod, findings, verifiedRefs);
  if (!podSchema) return null;
  try {
    return ajv.compile(podSchema as AnySchema);
  } catch (error) {
    findings.push({ kind: "schema_compile_failed", ref: config.schemas.pod.ref, detail: errorDetail(error) });
    return null;
  }
}

function loadSchema(
  config: H06PodSchedulerConfig,
  schema: H06PodSchedulerSchemaDescriptor,
  findings: H06PodSchedulerFinding[],
  verifiedRefs: H06VerifiedPodSchedulerRef[]
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
    findings.push({ kind: "schema_hash_mismatch", ref: schema.ref, path: schemaPath, expected: expectedHash, actual: actualHash });
    return null;
  }

  verifiedRefs.push({ ref: schema.ref, path: schemaPath, sha256: actualHash, source: "schema" });
  return parseJson(schemaText, schema.ref, findings);
}

function loadPodRecord(
  config: H06PodSchedulerConfig,
  expectation: H06PodSchedulerExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  verifiedRefs: H06VerifiedPodSchedulerRef[]
): LoadedPodRecord {
  const recordFindings: H06PodSchedulerFinding[] = [];
  const recordPath = resolveLogicalRef(expectation.ref, config.logicalRoots, recordFindings);
  if (!recordPath || !existsSync(recordPath)) {
    const missingFinding: H06PodSchedulerFinding = {
      kind: "pod_record_missing",
      recordId: expectation.recordId,
      ref: expectation.ref
    };
    recordFindings.push(recordPath ? { ...missingFinding, path: recordPath } : missingFinding);
    return { expectation, record: null, path: recordPath, findings: recordFindings };
  }

  const hashFinding = validateSha256(expectation.sha256, "pod_record_hash_invalid");
  if (hashFinding) {
    recordFindings.push({ ...hashFinding, recordId: expectation.recordId, ref: expectation.ref });
  }

  const recordText = readFileSync(recordPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(recordText)) {
    recordFindings.push({ kind: "private_path_in_pod_record", recordId: expectation.recordId, ref: expectation.ref, path: recordPath });
  }

  const actualHash = sha256Text(recordText);
  const expectedHash = normalizeSha256(expectation.sha256);
  if (!hashFinding && actualHash !== expectedHash) {
    recordFindings.push({
      kind: "pod_record_hash_mismatch",
      recordId: expectation.recordId,
      ref: expectation.ref,
      path: recordPath,
      expected: expectedHash,
      actual: actualHash
    });
  }

  const parsed = parseJson(recordText, expectation.ref, recordFindings);
  if (!parsed) {
    return { expectation, record: null, path: recordPath, findings: recordFindings };
  }

  if (schemaValidator) {
    const schemaValid = schemaValidator(parsed);
    if (!schemaValid) {
      recordFindings.push({
        kind: "schema_validation_failed",
        recordId: expectation.recordId,
        ref: expectation.ref,
        detail: formatAjvErrors(schemaValidator.errors)
      });
    }
  } else {
    recordFindings.push({ kind: "schema_validator_unavailable", recordId: expectation.recordId, ref: expectation.ref });
  }

  if (!hashFinding && actualHash === expectedHash) {
    verifiedRefs.push({ ref: expectation.ref, path: recordPath, sha256: actualHash, source: "pod_record" });
  }

  if (!isPodSchedulerRecord(parsed)) {
    recordFindings.push({ kind: "pod_record_shape_unavailable", recordId: expectation.recordId, ref: expectation.ref });
    return { expectation, record: null, path: recordPath, findings: recordFindings };
  }

  recordFindings.push(...podSemanticFindings(config, expectation, parsed));
  const claimText = claimBearingText(parsed);
  for (const [pattern, kind] of FORBIDDEN_CLAIM_PATTERNS) {
    if (pattern.test(claimText)) {
      recordFindings.push({ kind, recordId: expectation.recordId, ref: expectation.ref });
    }
  }

  return { expectation, record: parsed, path: recordPath, findings: recordFindings };
}

function podSemanticFindings(
  config: H06PodSchedulerConfig,
  expectation: H06PodSchedulerExpectation,
  record: H06PodSchedulerRecord
): H06PodSchedulerFinding[] {
  const findings: H06PodSchedulerFinding[] = [];
  if (record.pod_id !== expectation.recordId) {
    findings.push({ kind: "pod_id_mismatch", recordId: expectation.recordId, ref: expectation.ref, expected: expectation.recordId, actual: record.pod_id });
  }
  if (config.expectedBoxId && record.box_id !== config.expectedBoxId) {
    findings.push({ kind: "box_id_mismatch", recordId: expectation.recordId, ref: expectation.ref, expected: config.expectedBoxId, actual: record.box_id });
  }
  if (record.role_refs.length === 0) {
    findings.push({ kind: "role_refs_missing", recordId: expectation.recordId, ref: expectation.ref });
  }
  if (record.ffet_refs.length === 0) {
    findings.push({ kind: "ffet_refs_missing", recordId: expectation.recordId, ref: expectation.ref });
  }
  for (const claim of config.requiredCannotClaim ?? []) {
    if (!record.cannot_claim.includes(claim)) {
      findings.push({ kind: "required_cannot_claim_missing", recordId: expectation.recordId, ref: expectation.ref, expected: claim });
    }
  }
  for (const writeRef of record.write_set) {
    if (writeRef.startsWith("/") || writeRef.startsWith("file://")) {
      findings.push({ kind: "absolute_write_set_path", recordId: expectation.recordId, ref: expectation.ref, actual: writeRef });
    }
    if (!writeRef.startsWith("product://")) {
      findings.push({ kind: "write_set_not_product_ref", recordId: expectation.recordId, ref: expectation.ref, actual: writeRef });
    }
  }
  for (const blockedRef of config.blockedFfetRefs ?? []) {
    if (record.ffet_refs.includes(blockedRef) && record.admission_result === "admitted") {
      findings.push({ kind: "pod_admitted_with_blocked_dependency", recordId: expectation.recordId, ref: expectation.ref, actual: blockedRef });
    }
  }
  if (record.collision_result === "detected" && record.admission_result === "admitted" && !record.serial_fallback) {
    findings.push({ kind: "collision_detected_without_block_or_serial_fallback", recordId: expectation.recordId, ref: expectation.ref });
  }
  if (record.admission_result === "serial_fallback" && !record.serial_fallback) {
    findings.push({ kind: "serial_fallback_admission_without_flag", recordId: expectation.recordId, ref: expectation.ref });
  }
  if (record.serial_fallback && record.collision_result !== "detected") {
    findings.push({ kind: "serial_fallback_without_detected_collision", recordId: expectation.recordId, ref: expectation.ref });
  }
  if (record.collision_result === "unable_to_verify" && record.admission_result === "admitted") {
    findings.push({ kind: "pod_admitted_with_unverified_collision", recordId: expectation.recordId, ref: expectation.ref });
  }
  for (const runtimeRef of record.runtime_refs) {
    const refHashFinding = validateSha256(runtimeRef.sha256, "runtime_ref_hash_invalid");
    if (refHashFinding) {
      findings.push({ ...refHashFinding, recordId: expectation.recordId, ref: expectation.ref, actual: runtimeRef.sha256, detail: runtimeRef.ref });
    }
  }
  return findings;
}

function addWriteSetOverlapFindings(loadedPods: readonly LoadedPodRecord[]): void {
  const admittedWrites = new Map<string, LoadedPodRecord[]>();
  for (const loaded of loadedPods) {
    if (!loaded.record) continue;
    if (loaded.record.admission_result !== "admitted") continue;
    if (loaded.record.serial_fallback || loaded.record.collision_result !== "none") continue;
    for (const writeRef of loaded.record.write_set) {
      const existing = admittedWrites.get(writeRef) ?? [];
      existing.push(loaded);
      admittedWrites.set(writeRef, existing);
    }
  }

  for (const [writeRef, records] of admittedWrites) {
    if (records.length < 2) continue;
    for (const loaded of records) {
      if (loaded.expectation.collisionRole === "holder") continue;
      loaded.findings.push({
        kind: "write_set_overlap_without_collision",
        recordId: loaded.expectation.recordId,
        ref: loaded.expectation.ref,
        actual: writeRef
      });
    }
  }
}

function finishPodResult(
  expectation: H06PodSchedulerExpectation,
  record: H06PodSchedulerRecord | null,
  recordFindings: H06PodSchedulerFinding[],
  findings: H06PodSchedulerFinding[],
  classifiedMismatches: H06PodSchedulerFinding[]
): H06PodSchedulerValidationResult {
  const actualStatus: H06ExpectedPodSchedulerStatus = recordFindings.length === 0 ? "passed" : "failed";
  const findingKinds = recordFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "pod_record_status_unexpected",
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
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    admissionResult: record?.admission_result ?? null,
    collisionResult: record?.collision_result ?? null,
    serialFallback: record?.serial_fallback ?? null,
    findingKinds
  };
}

function isPodSchedulerRecord(value: unknown): value is H06PodSchedulerRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<H06PodSchedulerRecord>;
  return (
    typeof candidate.schema_version === "string" &&
    typeof candidate.pod_id === "string" &&
    typeof candidate.box_id === "string" &&
    Array.isArray(candidate.role_refs) &&
    Array.isArray(candidate.ffet_refs) &&
    Array.isArray(candidate.write_set) &&
    Array.isArray(candidate.shared_resources) &&
    typeof candidate.admission_result === "string" &&
    typeof candidate.collision_result === "string" &&
    typeof candidate.serial_fallback === "boolean" &&
    Array.isArray(candidate.runtime_refs) &&
    Array.isArray(candidate.cannot_claim)
  );
}

function claimBearingText(record: H06PodSchedulerRecord): string {
  return [
    record.pod_id,
    record.box_id,
    ...record.role_refs,
    ...record.ffet_refs,
    ...record.write_set,
    ...record.shared_resources,
    record.admission_result,
    record.collision_result,
    String(record.serial_fallback)
  ].join(" ");
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H06PodSchedulerFinding[]
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

function parseJson(text: string, ref: string, findings: H06PodSchedulerFinding[]): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    findings.push({ kind: "json_parse_failed", ref, detail: errorDetail(error) });
    return null;
  }
}

function validateSha256(value: string, kindPrefix: string): H06PodSchedulerFinding | null {
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
