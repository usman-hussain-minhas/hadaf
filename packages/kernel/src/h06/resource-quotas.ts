import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H06ResourceQuotaStatus = "passed" | "failed";
export type H06ExpectedResourceQuotaStatus = "passed" | "failed";

export interface H06ResourceQuotaConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H06ResourceQuotaSchemaDescriptor;
  readonly schemaRefs?: readonly H06ResourceQuotaSchemaDescriptor[];
  readonly quotas: readonly H06ResourceQuotaExpectation[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H06ResourceQuotaSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H06ResourceQuotaExpectation {
  readonly quotaId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H06ExpectedResourceQuotaStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H06ResourceQuotaReport {
  readonly status: H06ResourceQuotaStatus;
  readonly findings: readonly H06ResourceQuotaFinding[];
  readonly classified_mismatches: readonly H06ResourceQuotaFinding[];
  readonly verified_refs: readonly H06VerifiedResourceQuotaRef[];
  readonly hash_failures: readonly H06ResourceQuotaFinding[];
  readonly quota_results: readonly H06ResourceQuotaValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H06ResourceQuotaValidationResult {
  readonly quotaId: string;
  readonly ref: string;
  readonly status: H06ExpectedResourceQuotaStatus;
  readonly expectedStatus: H06ExpectedResourceQuotaStatus;
  readonly resourceKind: string | null;
  readonly limitType: string | null;
  readonly breachStatus: string | null;
  readonly findingKinds: readonly string[];
}

export interface H06VerifiedResourceQuotaRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "schema_ref" | "quota";
}

export interface H06ResourceQuotaFinding {
  readonly kind: string;
  readonly quotaId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H06ResourceQuotaRecord {
  readonly schema_version: string;
  readonly quota_id: string;
  readonly scope_type: "box" | "ffet" | "pod" | "worktree" | "system";
  readonly scope_id: string;
  readonly resource_kind:
    | "disk"
    | "memory"
    | "cpu"
    | "ports"
    | "worktrees"
    | "databases"
    | "containers"
    | "wall_clock"
    | "network"
    | "model_cost"
    | "self_heals"
    | "retries";
  readonly limit_type: "hard" | "soft" | "advisory";
  readonly value: number;
  readonly unit: string;
  readonly enforcement: "declared" | "locally_enforced" | "runtime_enforced" | "advisory_only";
  readonly current_usage: number;
  readonly breach_status: "within_limit" | "breached" | "unknown";
  readonly human_override_required: boolean;
  readonly cannot_claim: readonly string[];
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const STALE_SHA256_VALUES = new Set([
  "0000000000000000000000000000000000000000000000000000000000000000",
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
]);
const PRODUCTION_ORCHESTRATION_CLAIM_PATTERN =
  /\b(?:production[_\s-]+resource[_\s-]+orchestration|production[_\s-]+orchestrator|production[_\s-]+quota[_\s-]+enforcement)\b/iu;
const FORBIDDEN_CLAIM_PATTERNS: readonly [RegExp, string][] = [
  [/\b(?:self[_\s-]+hosting[_\s-]+ready|release[_\s-]+candidate|production[_\s-]+ready)\b/iu, "future_posture_overclaim"],
  [/\b(?:stable[_\s-]+agents?|mechanically[_\s-]+independent[_\s-]+agents?)\b/iu, "agent_independence_or_stability_overclaim"],
  [/\b(?:H07[_\s-]+proof[_\s-]+engine|H08[_\s-]+git[_\s/-]+ci[_\s/-]+pr[_\s-]+merge[_\s-]+conductor)\b/iu, "future_box_capability_overclaim"]
];

export function verifyH06ResourceQuotaConfig(
  config: H06ResourceQuotaConfig
): H06ResourceQuotaReport {
  const findings: H06ResourceQuotaFinding[] = [];
  const classifiedMismatches: H06ResourceQuotaFinding[] = [];
  const verifiedRefs: H06VerifiedResourceQuotaRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const quotaResults: H06ResourceQuotaValidationResult[] = [];

  for (const quotaExpectation of config.quotas) {
    quotaResults.push(
      verifyQuotaExpectation(
        config,
        quotaExpectation,
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
    quota_results: quotaResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H06ResourceQuotaConfig,
  findings: H06ResourceQuotaFinding[],
  verifiedRefs: H06VerifiedResourceQuotaRef[]
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
  config: H06ResourceQuotaConfig,
  schema: H06ResourceQuotaSchemaDescriptor,
  source: "schema" | "schema_ref",
  findings: H06ResourceQuotaFinding[],
  verifiedRefs: H06VerifiedResourceQuotaRef[]
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

function verifyQuotaExpectation(
  config: H06ResourceQuotaConfig,
  expectation: H06ResourceQuotaExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H06ResourceQuotaFinding[],
  classifiedMismatches: H06ResourceQuotaFinding[],
  verifiedRefs: H06VerifiedResourceQuotaRef[]
): H06ResourceQuotaValidationResult {
  const quotaFindings: H06ResourceQuotaFinding[] = [];
  const quotaPath = resolveLogicalRef(expectation.ref, config.logicalRoots, quotaFindings);
  if (!quotaPath || !existsSync(quotaPath)) {
    const finding: H06ResourceQuotaFinding = {
      kind: "quota_record_missing",
      quotaId: expectation.quotaId,
      ref: expectation.ref
    };
    quotaFindings.push(quotaPath ? { ...finding, path: quotaPath } : finding);
    return finishQuotaResult(expectation, null, quotaFindings, findings, classifiedMismatches);
  }

  const hashFinding = validateSha256(expectation.sha256, "quota_record_hash_invalid");
  if (hashFinding) {
    quotaFindings.push({ ...hashFinding, quotaId: expectation.quotaId, ref: expectation.ref });
  }

  const quotaText = readFileSync(quotaPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(quotaText)) {
    quotaFindings.push({
      kind: "private_path_in_quota_record",
      quotaId: expectation.quotaId,
      ref: expectation.ref,
      path: quotaPath
    });
  }

  const actualHash = sha256Text(quotaText);
  const expectedHash = normalizeSha256(expectation.sha256);
  if (!hashFinding && actualHash !== expectedHash) {
    quotaFindings.push({
      kind: "quota_record_hash_mismatch",
      quotaId: expectation.quotaId,
      ref: expectation.ref,
      path: quotaPath,
      expected: expectedHash,
      actual: actualHash
    });
  }

  const parsed = parseJson(quotaText, expectation.ref, quotaFindings);
  if (!parsed) {
    return finishQuotaResult(expectation, null, quotaFindings, findings, classifiedMismatches);
  }

  if (schemaValidator) {
    const schemaValid = schemaValidator(parsed);
    if (!schemaValid) {
      quotaFindings.push({
        kind: "schema_validation_failed",
        quotaId: expectation.quotaId,
        ref: expectation.ref,
        detail: formatAjvErrors(schemaValidator.errors)
      });
    }
  } else {
    quotaFindings.push({
      kind: "schema_validator_unavailable",
      quotaId: expectation.quotaId,
      ref: expectation.ref
    });
  }

  if (!hashFinding && actualHash === expectedHash) {
    verifiedRefs.push({
      ref: expectation.ref,
      path: quotaPath,
      sha256: actualHash,
      source: "quota"
    });
  }

  if (isResourceQuotaRecord(parsed)) {
    quotaFindings.push(...semanticFindingsForRecord(config, expectation, parsed));
    return finishQuotaResult(expectation, parsed, quotaFindings, findings, classifiedMismatches);
  }

  quotaFindings.push({
    kind: "quota_record_shape_unavailable",
    quotaId: expectation.quotaId,
    ref: expectation.ref
  });
  return finishQuotaResult(expectation, null, quotaFindings, findings, classifiedMismatches);
}

function semanticFindingsForRecord(
  config: H06ResourceQuotaConfig,
  expectation: H06ResourceQuotaExpectation,
  record: H06ResourceQuotaRecord
): H06ResourceQuotaFinding[] {
  const findings: H06ResourceQuotaFinding[] = [];
  if (PRIVATE_PATH_PATTERN.test(JSON.stringify(record))) {
    findings.push({
      kind: "private_path_in_quota_record",
      quotaId: expectation.quotaId,
      ref: expectation.ref
    });
  }

  if (record.quota_id !== expectation.quotaId) {
    findings.push({
      kind: "quota_id_mismatch",
      quotaId: expectation.quotaId,
      ref: expectation.ref,
      expected: expectation.quotaId,
      actual: record.quota_id
    });
  }

  const requiredCannotClaim = config.requiredCannotClaim ?? [];
  for (const claim of requiredCannotClaim) {
    if (!record.cannot_claim.includes(claim)) {
      findings.push({
        kind: claim === "production_resource_orchestration"
          ? "production_orchestration_cannot_claim_missing"
          : "required_cannot_claim_missing",
        quotaId: expectation.quotaId,
        ref: expectation.ref,
        expected: claim
      });
    }
  }

  if (record.current_usage > record.value) {
    if (record.limit_type === "hard") {
      findings.push({
        kind: "hard_limit_breached",
        quotaId: expectation.quotaId,
        ref: expectation.ref,
        expected: String(record.value),
        actual: String(record.current_usage)
      });
      if (!record.human_override_required) {
        findings.push({
          kind: "human_override_required_for_hard_breach",
          quotaId: expectation.quotaId,
          ref: expectation.ref
        });
      }
    } else {
      findings.push({
        kind: "soft_or_advisory_limit_breached",
        quotaId: expectation.quotaId,
        ref: expectation.ref,
        expected: String(record.value),
        actual: String(record.current_usage)
      });
    }
    if (record.breach_status !== "breached") {
      findings.push({
        kind: "breach_status_inconsistent",
        quotaId: expectation.quotaId,
        ref: expectation.ref,
        expected: "breached",
        actual: record.breach_status
      });
    }
  } else if (record.breach_status === "breached") {
    findings.push({
      kind: "breach_status_inconsistent",
      quotaId: expectation.quotaId,
      ref: expectation.ref,
      expected: "within_limit_or_unknown",
      actual: record.breach_status
    });
  }

  const claimText = record.cannot_claim.join(" ");
  if (!record.cannot_claim.includes("production_resource_orchestration")) {
    findings.push({
      kind: "production_orchestration_boundary_missing",
      quotaId: expectation.quotaId,
      ref: expectation.ref
    });
  }
  if (PRODUCTION_ORCHESTRATION_CLAIM_PATTERN.test(claimText)) {
    return findings;
  }
  for (const [pattern, kind] of FORBIDDEN_CLAIM_PATTERNS) {
    if (pattern.test(claimText) && !record.cannot_claim.some((claim) => pattern.test(claim))) {
      findings.push({ kind, quotaId: expectation.quotaId, ref: expectation.ref });
    }
  }

  return findings;
}

function finishQuotaResult(
  expectation: H06ResourceQuotaExpectation,
  record: H06ResourceQuotaRecord | null,
  quotaFindings: H06ResourceQuotaFinding[],
  findings: H06ResourceQuotaFinding[],
  classifiedMismatches: H06ResourceQuotaFinding[]
): H06ResourceQuotaValidationResult {
  const actualStatus: H06ExpectedResourceQuotaStatus = quotaFindings.length === 0 ? "passed" : "failed";
  const findingKinds = quotaFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "quota_status_unexpected",
      quotaId: expectation.quotaId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus,
      detail: findingKinds.join(",")
    });
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...quotaFindings);
    for (const expectedKind of expectation.expectedFindingKinds ?? []) {
      if (!findingKinds.includes(expectedKind)) {
        findings.push({
          kind: "expected_negative_finding_missing",
          quotaId: expectation.quotaId,
          ref: expectation.ref,
          expected: expectedKind,
          actual: findingKinds.join(",")
        });
      }
    }
  } else {
    findings.push(...quotaFindings);
  }

  return {
    quotaId: expectation.quotaId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    resourceKind: record?.resource_kind ?? null,
    limitType: record?.limit_type ?? null,
    breachStatus: record?.breach_status ?? null,
    findingKinds
  };
}

function isResourceQuotaRecord(value: unknown): value is H06ResourceQuotaRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<H06ResourceQuotaRecord>;
  return (
    typeof candidate.schema_version === "string" &&
    typeof candidate.quota_id === "string" &&
    typeof candidate.resource_kind === "string" &&
    typeof candidate.limit_type === "string" &&
    typeof candidate.value === "number" &&
    typeof candidate.current_usage === "number" &&
    typeof candidate.breach_status === "string" &&
    typeof candidate.human_override_required === "boolean" &&
    Array.isArray(candidate.cannot_claim)
  );
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H06ResourceQuotaFinding[]
): string | null {
  if (isAbsolute(ref) || PRIVATE_PATH_PATTERN.test(ref)) {
    findings.push({ kind: "private_or_absolute_ref", ref });
    return null;
  }

  const matchingRoot = Object.entries(logicalRoots)
    .sort(([left], [right]) => right.length - left.length)
    .find(([logicalRoot]) => ref === logicalRoot || ref.startsWith(`${logicalRoot}/`));

  if (matchingRoot) {
    const [logicalRoot, rootPath] = matchingRoot;
    const remainder = ref === logicalRoot ? "" : ref.slice(logicalRoot.length + 1);
    const resolvedRoot = resolve(rootPath);
    const resolved = resolve(resolvedRoot, remainder);
    const relativePath = relative(resolvedRoot, resolved);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      findings.push({ kind: "logical_ref_path_escape", ref, path: resolved });
      return null;
    }
    return resolved;
  }

  if (ref.includes("://")) {
    findings.push({ kind: "unmapped_logical_ref", ref });
    return null;
  }

  const normalized = normalize(ref);
  if (normalized.startsWith("..")) {
    findings.push({ kind: "relative_ref_path_escape", ref });
    return null;
  }
  return resolve(normalized);
}

function validateSha256(value: string, kind: string): H06ResourceQuotaFinding | null {
  if (PLACEHOLDER_PATTERN.test(value)) return { kind: `${kind}_placeholder`, actual: value };
  if (!SHA256_PATTERN.test(value)) return { kind, actual: value };
  const normalized = normalizeSha256(value);
  if (STALE_SHA256_VALUES.has(normalized)) return { kind: `${kind}_stale`, actual: value };
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseJson(
  text: string,
  ref: string,
  findings: H06ResourceQuotaFinding[]
): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    findings.push({
      kind: "invalid_json",
      ref,
      detail: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function formatAjvErrors(errors: ValidateFunction<unknown>["errors"]): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "schema error"}`)
    .join("; ");
}
