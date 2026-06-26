import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H05CircuitBreakerStatus = "passed" | "failed";
export type H05ExpectedCircuitBreakerAgentStatus = "passed" | "failed";

export interface H05CircuitBreakerConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H05CircuitBreakerSchemaDescriptor;
  readonly schemaRefs?: readonly H05CircuitBreakerSchemaDescriptor[];
  readonly agents: readonly H05CircuitBreakerAgentExpectation[];
  readonly requiredCircuitBreakers?: readonly string[];
  readonly forbiddenCapabilities?: readonly string[];
  readonly forbiddenCapabilityPrefixes?: readonly string[];
  readonly forbiddenAllowedPlanes?: readonly H05Plane[];
  readonly requiredForbiddenPlanes?: readonly H05Plane[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H05CircuitBreakerSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H05CircuitBreakerAgentExpectation {
  readonly agentId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H05ExpectedCircuitBreakerAgentStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly requiredCircuitBreakers?: readonly string[];
  readonly forbiddenCapabilities?: readonly string[];
  readonly forbiddenCapabilityPrefixes?: readonly string[];
}

export interface H05CircuitBreakerReport {
  readonly status: H05CircuitBreakerStatus;
  readonly findings: readonly H05CircuitBreakerFinding[];
  readonly classified_mismatches: readonly H05CircuitBreakerFinding[];
  readonly verified_refs: readonly H05VerifiedCircuitBreakerRef[];
  readonly hash_failures: readonly H05CircuitBreakerFinding[];
  readonly agent_results: readonly H05CircuitBreakerAgentValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H05CircuitBreakerAgentValidationResult {
  readonly agentId: string;
  readonly ref: string;
  readonly status: H05ExpectedCircuitBreakerAgentStatus;
  readonly expectedStatus: H05ExpectedCircuitBreakerAgentStatus;
  readonly circuitBreakers: readonly string[];
  readonly findingKinds: readonly string[];
}

export interface H05VerifiedCircuitBreakerRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "schema_ref" | "agent";
}

export interface H05CircuitBreakerFinding {
  readonly kind: string;
  readonly agentId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H05AgentCircuitRecord {
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
  readonly evidence_requirements: readonly unknown[];
  readonly upskill_refs: readonly unknown[];
  readonly cannot_claim: readonly string[];
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
const FORCE_PUSH_PATTERN = /\bforce[_\s:-]*push\b|git:force_push/iu;
const PRODUCTION_OR_RELEASE_PATTERN =
  /\b(?:production[_\s:-]*deploy|release[_\s:-]*publish|live[_\s:-]*provider|real[_\s:-]*money)\b/iu;
const SECRET_ACCESS_PATTERN = /\b(?:secret[_\s:-]*access|production[_\s:-]*secret|credential[_\s:-]*read)\b/iu;
const HUMAN_GATE_BYPASS_PATTERN =
  /(?:bypass[_\s:-]*human|skip[_\s:-]*human|override[_\s:-]*gate|human[_\s:-]*gate[_\s:-]*bypass)/iu;
const NO_ROGUE_OVERCLAIM_PATTERN =
  /\b(?:no[_\s:-]*rogue|rogue[_\s:-]*free|all[_\s:-]*agents[_\s:-]*safe|rogue[_\s:-]*agent[_\s:-]*impossible)\b/iu;
const BROAD_WRITE_BOUNDARY_PATTERN =
  /^(?:\*|all|all[_\s-]+planes|anywhere|write[_\s-]+all|unbounded)$/iu;

export function verifyH05CircuitBreakerConfig(
  config: H05CircuitBreakerConfig
): H05CircuitBreakerReport {
  const findings: H05CircuitBreakerFinding[] = [];
  const classifiedMismatches: H05CircuitBreakerFinding[] = [];
  const verifiedRefs: H05VerifiedCircuitBreakerRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const agentResults: H05CircuitBreakerAgentValidationResult[] = [];

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
  config: H05CircuitBreakerConfig,
  findings: H05CircuitBreakerFinding[],
  verifiedRefs: H05VerifiedCircuitBreakerRef[]
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
  config: H05CircuitBreakerConfig,
  schema: H05CircuitBreakerSchemaDescriptor,
  source: "schema" | "schema_ref",
  findings: H05CircuitBreakerFinding[],
  verifiedRefs: H05VerifiedCircuitBreakerRef[]
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
  config: H05CircuitBreakerConfig,
  expectation: H05CircuitBreakerAgentExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H05CircuitBreakerFinding[],
  classifiedMismatches: H05CircuitBreakerFinding[],
  verifiedRefs: H05VerifiedCircuitBreakerRef[]
): H05CircuitBreakerAgentValidationResult {
  const agentFindings: H05CircuitBreakerFinding[] = [];
  const agentPath = resolveLogicalRef(expectation.ref, config.logicalRoots, agentFindings);
  if (!agentPath || !existsSync(agentPath)) {
    const finding: H05CircuitBreakerFinding = {
      kind: "agent_missing",
      agentId: expectation.agentId,
      ref: expectation.ref
    };
    agentFindings.push(agentPath ? { ...finding, path: agentPath } : finding);
    return finishAgentResult(expectation, [], agentFindings, findings, classifiedMismatches);
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
  if (record && record.agent_id !== expectation.agentId) {
    agentFindings.push({
      kind: "agent_id_mismatch",
      agentId: expectation.agentId,
      ref: expectation.ref,
      expected: expectation.agentId,
      actual: record.agent_id
    });
  }

  if (record && schemaValidator) {
    const valid = schemaValidator(record);
    if (!valid) {
      for (const error of schemaValidator.errors ?? []) {
        agentFindings.push(schemaErrorFinding("agent_schema_invalid", expectation, error));
      }
    }
  }

  if (record) {
    validateCircuitBreakerPolicy(config, expectation, record, agentFindings);
  }

  return finishAgentResult(
    expectation,
    record?.capabilities.filter((capability) => capability.startsWith("circuit_breaker:")) ?? [],
    agentFindings,
    findings,
    classifiedMismatches
  );
}

function validateCircuitBreakerPolicy(
  config: H05CircuitBreakerConfig,
  expectation: H05CircuitBreakerAgentExpectation,
  record: H05AgentCircuitRecord,
  agentFindings: H05CircuitBreakerFinding[]
): void {
  const requiredBreakers = [
    ...(config.requiredCircuitBreakers ?? []),
    ...(expectation.requiredCircuitBreakers ?? [])
  ];
  for (const requiredBreaker of requiredBreakers) {
    if (!record.capabilities.includes(requiredBreaker)) {
      agentFindings.push({
        kind: "required_circuit_breaker_missing",
        agentId: expectation.agentId,
        ref: expectation.ref,
        expected: requiredBreaker
      });
    }
  }

  const forbiddenCapabilities = new Set([
    ...(config.forbiddenCapabilities ?? []),
    ...(expectation.forbiddenCapabilities ?? [])
  ]);
  for (const capability of record.capabilities) {
    if (forbiddenCapabilities.has(capability)) {
      agentFindings.push({
        kind: "forbidden_capability_claim",
        agentId: expectation.agentId,
        ref: expectation.ref,
        detail: capability
      });
    }
    for (const prefix of [
      ...(config.forbiddenCapabilityPrefixes ?? []),
      ...(expectation.forbiddenCapabilityPrefixes ?? [])
    ]) {
      if (capability === prefix || capability.startsWith(`${prefix}:`)) {
        agentFindings.push({
          kind: "forbidden_capability_prefix",
          agentId: expectation.agentId,
          ref: expectation.ref,
          detail: capability
        });
      }
    }
    classifyRogueCapability(expectation, capability, agentFindings);
  }

  for (const forbiddenPlane of config.forbiddenAllowedPlanes ?? []) {
    if (record.allowed_planes.includes(forbiddenPlane)) {
      agentFindings.push({
        kind: "forbidden_allowed_plane",
        agentId: expectation.agentId,
        ref: expectation.ref,
        detail: forbiddenPlane
      });
    }
  }

  for (const requiredForbiddenPlane of config.requiredForbiddenPlanes ?? []) {
    if (!record.forbidden_planes.includes(requiredForbiddenPlane)) {
      agentFindings.push({
        kind: "required_forbidden_plane_missing",
        agentId: expectation.agentId,
        ref: expectation.ref,
        expected: requiredForbiddenPlane
      });
    }
  }

  for (const writeBoundary of record.write_boundaries) {
    if (BROAD_WRITE_BOUNDARY_PATTERN.test(writeBoundary)) {
      agentFindings.push({
        kind: "unbounded_write_boundary",
        agentId: expectation.agentId,
        ref: expectation.ref,
        detail: writeBoundary
      });
    }
  }

  const searchableText = [
    record.agent_id,
    record.role_family,
    ...record.capabilities,
    ...record.write_boundaries
  ].join(" ");
  if (STABLE_AGENT_PATTERN.test(searchableText)) {
    agentFindings.push({ kind: "stable_agent_overclaim", agentId: expectation.agentId, ref: expectation.ref });
  }
  if (MECHANICAL_INDEPENDENCE_PATTERN.test(searchableText)) {
    agentFindings.push({
      kind: "mechanical_independence_overclaim",
      agentId: expectation.agentId,
      ref: expectation.ref
    });
  }
  if (NO_ROGUE_OVERCLAIM_PATTERN.test(searchableText)) {
    agentFindings.push({ kind: "no_rogue_agent_overclaim", agentId: expectation.agentId, ref: expectation.ref });
  }

  for (const requiredClaim of config.requiredCannotClaim ?? []) {
    if (!record.cannot_claim.includes(requiredClaim)) {
      agentFindings.push({
        kind: "cannot_claim_missing_required",
        agentId: expectation.agentId,
        ref: expectation.ref,
        expected: requiredClaim
      });
    }
  }
}

function classifyRogueCapability(
  expectation: H05CircuitBreakerAgentExpectation,
  capability: string,
  agentFindings: H05CircuitBreakerFinding[]
): void {
  if (FORCE_PUSH_PATTERN.test(capability)) {
    agentFindings.push({
      kind: "force_push_capability_forbidden",
      agentId: expectation.agentId,
      ref: expectation.ref,
      detail: capability
    });
  }
  if (PRODUCTION_OR_RELEASE_PATTERN.test(capability)) {
    agentFindings.push({
      kind: "production_or_release_capability_forbidden",
      agentId: expectation.agentId,
      ref: expectation.ref,
      detail: capability
    });
  }
  if (SECRET_ACCESS_PATTERN.test(capability)) {
    agentFindings.push({
      kind: "secret_access_capability_forbidden",
      agentId: expectation.agentId,
      ref: expectation.ref,
      detail: capability
    });
  }
  if (HUMAN_GATE_BYPASS_PATTERN.test(capability)) {
    agentFindings.push({
      kind: "human_gate_bypass_claim",
      agentId: expectation.agentId,
      ref: expectation.ref,
      detail: capability
    });
  }
}

function finishAgentResult(
  expectation: H05CircuitBreakerAgentExpectation,
  circuitBreakers: readonly string[],
  agentFindings: H05CircuitBreakerFinding[],
  findings: H05CircuitBreakerFinding[],
  classifiedMismatches: H05CircuitBreakerFinding[]
): H05CircuitBreakerAgentValidationResult {
  const actualStatus: H05ExpectedCircuitBreakerAgentStatus = agentFindings.length === 0 ? "passed" : "failed";
  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "agent_status_unexpected",
      agentId: expectation.agentId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  const findingKinds = new Set(agentFindings.map((finding) => finding.kind));
  for (const expectedFindingKind of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.has(expectedFindingKind)) {
      findings.push({
        kind: "expected_negative_finding_missing",
        agentId: expectation.agentId,
        ref: expectation.ref,
        expected: expectedFindingKind
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
    circuitBreakers,
    findingKinds: [...findingKinds].sort()
  };
}

function parseAgentRecord(
  expectation: H05CircuitBreakerAgentExpectation,
  parsed: unknown,
  findings: H05CircuitBreakerFinding[]
): H05AgentCircuitRecord | null {
  if (!parsed || typeof parsed !== "object") {
    findings.push({
      kind: "agent_not_object",
      agentId: expectation.agentId,
      ref: expectation.ref
    });
    return null;
  }
  return parsed as H05AgentCircuitRecord;
}

function schemaErrorFinding(
  kind: string,
  expectation: H05CircuitBreakerAgentExpectation,
  error: ErrorObject
): H05CircuitBreakerFinding {
  return {
    kind,
    agentId: expectation.agentId,
    ref: expectation.ref,
    detail: `${error.instancePath || "/"} ${error.message ?? "schema error"}`
  };
}

function parseJson(
  text: string,
  ref: string,
  findings: H05CircuitBreakerFinding[]
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

function validateSha256(
  value: string,
  kind: string
): H05CircuitBreakerFinding | null {
  if (!SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) {
    return { kind, actual: value };
  }
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H05CircuitBreakerFinding[]
): string | null {
  if (PRIVATE_PATH_PATTERN.test(ref) || isAbsolute(ref)) {
    findings.push({ kind: "private_or_absolute_ref", ref });
    return null;
  }

  const matchingRoot = Object.entries(logicalRoots)
    .sort(([left], [right]) => right.length - left.length)
    .find(([prefix]) => ref === prefix || ref.startsWith(`${prefix}/`));
  if (!matchingRoot) {
    findings.push({ kind: "logical_root_missing", ref });
    return null;
  }

  const [prefix, root] = matchingRoot;
  const relativePath = ref === prefix ? "" : ref.slice(prefix.length + 1);
  const resolvedRoot = resolve(root);
  const resolved = resolve(resolvedRoot, relativePath);
  const relativeToRoot = relative(resolvedRoot, resolved);
  if (relativeToRoot.startsWith("..") || isAbsolute(relativeToRoot) || normalize(relativeToRoot) !== relativeToRoot) {
    findings.push({ kind: "logical_ref_path_escape", ref });
    return null;
  }
  return resolved;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
