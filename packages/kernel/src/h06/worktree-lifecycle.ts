import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H06WorktreeLifecycleStatus = "passed" | "failed";
export type H06ExpectedWorktreeLifecycleStatus = "passed" | "failed";

export interface H06WorktreeLifecycleConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H06WorktreeLifecycleSchemaDescriptor;
  readonly schemaRefs?: readonly H06WorktreeLifecycleSchemaDescriptor[];
  readonly registries: readonly H06WorktreeLifecycleExpectation[];
  readonly requiredCannotClaim?: readonly string[];
  readonly requiredForbiddenRoots?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H06WorktreeLifecycleSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H06WorktreeLifecycleExpectation {
  readonly registryId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H06ExpectedWorktreeLifecycleStatus;
  readonly expectedPathSuffix?: string;
  readonly expectedBranchContains?: string;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H06WorktreeLifecycleReport {
  readonly status: H06WorktreeLifecycleStatus;
  readonly findings: readonly H06WorktreeLifecycleFinding[];
  readonly classified_mismatches: readonly H06WorktreeLifecycleFinding[];
  readonly verified_refs: readonly H06VerifiedWorktreeLifecycleRef[];
  readonly hash_failures: readonly H06WorktreeLifecycleFinding[];
  readonly registry_results: readonly H06WorktreeLifecycleValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H06WorktreeLifecycleValidationResult {
  readonly registryId: string;
  readonly ref: string;
  readonly status: H06ExpectedWorktreeLifecycleStatus;
  readonly expectedStatus: H06ExpectedWorktreeLifecycleStatus;
  readonly worktreeStatus: string | null;
  readonly pathRef: string | null;
  readonly branchRef: string | null;
  readonly findingKinds: readonly string[];
}

export interface H06VerifiedWorktreeLifecycleRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "schema_ref" | "registry";
}

export interface H06WorktreeLifecycleFinding {
  readonly kind: string;
  readonly registryId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H06RuntimeWorktreeRegistryRecord {
  readonly schema_version: string;
  readonly worktree_id: string;
  readonly box_id: string;
  readonly ffet_id: string;
  readonly path_ref: string;
  readonly branch_ref: string;
  readonly base_sha: string;
  readonly current_sha: string;
  readonly status: "planned" | "active" | "stale" | "quarantined" | "cleaned" | "superseded";
  readonly allowed_roots: readonly string[];
  readonly forbidden_roots: readonly string[];
  readonly cwd_assertion_policy: string;
  readonly cleanup_policy: string;
  readonly cannot_claim: readonly string[];
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const STALE_SHA256_VALUES = new Set([
  "0000000000000000000000000000000000000000000000000000000000000000",
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
]);
const SOURCE_MUTATION_PATTERN = /\b(?:mutate|mutation|modify|write)\b.*\b(?:source|input|canonical|planning_bundle)\b/iu;
const FORBIDDEN_CAPABILITY_PATTERNS: readonly [RegExp, string][] = [
  [/\b(?:self[_\s-]+hosting[_\s-]+ready|release[_\s-]+candidate|production[_\s-]+ready)\b/iu, "future_posture_overclaim"],
  [/\b(?:stable[_\s-]+agents?|mechanically[_\s-]+independent[_\s-]+agents?)\b/iu, "agent_independence_or_stability_overclaim"],
  [/\b(?:H07[_\s-]+proof[_\s-]+engine|H08[_\s-]+git[_\s/-]+ci[_\s/-]+pr[_\s-]+merge[_\s-]+conductor)\b/iu, "future_box_capability_overclaim"]
];

export function verifyH06WorktreeLifecycleConfig(
  config: H06WorktreeLifecycleConfig
): H06WorktreeLifecycleReport {
  const findings: H06WorktreeLifecycleFinding[] = [];
  const classifiedMismatches: H06WorktreeLifecycleFinding[] = [];
  const verifiedRefs: H06VerifiedWorktreeLifecycleRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const registryResults: H06WorktreeLifecycleValidationResult[] = [];

  for (const registryExpectation of config.registries) {
    registryResults.push(
      verifyRegistryExpectation(
        config,
        registryExpectation,
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
    registry_results: registryResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H06WorktreeLifecycleConfig,
  findings: H06WorktreeLifecycleFinding[],
  verifiedRefs: H06VerifiedWorktreeLifecycleRef[]
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
  config: H06WorktreeLifecycleConfig,
  schema: H06WorktreeLifecycleSchemaDescriptor,
  source: "schema" | "schema_ref",
  findings: H06WorktreeLifecycleFinding[],
  verifiedRefs: H06VerifiedWorktreeLifecycleRef[]
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

function verifyRegistryExpectation(
  config: H06WorktreeLifecycleConfig,
  expectation: H06WorktreeLifecycleExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H06WorktreeLifecycleFinding[],
  classifiedMismatches: H06WorktreeLifecycleFinding[],
  verifiedRefs: H06VerifiedWorktreeLifecycleRef[]
): H06WorktreeLifecycleValidationResult {
  const registryFindings: H06WorktreeLifecycleFinding[] = [];
  const registryPath = resolveLogicalRef(expectation.ref, config.logicalRoots, registryFindings);
  if (!registryPath || !existsSync(registryPath)) {
    const finding: H06WorktreeLifecycleFinding = {
      kind: "worktree_registry_missing",
      registryId: expectation.registryId,
      ref: expectation.ref
    };
    registryFindings.push(registryPath ? { ...finding, path: registryPath } : finding);
    return finishRegistryResult(expectation, null, registryFindings, findings, classifiedMismatches);
  }

  const hashFinding = validateSha256(expectation.sha256, "worktree_registry_hash_invalid");
  if (hashFinding) {
    registryFindings.push({ ...hashFinding, registryId: expectation.registryId, ref: expectation.ref });
  }

  const registryText = readFileSync(registryPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(registryText)) {
    registryFindings.push({
      kind: "private_path_in_worktree_registry",
      registryId: expectation.registryId,
      ref: expectation.ref,
      path: registryPath
    });
  }

  const actualHash = sha256Text(registryText);
  const expectedHash = normalizeSha256(expectation.sha256);
  if (!hashFinding && actualHash !== expectedHash) {
    registryFindings.push({
      kind: "worktree_registry_hash_mismatch",
      registryId: expectation.registryId,
      ref: expectation.ref,
      path: registryPath,
      expected: expectedHash,
      actual: actualHash
    });
  }

  const parsed = parseJson(registryText, expectation.ref, registryFindings);
  if (!parsed) {
    return finishRegistryResult(expectation, null, registryFindings, findings, classifiedMismatches);
  }

  if (schemaValidator) {
    const schemaValid = schemaValidator(parsed);
    if (!schemaValid) {
      registryFindings.push({
        kind: "schema_validation_failed",
        registryId: expectation.registryId,
        ref: expectation.ref,
        detail: formatAjvErrors(schemaValidator.errors)
      });
    }
  } else {
    registryFindings.push({
      kind: "schema_validator_unavailable",
      registryId: expectation.registryId,
      ref: expectation.ref
    });
  }

  if (!hashFinding && actualHash === expectedHash) {
    verifiedRefs.push({
      ref: expectation.ref,
      path: registryPath,
      sha256: actualHash,
      source: "registry"
    });
  }

  if (isRuntimeWorktreeRegistryRecord(parsed)) {
    registryFindings.push(...semanticFindingsForRecord(config, expectation, parsed));
    return finishRegistryResult(expectation, parsed, registryFindings, findings, classifiedMismatches);
  }

  registryFindings.push({
    kind: "worktree_registry_shape_unavailable",
    registryId: expectation.registryId,
    ref: expectation.ref
  });
  return finishRegistryResult(expectation, null, registryFindings, findings, classifiedMismatches);
}

function semanticFindingsForRecord(
  config: H06WorktreeLifecycleConfig,
  expectation: H06WorktreeLifecycleExpectation,
  record: H06RuntimeWorktreeRegistryRecord
): H06WorktreeLifecycleFinding[] {
  const findings: H06WorktreeLifecycleFinding[] = [];
  const recordText = JSON.stringify(record);

  if (PRIVATE_PATH_PATTERN.test(recordText)) {
    findings.push({
      kind: "private_path_in_worktree_registry",
      registryId: expectation.registryId,
      ref: expectation.ref
    });
  }

  if (record.worktree_id !== expectation.registryId) {
    findings.push({
      kind: "worktree_id_mismatch",
      registryId: expectation.registryId,
      ref: expectation.ref,
      expected: expectation.registryId,
      actual: record.worktree_id
    });
  }

  if (record.box_id !== "H06") {
    findings.push({
      kind: "box_id_unexpected",
      registryId: expectation.registryId,
      ref: expectation.ref,
      expected: "H06",
      actual: record.box_id
    });
  }

  if (!record.ffet_id.startsWith("H06-")) {
    findings.push({
      kind: "ffet_id_unexpected",
      registryId: expectation.registryId,
      ref: expectation.ref,
      expected: "H06-*",
      actual: record.ffet_id
    });
  }

  if (expectation.expectedPathSuffix && !record.path_ref.endsWith(expectation.expectedPathSuffix)) {
    findings.push({
      kind: "worktree_path_suffix_mismatch",
      registryId: expectation.registryId,
      ref: expectation.ref,
      expected: expectation.expectedPathSuffix,
      actual: record.path_ref
    });
  }

  if (expectation.expectedBranchContains && !record.branch_ref.includes(expectation.expectedBranchContains)) {
    findings.push({
      kind: "branch_identity_mismatch",
      registryId: expectation.registryId,
      ref: expectation.ref,
      expected: expectation.expectedBranchContains,
      actual: record.branch_ref
    });
  }

  if (!record.allowed_roots.some((root) => isRefWithinRoot(record.path_ref, root))) {
    findings.push({
      kind: "worktree_path_outside_allowed_roots",
      registryId: expectation.registryId,
      ref: expectation.ref,
      actual: record.path_ref
    });
  }

  for (const forbiddenRoot of record.forbidden_roots) {
    if (isRefWithinRoot(record.path_ref, forbiddenRoot)) {
      findings.push({
        kind: "worktree_path_inside_forbidden_root",
        registryId: expectation.registryId,
        ref: expectation.ref,
        actual: record.path_ref,
        expected: forbiddenRoot
      });
    }
  }

  for (const requiredForbiddenRoot of config.requiredForbiddenRoots ?? []) {
    if (!record.forbidden_roots.includes(requiredForbiddenRoot)) {
      findings.push({
        kind: "required_forbidden_root_missing",
        registryId: expectation.registryId,
        ref: expectation.ref,
        expected: requiredForbiddenRoot
      });
    }
  }

  const resolvedWorktreePath = resolveLogicalRef(record.path_ref, config.logicalRoots, findings);
  if (!resolvedWorktreePath) {
    findings.push({
      kind: "worktree_path_unresolvable",
      registryId: expectation.registryId,
      ref: expectation.ref,
      actual: record.path_ref
    });
  } else if (!isAbsolute(resolvedWorktreePath)) {
    findings.push({
      kind: "worktree_cwd_not_absolute",
      registryId: expectation.registryId,
      ref: expectation.ref,
      path: resolvedWorktreePath
    });
  }

  if (!/\babsolute\b/iu.test(record.cwd_assertion_policy)) {
    findings.push({
      kind: "absolute_cwd_policy_missing",
      registryId: expectation.registryId,
      ref: expectation.ref,
      actual: record.cwd_assertion_policy
    });
  }

  if (/\brelative\b.*\b(?:allowed|accepted|ok)\b/iu.test(record.cwd_assertion_policy)) {
    findings.push({
      kind: "relative_cwd_allowed",
      registryId: expectation.registryId,
      ref: expectation.ref,
      actual: record.cwd_assertion_policy
    });
  }

  findings.push(...cleanupPolicyFindings(expectation, record));
  findings.push(...cannotClaimFindings(config, expectation, record));

  const semanticText = [
    record.path_ref,
    record.branch_ref,
    record.cwd_assertion_policy,
    record.cleanup_policy,
    ...record.allowed_roots,
    ...record.forbidden_roots
  ].join(" ");

  if (SOURCE_MUTATION_PATTERN.test(semanticText)) {
    findings.push({
      kind: "source_mutation_boundary_violation",
      registryId: expectation.registryId,
      ref: expectation.ref
    });
  }

  for (const [pattern, kind] of FORBIDDEN_CAPABILITY_PATTERNS) {
    const nonClaimText = [record.cwd_assertion_policy, record.cleanup_policy, record.branch_ref, record.path_ref].join(" ");
    if (pattern.test(nonClaimText)) {
      findings.push({ kind, registryId: expectation.registryId, ref: expectation.ref });
    }
  }

  return findings;
}

function cleanupPolicyFindings(
  expectation: H06WorktreeLifecycleExpectation,
  record: H06RuntimeWorktreeRegistryRecord
): H06WorktreeLifecycleFinding[] {
  const findings: H06WorktreeLifecycleFinding[] = [];
  const cleanupPolicy = record.cleanup_policy;
  if (cleanupPolicy.trim().length === 0 || /\bunknown\b/iu.test(cleanupPolicy)) {
    findings.push({
      kind: "cleanup_policy_unclassified",
      registryId: expectation.registryId,
      ref: expectation.ref
    });
    return findings;
  }

  const cleaned = /\b(?:cleaned|removed|delete(?:d)?)\b/iu.test(cleanupPolicy);
  const quarantined = /\bquarantine(?:d)?\b/iu.test(cleanupPolicy);
  const retained = /\b(?:retain|retained|closeout)\b/iu.test(cleanupPolicy);

  if (record.status === "cleaned" && !cleaned) {
    findings.push({
      kind: "cleaned_status_without_cleanup_proof",
      registryId: expectation.registryId,
      ref: expectation.ref
    });
  }
  if (record.status === "quarantined" && !quarantined) {
    findings.push({
      kind: "quarantined_status_without_quarantine_proof",
      registryId: expectation.registryId,
      ref: expectation.ref
    });
  }
  if ((record.status === "active" || record.status === "planned") && !(retained || cleaned || quarantined)) {
    findings.push({
      kind: "active_or_planned_status_without_lifecycle_policy",
      registryId: expectation.registryId,
      ref: expectation.ref
    });
  }
  if (record.status === "stale" && !(quarantined || cleaned)) {
    findings.push({
      kind: "stale_status_without_cleanup_or_quarantine",
      registryId: expectation.registryId,
      ref: expectation.ref
    });
  }

  return findings;
}

function cannotClaimFindings(
  config: H06WorktreeLifecycleConfig,
  expectation: H06WorktreeLifecycleExpectation,
  record: H06RuntimeWorktreeRegistryRecord
): H06WorktreeLifecycleFinding[] {
  const findings: H06WorktreeLifecycleFinding[] = [];
  for (const claim of config.requiredCannotClaim ?? []) {
    if (!record.cannot_claim.includes(claim)) {
      findings.push({
        kind: "required_cannot_claim_missing",
        registryId: expectation.registryId,
        ref: expectation.ref,
        expected: claim
      });
    }
  }
  return findings;
}

function finishRegistryResult(
  expectation: H06WorktreeLifecycleExpectation,
  record: H06RuntimeWorktreeRegistryRecord | null,
  registryFindings: H06WorktreeLifecycleFinding[],
  findings: H06WorktreeLifecycleFinding[],
  classifiedMismatches: H06WorktreeLifecycleFinding[]
): H06WorktreeLifecycleValidationResult {
  const actualStatus: H06ExpectedWorktreeLifecycleStatus =
    registryFindings.length === 0 ? "passed" : "failed";
  const findingKinds = registryFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "worktree_registry_status_unexpected",
      registryId: expectation.registryId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus,
      detail: findingKinds.join(",")
    });
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...registryFindings);
    for (const expectedKind of expectation.expectedFindingKinds ?? []) {
      if (!findingKinds.includes(expectedKind)) {
        findings.push({
          kind: "expected_negative_finding_missing",
          registryId: expectation.registryId,
          ref: expectation.ref,
          expected: expectedKind,
          actual: findingKinds.join(",")
        });
      }
    }
  } else {
    findings.push(...registryFindings);
  }

  return {
    registryId: expectation.registryId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    worktreeStatus: record?.status ?? null,
    pathRef: record?.path_ref ?? null,
    branchRef: record?.branch_ref ?? null,
    findingKinds
  };
}

function isRuntimeWorktreeRegistryRecord(value: unknown): value is H06RuntimeWorktreeRegistryRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<H06RuntimeWorktreeRegistryRecord>;
  return (
    typeof candidate.schema_version === "string" &&
    typeof candidate.worktree_id === "string" &&
    typeof candidate.box_id === "string" &&
    typeof candidate.ffet_id === "string" &&
    typeof candidate.path_ref === "string" &&
    typeof candidate.branch_ref === "string" &&
    typeof candidate.base_sha === "string" &&
    typeof candidate.current_sha === "string" &&
    typeof candidate.status === "string" &&
    Array.isArray(candidate.allowed_roots) &&
    Array.isArray(candidate.forbidden_roots) &&
    typeof candidate.cwd_assertion_policy === "string" &&
    typeof candidate.cleanup_policy === "string" &&
    Array.isArray(candidate.cannot_claim)
  );
}

function isRefWithinRoot(ref: string, root: string): boolean {
  return ref === root || ref.startsWith(`${root}/`);
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H06WorktreeLifecycleFinding[]
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

function validateSha256(value: string, kind: string): H06WorktreeLifecycleFinding | null {
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
  findings: H06WorktreeLifecycleFinding[]
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
