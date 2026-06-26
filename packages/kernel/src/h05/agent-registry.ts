import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H05AgentRegistryStatus = "passed" | "failed";
export type H05ExpectedAgentStatus = "passed" | "failed";

export interface H05AgentRegistryConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H05AgentRegistrySchemaDescriptor;
  readonly schemaRefs?: readonly H05AgentRegistrySchemaDescriptor[];
  readonly agents: readonly H05AgentExpectation[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H05AgentRegistrySchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H05AgentExpectation {
  readonly agentId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H05ExpectedAgentStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H05AgentRegistryReport {
  readonly status: H05AgentRegistryStatus;
  readonly findings: readonly H05AgentRegistryFinding[];
  readonly classified_mismatches: readonly H05AgentRegistryFinding[];
  readonly verified_refs: readonly H05VerifiedAgentRegistryRef[];
  readonly hash_failures: readonly H05AgentRegistryFinding[];
  readonly agent_results: readonly H05AgentValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H05AgentValidationResult {
  readonly agentId: string;
  readonly ref: string;
  readonly status: H05ExpectedAgentStatus;
  readonly expectedStatus: H05ExpectedAgentStatus;
  readonly qualificationStatus: H05AgentQualificationStatus | "unknown";
  readonly boundedUseStatus: H05AgentBoundedUseStatus | "unknown";
  readonly findingKinds: readonly string[];
}

export interface H05VerifiedAgentRegistryRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "schema_ref" | "agent";
}

export interface H05AgentRegistryFinding {
  readonly kind: string;
  readonly agentId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H05AgentRegistryRecord {
  readonly schema_version: string;
  readonly agent_id: string;
  readonly version: string;
  readonly role_family: string;
  readonly capabilities: readonly string[];
  readonly allowed_planes: readonly H05Plane[];
  readonly forbidden_planes: readonly H05Plane[];
  readonly write_boundaries: readonly string[];
  readonly qualification_status: H05AgentQualificationStatus;
  readonly bounded_use_status: H05AgentBoundedUseStatus;
  readonly evidence_requirements: readonly H05RefHash[];
  readonly upskill_refs: readonly H05RefHash[];
  readonly cannot_claim: readonly string[];
}

interface H05RefHash {
  readonly ref: string;
  readonly sha256: string;
}

type H05Plane = "product" | "control" | "evidence" | "runtime" | "release" | "input";

type H05AgentQualificationStatus =
  | "draft"
  | "fixture_tested"
  | "bounded_for_scope"
  | "suspended"
  | "deprecated";

type H05AgentBoundedUseStatus =
  | "not_allowed"
  | "bounded_for_h04_h06"
  | "bounded_for_h04"
  | "bounded_for_h05"
  | "bounded_for_h06";

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const STABLE_AGENT_PATTERN = /\bstable(?:[_\s-]+agent|[_\s-]+agents)?\b/iu;
const MECHANICAL_INDEPENDENCE_PATTERN =
  /\b(?:mechanically[_\s-]+independent|independent[_\s-]+quality[_\s-]+auditor|independent[_\s-]+process)(?:\b|[_\s-])/iu;
const BROAD_WRITE_BOUNDARY_PATTERN = /^(?:\*|all|all[_\s-]+planes|anywhere)$/iu;

export function verifyH05AgentRegistryConfig(
  config: H05AgentRegistryConfig
): H05AgentRegistryReport {
  const findings: H05AgentRegistryFinding[] = [];
  const classifiedMismatches: H05AgentRegistryFinding[] = [];
  const verifiedRefs: H05VerifiedAgentRegistryRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const agentResults: H05AgentValidationResult[] = [];

  for (const agentExpectation of config.agents) {
    agentResults.push(
      verifyAgentExpectation(
        config,
        agentExpectation,
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
    agent_results: agentResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H05AgentRegistryConfig,
  findings: H05AgentRegistryFinding[],
  verifiedRefs: H05VerifiedAgentRegistryRef[]
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
  config: H05AgentRegistryConfig,
  schema: H05AgentRegistrySchemaDescriptor,
  source: "schema" | "schema_ref",
  findings: H05AgentRegistryFinding[],
  verifiedRefs: H05VerifiedAgentRegistryRef[]
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

  verifiedRefs.push({
    ref: schema.ref,
    path: schemaPath,
    sha256: actualHash,
    source
  });

  return parseJson(schemaText, schema.ref, findings);
}

function verifyAgentExpectation(
  config: H05AgentRegistryConfig,
  expectation: H05AgentExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H05AgentRegistryFinding[],
  classifiedMismatches: H05AgentRegistryFinding[],
  verifiedRefs: H05VerifiedAgentRegistryRef[]
): H05AgentValidationResult {
  const agentFindings: H05AgentRegistryFinding[] = [];
  const agentPath = resolveLogicalRef(expectation.ref, config.logicalRoots, agentFindings);
  if (!agentPath || !existsSync(agentPath)) {
    const finding: H05AgentRegistryFinding = {
      kind: "agent_missing",
      agentId: expectation.agentId,
      ref: expectation.ref
    };
    agentFindings.push(agentPath ? { ...finding, path: agentPath } : finding);
    return finishAgentResult(
      expectation,
      "unknown",
      "unknown",
      agentFindings,
      findings,
      classifiedMismatches
    );
  }

  const hashFinding = validateSha256(expectation.sha256, "agent_hash_invalid");
  if (hashFinding) {
    agentFindings.push({ ...hashFinding, agentId: expectation.agentId, ref: expectation.ref });
  }

  const agentText = readFileSync(agentPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(agentText)) {
    agentFindings.push({
      kind: "private_path_in_agent",
      agentId: expectation.agentId,
      ref: expectation.ref,
      path: agentPath
    });
  }

  const actualHash = sha256Text(agentText);
  const expectedHash = normalizeSha256(expectation.sha256);
  if (!hashFinding && actualHash !== expectedHash) {
    agentFindings.push({
      kind: "agent_hash_mismatch",
      agentId: expectation.agentId,
      ref: expectation.ref,
      path: agentPath,
      expected: expectedHash,
      actual: actualHash
    });
  }

  verifiedRefs.push({
    ref: expectation.ref,
    path: agentPath,
    sha256: actualHash,
    source: "agent"
  });

  const parsed = parseJson(agentText, expectation.ref, agentFindings);
  const record = parseAgentRecord(expectation, parsed, agentFindings);
  if (!record) {
    return finishAgentResult(
      expectation,
      "unknown",
      "unknown",
      agentFindings,
      findings,
      classifiedMismatches
    );
  }

  validateAgentWithSchema(expectation, record, schemaValidator, agentFindings);
  verifyAgentSemantics(config, expectation, record, agentFindings);

  return finishAgentResult(
    expectation,
    record.qualification_status,
    record.bounded_use_status,
    agentFindings,
    findings,
    classifiedMismatches
  );
}

function parseAgentRecord(
  expectation: H05AgentExpectation,
  parsed: unknown,
  agentFindings: H05AgentRegistryFinding[]
): H05AgentRegistryRecord | null {
  if (!isRecord(parsed)) {
    agentFindings.push({ kind: "agent_not_object", agentId: expectation.agentId, ref: expectation.ref });
    return null;
  }

  const agentId = parsed.agent_id;
  if (agentId !== expectation.agentId) {
    agentFindings.push({
      kind: "agent_id_mismatch",
      agentId: expectation.agentId,
      ref: expectation.ref,
      expected: expectation.agentId,
      actual: typeof agentId === "string" ? agentId : "missing_or_invalid"
    });
  }

  return parsed as unknown as H05AgentRegistryRecord;
}

function validateAgentWithSchema(
  expectation: H05AgentExpectation,
  record: H05AgentRegistryRecord,
  schemaValidator: ValidateFunction<unknown> | null,
  agentFindings: H05AgentRegistryFinding[]
): void {
  if (!schemaValidator) {
    agentFindings.push({ kind: "schema_validator_unavailable", agentId: expectation.agentId });
    return;
  }

  if (!schemaValidator(record)) {
    for (const issue of schemaValidator.errors ?? []) {
      const finding: H05AgentRegistryFinding = {
        kind: schemaIssueKind(issue),
        agentId: expectation.agentId
      };
      agentFindings.push(issue.message ? { ...finding, detail: issue.message } : finding);
    }
  }
}

function verifyAgentSemantics(
  config: H05AgentRegistryConfig,
  expectation: H05AgentExpectation,
  record: H05AgentRegistryRecord,
  agentFindings: H05AgentRegistryFinding[]
): void {
  validatePlaneBoundaries(expectation, record, agentFindings);
  validateRefHashes("evidence_requirement", expectation, record.evidence_requirements ?? [], agentFindings);
  validateRefHashes("upskill_ref", expectation, record.upskill_refs ?? [], agentFindings);
  validateQualificationEvidence(expectation, record, agentFindings);
  validateCannotClaim(config, expectation, record, agentFindings);
  validateOverclaims(expectation, record, agentFindings);
}

function validatePlaneBoundaries(
  expectation: H05AgentExpectation,
  record: H05AgentRegistryRecord,
  agentFindings: H05AgentRegistryFinding[]
): void {
  const forbiddenPlanes = new Set(record.forbidden_planes ?? []);
  for (const plane of record.allowed_planes ?? []) {
    if (forbiddenPlanes.has(plane)) {
      agentFindings.push({
        kind: "plane_boundary_overlap",
        agentId: expectation.agentId,
        detail: plane
      });
    }
  }

  for (const boundary of record.write_boundaries ?? []) {
    if (BROAD_WRITE_BOUNDARY_PATTERN.test(boundary)) {
      agentFindings.push({
        kind: "write_boundary_too_broad",
        agentId: expectation.agentId,
        detail: boundary
      });
    }
  }
}

function validateRefHashes(
  collectionKind: string,
  expectation: H05AgentExpectation,
  refs: readonly H05RefHash[],
  agentFindings: H05AgentRegistryFinding[]
): void {
  const hashesByRef = new Map<string, string>();
  for (const refHash of refs) {
    const hashFinding = validateSha256(refHash.sha256, `${collectionKind}_sha256_invalid`);
    if (hashFinding) {
      agentFindings.push({
        ...hashFinding,
        agentId: expectation.agentId,
        ref: refHash.ref
      });
      continue;
    }

    const normalizedHash = normalizeSha256(refHash.sha256);
    const priorHash = hashesByRef.get(refHash.ref);
    if (priorHash && priorHash !== normalizedHash) {
      agentFindings.push({
        kind: `${collectionKind}_duplicate_ref_conflicting_hash`,
        agentId: expectation.agentId,
        ref: refHash.ref,
        expected: priorHash,
        actual: normalizedHash
      });
    }
    hashesByRef.set(refHash.ref, normalizedHash);
  }
}

function validateQualificationEvidence(
  expectation: H05AgentExpectation,
  record: H05AgentRegistryRecord,
  agentFindings: H05AgentRegistryFinding[]
): void {
  if (
    record.qualification_status === "bounded_for_scope" &&
    (record.evidence_requirements ?? []).length === 0
  ) {
    agentFindings.push({
      kind: "bounded_agent_missing_evidence_requirement",
      agentId: expectation.agentId
    });
  }

  if (
    record.qualification_status === "bounded_for_scope" &&
    (record.upskill_refs ?? []).length === 0
  ) {
    agentFindings.push({
      kind: "bounded_agent_missing_upskill_ref",
      agentId: expectation.agentId
    });
  }
}

function validateCannotClaim(
  config: H05AgentRegistryConfig,
  expectation: H05AgentExpectation,
  record: H05AgentRegistryRecord,
  agentFindings: H05AgentRegistryFinding[]
): void {
  const claims = new Set(record.cannot_claim ?? []);
  for (const requiredClaim of config.requiredCannotClaim ?? []) {
    if (!claims.has(requiredClaim)) {
      agentFindings.push({
        kind: "cannot_claim_missing_required",
        agentId: expectation.agentId,
        expected: requiredClaim
      });
    }
  }

  if ((record.cannot_claim ?? []).some((claim) => PLACEHOLDER_PATTERN.test(claim))) {
    agentFindings.push({
      kind: "cannot_claim_placeholder",
      agentId: expectation.agentId
    });
  }
}

function validateOverclaims(
  expectation: H05AgentExpectation,
  record: H05AgentRegistryRecord,
  agentFindings: H05AgentRegistryFinding[]
): void {
  const claimText = [
    record.role_family,
    ...record.capabilities,
    ...record.write_boundaries
  ].join(" ");

  if (STABLE_AGENT_PATTERN.test(claimText)) {
    agentFindings.push({
      kind: "stable_agent_overclaim",
      agentId: expectation.agentId
    });
  }

  if (MECHANICAL_INDEPENDENCE_PATTERN.test(claimText)) {
    agentFindings.push({
      kind: "mechanical_independence_overclaim",
      agentId: expectation.agentId
    });
  }
}

function finishAgentResult(
  expectation: H05AgentExpectation,
  qualificationStatus: H05AgentQualificationStatus | "unknown",
  boundedUseStatus: H05AgentBoundedUseStatus | "unknown",
  agentFindings: H05AgentRegistryFinding[],
  findings: H05AgentRegistryFinding[],
  classifiedMismatches: H05AgentRegistryFinding[]
): H05AgentValidationResult {
  const actualStatus: H05ExpectedAgentStatus = agentFindings.length === 0 ? "passed" : "failed";
  const findingKinds = agentFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "agent_status_mismatch",
      agentId: expectation.agentId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedFinding of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedFinding)) {
      findings.push({
        kind: "expected_finding_missing",
        agentId: expectation.agentId,
        ref: expectation.ref,
        expected: expectedFinding,
        actual: findingKinds.join(",")
      });
    }
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...agentFindings);
  } else {
    findings.push(...agentFindings);
  }

  return {
    agentId: expectation.agentId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    qualificationStatus,
    boundedUseStatus,
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
  findings: H05AgentRegistryFinding[]
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
  findings: H05AgentRegistryFinding[]
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

function validateSha256(value: string | undefined, kind: string): H05AgentRegistryFinding | null {
  if (!value || !SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) {
    return {
      kind,
      actual: value ?? "missing"
    };
  }
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
