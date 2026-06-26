import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H04CloseoutChainStatus = "passed" | "failed";
export type H04ExpectedCloseoutChainStatus = "passed" | "failed";
export type H04CloseoutChainRole =
  | "source"
  | "artifact_bundle"
  | "evidence_manifest"
  | "assurance"
  | "closeout"
  | "current_state"
  | "continuation"
  | "learning"
  | "validation"
  | "runtime";

export interface H04CloseoutChainConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H04CloseoutChainSchemaDescriptor;
  readonly chains: readonly H04CloseoutChainExpectation[];
  readonly requiredRoles?: readonly H04CloseoutChainRole[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H04CloseoutChainSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H04CloseoutChainExpectation {
  readonly chainId: string;
  readonly ref: string;
  readonly expectedStatus: H04ExpectedCloseoutChainStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H04CloseoutChainReport {
  readonly status: H04CloseoutChainStatus;
  readonly findings: readonly H04CloseoutChainFinding[];
  readonly classified_mismatches: readonly H04CloseoutChainFinding[];
  readonly verified_refs: readonly H04VerifiedCloseoutChainRef[];
  readonly hash_failures: readonly H04CloseoutChainFinding[];
  readonly chain_results: readonly H04CloseoutChainValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H04CloseoutChainValidationResult {
  readonly chainId: string;
  readonly ref: string;
  readonly status: H04ExpectedCloseoutChainStatus;
  readonly expectedStatus: H04ExpectedCloseoutChainStatus;
  readonly chainStatus: H04ChainStatus | "unknown";
  readonly linkCount: number;
  readonly findingKinds: readonly string[];
}

export interface H04VerifiedCloseoutChainRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "chain";
}

export interface H04CloseoutChainFinding {
  readonly kind: string;
  readonly chainId?: string;
  readonly linkId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H04CloseoutChainRecord {
  readonly schema_version: string;
  readonly chain_id: string;
  readonly scope_type: "box" | "ffet" | "part" | "schema_amendment" | "runtime" | "system";
  readonly scope_id: string;
  readonly ordered_links: readonly H04CloseoutChainLink[];
  readonly source_hash?: string;
  readonly artifact_bundle_hash?: string;
  readonly evidence_manifest_hash?: string;
  readonly assurance_hash?: string;
  readonly closeout_hash?: string;
  readonly current_state_hash?: string;
  readonly continuation_hash?: string;
  readonly chain_status: H04ChainStatus;
  readonly stale_links: readonly string[];
  readonly cannot_claim: readonly string[];
}

interface H04CloseoutChainLink {
  readonly link_id: string;
  readonly ref: string;
  readonly sha256: string;
  readonly role: H04CloseoutChainRole;
}

type H04ChainStatus = "valid" | "stale" | "broken" | "unable_to_verify";

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const DEFAULT_REQUIRED_ROLES: readonly H04CloseoutChainRole[] = [
  "source",
  "validation",
  "evidence_manifest",
  "learning",
  "closeout"
];
const HASH_FIELD_BY_ROLE: Partial<Record<H04CloseoutChainRole, keyof H04CloseoutChainRecord>> = {
  source: "source_hash",
  artifact_bundle: "artifact_bundle_hash",
  evidence_manifest: "evidence_manifest_hash",
  assurance: "assurance_hash",
  closeout: "closeout_hash",
  current_state: "current_state_hash",
  continuation: "continuation_hash"
};
const ROLE_ORDER: Partial<Record<H04CloseoutChainRole, number>> = {
  source: 0,
  validation: 1,
  artifact_bundle: 2,
  evidence_manifest: 2,
  learning: 3,
  assurance: 4,
  closeout: 5,
  current_state: 6,
  continuation: 7,
  runtime: 8
};

export function verifyH04CloseoutChainConfig(
  config: H04CloseoutChainConfig
): H04CloseoutChainReport {
  const findings: H04CloseoutChainFinding[] = [];
  const classifiedMismatches: H04CloseoutChainFinding[] = [];
  const verifiedRefs: H04VerifiedCloseoutChainRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const chainResults: H04CloseoutChainValidationResult[] = [];

  for (const chainExpectation of config.chains) {
    chainResults.push(
      verifyChainExpectation(
        config,
        chainExpectation,
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
    chain_results: chainResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H04CloseoutChainConfig,
  findings: H04CloseoutChainFinding[],
  verifiedRefs: H04VerifiedCloseoutChainRef[]
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

function verifyChainExpectation(
  config: H04CloseoutChainConfig,
  expectation: H04CloseoutChainExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H04CloseoutChainFinding[],
  classifiedMismatches: H04CloseoutChainFinding[],
  verifiedRefs: H04VerifiedCloseoutChainRef[]
): H04CloseoutChainValidationResult {
  const chainFindings: H04CloseoutChainFinding[] = [];
  const chainPath = resolveLogicalRef(expectation.ref, config.logicalRoots, chainFindings);
  if (!chainPath || !existsSync(chainPath)) {
    const finding: H04CloseoutChainFinding = {
      kind: "chain_missing",
      chainId: expectation.chainId,
      ref: expectation.ref
    };
    chainFindings.push(chainPath ? { ...finding, path: chainPath } : finding);
    return finishChainResult(expectation, "unknown", 0, chainFindings, findings, classifiedMismatches);
  }

  const chainText = readFileSync(chainPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(chainText)) {
    chainFindings.push({
      kind: "private_path_in_chain",
      chainId: expectation.chainId,
      ref: expectation.ref,
      path: chainPath
    });
  }

  verifiedRefs.push({
    ref: expectation.ref,
    path: chainPath,
    sha256: sha256Text(chainText),
    source: "chain"
  });

  const parsed = parseJson(chainText, expectation.ref, chainFindings);
  const record = parseChainRecord(expectation, parsed, chainFindings);
  if (!record) {
    return finishChainResult(expectation, "unknown", 0, chainFindings, findings, classifiedMismatches);
  }

  validateChainWithSchema(expectation, record, schemaValidator, chainFindings);
  verifyChainSemantics(config, expectation, record, chainFindings);

  return finishChainResult(
    expectation,
    record.chain_status,
    record.ordered_links.length,
    chainFindings,
    findings,
    classifiedMismatches
  );
}

function parseChainRecord(
  expectation: H04CloseoutChainExpectation,
  parsed: unknown,
  chainFindings: H04CloseoutChainFinding[]
): H04CloseoutChainRecord | null {
  if (!isRecord(parsed)) {
    chainFindings.push({ kind: "chain_not_object", chainId: expectation.chainId, ref: expectation.ref });
    return null;
  }

  const chainId = parsed.chain_id;
  if (chainId !== expectation.chainId) {
    chainFindings.push({
      kind: "chain_id_mismatch",
      chainId: expectation.chainId,
      ref: expectation.ref,
      expected: expectation.chainId,
      actual: typeof chainId === "string" ? chainId : "missing_or_invalid"
    });
  }

  return parsed as unknown as H04CloseoutChainRecord;
}

function validateChainWithSchema(
  expectation: H04CloseoutChainExpectation,
  record: H04CloseoutChainRecord,
  schemaValidator: ValidateFunction<unknown> | null,
  chainFindings: H04CloseoutChainFinding[]
): void {
  if (!schemaValidator) {
    chainFindings.push({ kind: "schema_validator_unavailable", chainId: expectation.chainId });
    return;
  }

  if (!schemaValidator(record)) {
    for (const issue of schemaValidator.errors ?? []) {
      const finding: H04CloseoutChainFinding = {
        kind: schemaIssueKind(issue),
        chainId: expectation.chainId
      };
      chainFindings.push(issue.message ? { ...finding, detail: issue.message } : finding);
    }
  }
}

function verifyChainSemantics(
  config: H04CloseoutChainConfig,
  expectation: H04CloseoutChainExpectation,
  record: H04CloseoutChainRecord,
  chainFindings: H04CloseoutChainFinding[]
): void {
  validateLinks(expectation, record, chainFindings);
  validateRequiredRoles(config, expectation, record, chainFindings);
  validateDeclaredHashes(expectation, record, chainFindings);
  validateChainStatus(expectation, record, chainFindings);
  validateCannotClaim(config, expectation, record, chainFindings);
}

function validateLinks(
  expectation: H04CloseoutChainExpectation,
  record: H04CloseoutChainRecord,
  chainFindings: H04CloseoutChainFinding[]
): void {
  const hashesByRef = new Map<string, string>();
  const linkIds = new Set<string>();
  let priorRoleOrder = -1;

  for (const link of record.ordered_links ?? []) {
    if (linkIds.has(link.link_id)) {
      chainFindings.push({ kind: "duplicate_link_id", chainId: expectation.chainId, linkId: link.link_id });
    }
    linkIds.add(link.link_id);

    const hashFinding = validateSha256(link.sha256, "link_sha256_invalid");
    if (hashFinding) {
      chainFindings.push({
        ...hashFinding,
        chainId: expectation.chainId,
        linkId: link.link_id,
        ref: link.ref
      });
    }

    const normalizedHash = normalizeSha256(link.sha256);
    const priorHash = hashesByRef.get(link.ref);
    if (priorHash && priorHash !== normalizedHash) {
      chainFindings.push({
        kind: "link_duplicate_ref_conflicting_hash",
        chainId: expectation.chainId,
        linkId: link.link_id,
        ref: link.ref,
        expected: priorHash,
        actual: normalizedHash
      });
    }
    hashesByRef.set(link.ref, normalizedHash);

    const roleOrder = ROLE_ORDER[link.role] ?? priorRoleOrder;
    if (roleOrder < priorRoleOrder) {
      chainFindings.push({
        kind: "chain_role_order_invalid",
        chainId: expectation.chainId,
        linkId: link.link_id,
        actual: link.role
      });
    }
    priorRoleOrder = Math.max(priorRoleOrder, roleOrder);
  }

  for (const staleLinkId of record.stale_links ?? []) {
    if (!linkIds.has(staleLinkId)) {
      chainFindings.push({
        kind: "stale_link_unknown",
        chainId: expectation.chainId,
        linkId: staleLinkId
      });
    }
  }
}

function validateRequiredRoles(
  config: H04CloseoutChainConfig,
  expectation: H04CloseoutChainExpectation,
  record: H04CloseoutChainRecord,
  chainFindings: H04CloseoutChainFinding[]
): void {
  const roles = new Set(record.ordered_links.map((link) => link.role));
  for (const role of config.requiredRoles ?? DEFAULT_REQUIRED_ROLES) {
    if (!roles.has(role)) {
      chainFindings.push({
        kind: role === "learning" ? "terminal_learning_missing" : `${role}_link_missing`,
        chainId: expectation.chainId,
        expected: role
      });
    }
  }
}

function validateDeclaredHashes(
  expectation: H04CloseoutChainExpectation,
  record: H04CloseoutChainRecord,
  chainFindings: H04CloseoutChainFinding[]
): void {
  for (const role of Object.keys(HASH_FIELD_BY_ROLE) as H04CloseoutChainRole[]) {
    const field = HASH_FIELD_BY_ROLE[role];
    if (!field) continue;
    const declaredHash = record[field];
    if (typeof declaredHash !== "string") continue;
    const matchingLink = record.ordered_links.find((link) => link.role === role);
    if (!matchingLink) continue;
    const normalizedDeclared = normalizeSha256(declaredHash);
    const normalizedLink = normalizeSha256(matchingLink.sha256);
    if (normalizedDeclared !== normalizedLink) {
      chainFindings.push({
        kind: `${role}_declared_hash_mismatch`,
        chainId: expectation.chainId,
        linkId: matchingLink.link_id,
        expected: normalizedLink,
        actual: normalizedDeclared
      });
    }
  }
}

function validateChainStatus(
  expectation: H04CloseoutChainExpectation,
  record: H04CloseoutChainRecord,
  chainFindings: H04CloseoutChainFinding[]
): void {
  if (record.chain_status === "valid" && (record.stale_links ?? []).length > 0) {
    chainFindings.push({ kind: "valid_chain_has_stale_links", chainId: expectation.chainId });
  }

  if (record.chain_status !== "valid" && (record.stale_links ?? []).length === 0) {
    chainFindings.push({
      kind: "non_valid_chain_missing_stale_or_broken_links",
      chainId: expectation.chainId,
      actual: record.chain_status
    });
  }
}

function validateCannotClaim(
  config: H04CloseoutChainConfig,
  expectation: H04CloseoutChainExpectation,
  record: H04CloseoutChainRecord,
  chainFindings: H04CloseoutChainFinding[]
): void {
  if ((record.cannot_claim ?? []).some((claim) => PLACEHOLDER_PATTERN.test(claim))) {
    chainFindings.push({ kind: "cannot_claim_placeholder", chainId: expectation.chainId });
  }

  for (const requiredClaim of config.requiredCannotClaim ?? []) {
    if (!record.cannot_claim.includes(requiredClaim)) {
      chainFindings.push({
        kind: "cannot_claim_missing_required",
        chainId: expectation.chainId,
        expected: requiredClaim
      });
    }
  }
}

function finishChainResult(
  expectation: H04CloseoutChainExpectation,
  chainStatus: H04ChainStatus | "unknown",
  linkCount: number,
  chainFindings: H04CloseoutChainFinding[],
  findings: H04CloseoutChainFinding[],
  classifiedMismatches: H04CloseoutChainFinding[]
): H04CloseoutChainValidationResult {
  const actualStatus: H04ExpectedCloseoutChainStatus = chainFindings.length === 0 ? "passed" : "failed";
  const findingKinds = chainFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "chain_status_mismatch",
      chainId: expectation.chainId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedFinding of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedFinding)) {
      findings.push({
        kind: "expected_finding_missing",
        chainId: expectation.chainId,
        ref: expectation.ref,
        expected: expectedFinding,
        actual: findingKinds.join(",")
      });
    }
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...chainFindings);
  } else {
    findings.push(...chainFindings);
  }

  return {
    chainId: expectation.chainId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    chainStatus,
    linkCount,
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
  findings: H04CloseoutChainFinding[]
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
  findings: H04CloseoutChainFinding[]
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

function validateSha256(value: string, kind: string): H04CloseoutChainFinding | null {
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
