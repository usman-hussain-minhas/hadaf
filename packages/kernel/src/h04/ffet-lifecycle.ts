import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H04FfetLifecycleStatus = "passed" | "failed";
export type H04ExpectedFfetStatus = "passed" | "failed";

export interface H04FfetLifecycleConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H04FfetLifecycleSchemaDescriptor;
  readonly ffets: readonly H04FfetExpectation[];
  readonly requiredValidationCommands?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H04FfetLifecycleSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H04FfetExpectation {
  readonly ffetId: string;
  readonly ref: string;
  readonly expectedStatus: H04ExpectedFfetStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H04FfetLifecycleReport {
  readonly status: H04FfetLifecycleStatus;
  readonly findings: readonly H04FfetLifecycleFinding[];
  readonly classified_mismatches: readonly H04FfetLifecycleFinding[];
  readonly verified_refs: readonly H04VerifiedFfetLifecycleRef[];
  readonly hash_failures: readonly H04FfetLifecycleFinding[];
  readonly ffet_results: readonly H04FfetValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H04FfetValidationResult {
  readonly ffetId: string;
  readonly ref: string;
  readonly status: H04ExpectedFfetStatus;
  readonly expectedStatus: H04ExpectedFfetStatus;
  readonly state: H04FfetLifecycleState | "unknown";
  readonly findingKinds: readonly string[];
}

export interface H04VerifiedFfetLifecycleRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "ffet";
}

export interface H04FfetLifecycleFinding {
  readonly kind: string;
  readonly ffetId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H04FfetLifecycleRecord {
  readonly schema_version: string;
  readonly ffet_id: string;
  readonly box_id: string;
  readonly state: H04FfetLifecycleState;
  readonly source_authority_refs: readonly H04RefHash[];
  readonly exact_files_expected_to_change: readonly string[];
  readonly files_forbidden_to_change: readonly string[];
  readonly dependencies: readonly H04RefHash[];
  readonly validation_commands: readonly string[];
  readonly proof_requirements: readonly string[];
  readonly self_heal_budget: number;
  readonly branch_ref?: string;
  readonly worktree_ref?: string;
  readonly pr_ref?: string;
  readonly merge_ref?: H04RefHash;
  readonly closeout_ref?: H04RefHash;
  readonly learning_ref?: H04RefHash;
  readonly stale_status: H04FreshnessStatus;
  readonly cannot_claim: readonly string[];
}

interface H04RefHash {
  readonly ref: string;
  readonly sha256: string;
}

type H04FfetLifecycleState =
  | "candidate"
  | "audited"
  | "executable"
  | "implementing"
  | "proof_ready"
  | "pr_open"
  | "merged"
  | "closeout_complete"
  | "blocked"
  | "deferred"
  | "superseded";

type H04FreshnessStatus =
  | "fresh"
  | "stale"
  | "superseded"
  | "unknown"
  | "not_applicable_with_reason";

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const BROAD_FILE_PATTERN = /(?:\*\*|\*|\{|\}|\[|\]|^\.{1,2}$|\/$)/u;
const WRONG_PRODUCT_PLANE_PATTERN = /^(?:control|evidence|runtime|releases)(?:\/|$)/u;
const QUESTION_DEFAULT_AUTHORITY_PATTERN = /(?:question|default|constitution|authority)/iu;
const PROOF_OVERCLAIM_PATTERN = /(?:H07|proof engine implemented|production proof|independent qualification)/iu;

const EXECUTABLE_STATES = new Set<H04FfetLifecycleState>([
  "audited",
  "executable",
  "implementing",
  "proof_ready",
  "pr_open"
]);
const ACTIVE_STATES = new Set<H04FfetLifecycleState>([
  "audited",
  "executable",
  "implementing",
  "proof_ready",
  "pr_open",
  "merged"
]);
const PROOF_STATES = new Set<H04FfetLifecycleState>([
  "proof_ready",
  "pr_open",
  "merged",
  "closeout_complete"
]);

export function verifyH04FfetLifecycleConfig(
  config: H04FfetLifecycleConfig
): H04FfetLifecycleReport {
  const findings: H04FfetLifecycleFinding[] = [];
  const classifiedMismatches: H04FfetLifecycleFinding[] = [];
  const verifiedRefs: H04VerifiedFfetLifecycleRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const ffetResults: H04FfetValidationResult[] = [];

  for (const ffetExpectation of config.ffets) {
    ffetResults.push(
      verifyFfetExpectation(
        config,
        ffetExpectation,
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
      finding.kind.includes("placeholder") ||
      finding.kind.includes("stale")
  );

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: classifiedMismatches,
    verified_refs: verifiedRefs,
    hash_failures: hashFailures,
    ffet_results: ffetResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H04FfetLifecycleConfig,
  findings: H04FfetLifecycleFinding[],
  verifiedRefs: H04VerifiedFfetLifecycleRef[]
): ValidateFunction<unknown> | null {
  const hashFinding = validateSha256(config.schema.sha256, "schema_hash_invalid");
  if (hashFinding) {
    findings.push({ ...hashFinding, ref: config.schema.ref });
    return null;
  }

  const schemaPath = resolveLogicalRef(config.schema.ref, config.logicalRoots, findings);
  if (!schemaPath) return null;
  if (!existsSync(schemaPath)) {
    findings.push({ kind: "schema_missing", ref: config.schema.ref, path: schemaPath });
    return null;
  }

  const schemaText = readFileSync(schemaPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(schemaText)) {
    findings.push({ kind: "private_path_in_schema", ref: config.schema.ref, path: schemaPath });
    return null;
  }

  const actualHash = sha256Text(schemaText);
  const expectedHash = normalizeSha256(config.schema.sha256);
  if (actualHash !== expectedHash) {
    findings.push({
      kind: "schema_hash_mismatch",
      ref: config.schema.ref,
      path: schemaPath,
      expected: expectedHash,
      actual: actualHash
    });
    return null;
  }

  verifiedRefs.push({
    ref: config.schema.ref,
    path: schemaPath,
    sha256: actualHash,
    source: "schema"
  });

  const parsedSchema = parseJson(schemaText, config.schema.ref, findings);
  if (!parsedSchema) return null;

  const ajv = new Ajv2020({ allErrors: true, strict: false });
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

function verifyFfetExpectation(
  config: H04FfetLifecycleConfig,
  expectation: H04FfetExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H04FfetLifecycleFinding[],
  classifiedMismatches: H04FfetLifecycleFinding[],
  verifiedRefs: H04VerifiedFfetLifecycleRef[]
): H04FfetValidationResult {
  const ffetFindings: H04FfetLifecycleFinding[] = [];
  const ffetPath = resolveLogicalRef(expectation.ref, config.logicalRoots, ffetFindings);
  if (!ffetPath || !existsSync(ffetPath)) {
    const finding: H04FfetLifecycleFinding = {
      kind: "ffet_missing",
      ffetId: expectation.ffetId,
      ref: expectation.ref
    };
    ffetFindings.push(ffetPath ? { ...finding, path: ffetPath } : finding);
    return finishFfetResult(expectation, "unknown", ffetFindings, findings, classifiedMismatches);
  }

  const ffetText = readFileSync(ffetPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(ffetText)) {
    ffetFindings.push({
      kind: "private_path_in_ffet",
      ffetId: expectation.ffetId,
      ref: expectation.ref,
      path: ffetPath
    });
  }

  verifiedRefs.push({
    ref: expectation.ref,
    path: ffetPath,
    sha256: sha256Text(ffetText),
    source: "ffet"
  });

  const parsed = parseJson(ffetText, expectation.ref, ffetFindings);
  const record = parseFfetRecord(expectation, parsed, ffetFindings);
  if (!record) {
    return finishFfetResult(expectation, "unknown", ffetFindings, findings, classifiedMismatches);
  }

  validateFfetWithSchema(expectation, record, schemaValidator, ffetFindings);
  verifyFfetSemantics(config, expectation, record, ffetFindings);

  return finishFfetResult(expectation, record.state, ffetFindings, findings, classifiedMismatches);
}

function parseFfetRecord(
  expectation: H04FfetExpectation,
  parsed: unknown,
  ffetFindings: H04FfetLifecycleFinding[]
): H04FfetLifecycleRecord | null {
  if (!isRecord(parsed)) {
    ffetFindings.push({ kind: "ffet_not_object", ffetId: expectation.ffetId, ref: expectation.ref });
    return null;
  }

  const ffetId = parsed.ffet_id;
  if (ffetId !== expectation.ffetId) {
    ffetFindings.push({
      kind: "ffet_id_mismatch",
      ffetId: expectation.ffetId,
      ref: expectation.ref,
      expected: expectation.ffetId,
      actual: typeof ffetId === "string" ? ffetId : "missing_or_invalid"
    });
  }

  return parsed as unknown as H04FfetLifecycleRecord;
}

function validateFfetWithSchema(
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  schemaValidator: ValidateFunction<unknown> | null,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  if (!schemaValidator) {
    ffetFindings.push({ kind: "schema_validator_unavailable", ffetId: expectation.ffetId });
    return;
  }

  if (!schemaValidator(record)) {
    for (const issue of schemaValidator.errors ?? []) {
      const finding: H04FfetLifecycleFinding = {
        kind: schemaIssueKind(issue),
        ffetId: expectation.ffetId
      };
      ffetFindings.push(issue.message ? { ...finding, detail: issue.message } : finding);
    }
  }
}

function verifyFfetSemantics(
  config: H04FfetLifecycleConfig,
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  validateRefHashes(expectation, record, ffetFindings);
  validateFileDiscipline(expectation, record, ffetFindings);
  validateFreshness(expectation, record, ffetFindings);
  validateValidationAndProof(config, expectation, record, ffetFindings);
  validateCloseoutAndLearning(expectation, record, ffetFindings);
  validateQuestionDefaultAuthority(expectation, record, ffetFindings);
  validateCannotClaim(expectation, record, ffetFindings);
}

function validateRefHashes(
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  validateRefHashCollection("source_authority", expectation, record.source_authority_refs ?? [], ffetFindings);
  validateRefHashCollection("dependency", expectation, record.dependencies ?? [], ffetFindings);
  if (record.merge_ref) validateRefHashCollection("merge", expectation, [record.merge_ref], ffetFindings);
  if (record.closeout_ref) validateRefHashCollection("closeout", expectation, [record.closeout_ref], ffetFindings);
  if (record.learning_ref) validateRefHashCollection("learning", expectation, [record.learning_ref], ffetFindings);
}

function validateRefHashCollection(
  collectionKind: string,
  expectation: H04FfetExpectation,
  refs: readonly H04RefHash[],
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  const hashesByRef = new Map<string, string>();
  for (const refHash of refs) {
    const hashFinding = validateSha256(refHash.sha256, `${collectionKind}_sha256_invalid`);
    if (hashFinding) {
      ffetFindings.push({
        ...hashFinding,
        ffetId: expectation.ffetId,
        ref: refHash.ref
      });
      continue;
    }

    const normalizedHash = normalizeSha256(refHash.sha256);
    const priorHash = hashesByRef.get(refHash.ref);
    if (priorHash && priorHash !== normalizedHash) {
      ffetFindings.push({
        kind: `${collectionKind}_duplicate_ref_conflicting_hash`,
        ffetId: expectation.ffetId,
        ref: refHash.ref,
        expected: priorHash,
        actual: normalizedHash
      });
    }
    hashesByRef.set(refHash.ref, normalizedHash);
  }
}

function validateFileDiscipline(
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  const forbiddenPatterns = record.files_forbidden_to_change ?? [];

  for (const ownedFile of record.exact_files_expected_to_change ?? []) {
    if (isAbsolute(ownedFile)) {
      ffetFindings.push({ kind: "owned_file_absolute_path", ffetId: expectation.ffetId, path: ownedFile });
    }
    if (BROAD_FILE_PATTERN.test(ownedFile)) {
      ffetFindings.push({ kind: "owned_file_broad_or_glob", ffetId: expectation.ffetId, path: ownedFile });
    }
    if (WRONG_PRODUCT_PLANE_PATTERN.test(ownedFile)) {
      ffetFindings.push({ kind: "owned_file_wrong_plane", ffetId: expectation.ffetId, path: ownedFile });
    }
    for (const forbiddenPattern of forbiddenPatterns) {
      if (pathMatchesPattern(ownedFile, forbiddenPattern)) {
        ffetFindings.push({
          kind: "owned_file_forbidden_overlap",
          ffetId: expectation.ffetId,
          path: ownedFile,
          detail: forbiddenPattern
        });
      }
    }
  }

  if ((record.exact_files_expected_to_change ?? []).length === 0 && ACTIVE_STATES.has(record.state)) {
    ffetFindings.push({ kind: "active_ffet_missing_exact_files", ffetId: expectation.ffetId });
  }
}

function validateFreshness(
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  if (EXECUTABLE_STATES.has(record.state) && record.stale_status !== "fresh") {
    ffetFindings.push({
      kind: "stale_ffet_blocks_execution",
      ffetId: expectation.ffetId,
      expected: "fresh",
      actual: record.stale_status
    });
  }
}

function validateValidationAndProof(
  config: H04FfetLifecycleConfig,
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  if (ACTIVE_STATES.has(record.state) && (record.validation_commands ?? []).length === 0) {
    ffetFindings.push({ kind: "active_ffet_missing_validation_commands", ffetId: expectation.ffetId });
  }

  for (const requiredCommand of config.requiredValidationCommands ?? []) {
    if (!record.validation_commands.some((command) => command.includes(requiredCommand))) {
      ffetFindings.push({
        kind: "required_validation_command_missing",
        ffetId: expectation.ffetId,
        expected: requiredCommand
      });
    }
  }

  if (PROOF_STATES.has(record.state) && (record.proof_requirements ?? []).length === 0) {
    ffetFindings.push({ kind: "proof_state_missing_proof_requirements", ffetId: expectation.ffetId });
  }

  if ((record.proof_requirements ?? []).some((proof) => PROOF_OVERCLAIM_PATTERN.test(proof))) {
    ffetFindings.push({ kind: "proof_overclaim", ffetId: expectation.ffetId });
  }
}

function validateCloseoutAndLearning(
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  if (record.state === "merged" && (!record.closeout_ref || !record.learning_ref)) {
    ffetFindings.push({ kind: "merged_without_closeout_or_learning", ffetId: expectation.ffetId });
  }

  if (record.state === "closeout_complete") {
    if (!record.merge_ref) {
      ffetFindings.push({ kind: "closeout_complete_missing_merge_ref", ffetId: expectation.ffetId });
    }
    if (!record.closeout_ref) {
      ffetFindings.push({ kind: "closeout_complete_missing_closeout_ref", ffetId: expectation.ffetId });
    }
    if (!record.learning_ref) {
      ffetFindings.push({ kind: "closeout_complete_missing_learning_ref", ffetId: expectation.ffetId });
    }
  }
}

function validateQuestionDefaultAuthority(
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  const hasQuestionOrDefaultAuthority = (record.source_authority_refs ?? []).some((refHash) =>
    QUESTION_DEFAULT_AUTHORITY_PATTERN.test(refHash.ref)
  );
  if (!hasQuestionOrDefaultAuthority && ACTIVE_STATES.has(record.state)) {
    ffetFindings.push({ kind: "question_default_link_missing", ffetId: expectation.ffetId });
  }
}

function validateCannotClaim(
  expectation: H04FfetExpectation,
  record: H04FfetLifecycleRecord,
  ffetFindings: H04FfetLifecycleFinding[]
): void {
  if ((record.cannot_claim ?? []).some((claim) => PLACEHOLDER_PATTERN.test(claim))) {
    ffetFindings.push({
      kind: "cannot_claim_placeholder",
      ffetId: expectation.ffetId
    });
  }

  if (
    record.state !== "closeout_complete" &&
    !record.cannot_claim.includes("ffet_closeout_complete")
  ) {
    ffetFindings.push({
      kind: "non_closeout_ffet_missing_cannot_claim",
      ffetId: expectation.ffetId,
      expected: "ffet_closeout_complete"
    });
  }

  if (
    (record.proof_requirements ?? []).some((proof) => PROOF_OVERCLAIM_PATTERN.test(proof)) &&
    !record.cannot_claim.includes("H07_proof_engine_implemented")
  ) {
    ffetFindings.push({
      kind: "proof_overclaim_missing_cannot_claim",
      ffetId: expectation.ffetId,
      expected: "H07_proof_engine_implemented"
    });
  }
}

function finishFfetResult(
  expectation: H04FfetExpectation,
  state: H04FfetLifecycleState | "unknown",
  ffetFindings: H04FfetLifecycleFinding[],
  findings: H04FfetLifecycleFinding[],
  classifiedMismatches: H04FfetLifecycleFinding[]
): H04FfetValidationResult {
  const actualStatus: H04ExpectedFfetStatus = ffetFindings.length === 0 ? "passed" : "failed";
  const findingKinds = ffetFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "ffet_status_mismatch",
      ffetId: expectation.ffetId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedFinding of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedFinding)) {
      findings.push({
        kind: "expected_finding_missing",
        ffetId: expectation.ffetId,
        ref: expectation.ref,
        expected: expectedFinding,
        actual: findingKinds.join(",")
      });
    }
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...ffetFindings);
  } else {
    findings.push(...ffetFindings);
  }

  return {
    ffetId: expectation.ffetId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    state,
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
  findings: H04FfetLifecycleFinding[]
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
  const relativePath = relative(normalizedRoot, normalizedTarget);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function parseJson(
  text: string,
  ref: string,
  findings: H04FfetLifecycleFinding[]
): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    findings.push({
      kind: "json_parse_failed",
      ref,
      detail: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSha256(value: string, kind: string): H04FfetLifecycleFinding | null {
  if (PLACEHOLDER_PATTERN.test(value) || !SHA256_PATTERN.test(value)) {
    return { kind, actual: value };
  }
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function pathMatchesPattern(path: string, pattern: string): boolean {
  if (path === pattern) return true;
  if (!pattern.includes("*")) return false;
  const escaped = pattern
    .split("**")
    .map((part) => part.split("*").map(escapeRegex).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "u").test(path);
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
}
