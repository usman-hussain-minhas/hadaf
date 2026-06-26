import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H05CapabilityContractStatus = "passed" | "failed";
export type H05ExpectedCapabilityCardStatus = "passed" | "failed";

export interface H05CapabilityContractConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H05CapabilitySchemaDescriptor;
  readonly schemaRefs?: readonly H05CapabilitySchemaDescriptor[];
  readonly cards: readonly H05CapabilityCardExpectation[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H05CapabilitySchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H05CapabilityCardExpectation {
  readonly agentId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H05ExpectedCapabilityCardStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly allowedCapabilities?: readonly string[];
  readonly requiredCapabilities?: readonly string[];
  readonly allowedCapabilityPrefixes?: readonly string[];
}

export interface H05CapabilityContractReport {
  readonly status: H05CapabilityContractStatus;
  readonly findings: readonly H05CapabilityContractFinding[];
  readonly classified_mismatches: readonly H05CapabilityContractFinding[];
  readonly verified_refs: readonly H05VerifiedCapabilityRef[];
  readonly hash_failures: readonly H05CapabilityContractFinding[];
  readonly card_results: readonly H05CapabilityCardValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H05CapabilityCardValidationResult {
  readonly agentId: string;
  readonly ref: string;
  readonly status: H05ExpectedCapabilityCardStatus;
  readonly expectedStatus: H05ExpectedCapabilityCardStatus;
  readonly capabilities: readonly string[];
  readonly findingKinds: readonly string[];
}

export interface H05VerifiedCapabilityRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "schema_ref" | "card";
}

export interface H05CapabilityContractFinding {
  readonly kind: string;
  readonly agentId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H05AgentCardRecord {
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
const PRIVATE_PROMPT_PATTERN =
  /\b(?:private[_\s-]+prompt|system[_\s-]+prompt|operator[_\s-]+instruction|hidden[_\s-]+instruction)\b|\/Users\/|\/Volumes\/|file:\/\//iu;
const BROAD_WRITE_BOUNDARY_PATTERN =
  /^(?:\*|all|all[_\s-]+planes|anywhere|write[_\s-]+all|unbounded)$/iu;
const FORBIDDEN_OPERATION_PATTERN =
  /\b(?:force[_\s-]+push|production[_\s-]+deploy|real[_\s-]+money|live[_\s-]+provider|write[_\s-]+all[_\s-]+planes|merge[_\s-]+pull[_\s-]+request)\b/iu;

export function verifyH05CapabilityContractConfig(
  config: H05CapabilityContractConfig
): H05CapabilityContractReport {
  const findings: H05CapabilityContractFinding[] = [];
  const classifiedMismatches: H05CapabilityContractFinding[] = [];
  const verifiedRefs: H05VerifiedCapabilityRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const cardResults: H05CapabilityCardValidationResult[] = [];

  for (const cardExpectation of config.cards) {
    cardResults.push(
      verifyCardExpectation(
        config,
        cardExpectation,
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
    card_results: cardResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H05CapabilityContractConfig,
  findings: H05CapabilityContractFinding[],
  verifiedRefs: H05VerifiedCapabilityRef[]
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
  config: H05CapabilityContractConfig,
  schema: H05CapabilitySchemaDescriptor,
  source: "schema" | "schema_ref",
  findings: H05CapabilityContractFinding[],
  verifiedRefs: H05VerifiedCapabilityRef[]
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

function verifyCardExpectation(
  config: H05CapabilityContractConfig,
  expectation: H05CapabilityCardExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H05CapabilityContractFinding[],
  classifiedMismatches: H05CapabilityContractFinding[],
  verifiedRefs: H05VerifiedCapabilityRef[]
): H05CapabilityCardValidationResult {
  const cardFindings: H05CapabilityContractFinding[] = [];
  const cardPath = resolveLogicalRef(expectation.ref, config.logicalRoots, cardFindings);
  if (!cardPath || !existsSync(cardPath)) {
    const finding: H05CapabilityContractFinding = {
      kind: "card_missing",
      agentId: expectation.agentId,
      ref: expectation.ref
    };
    cardFindings.push(cardPath ? { ...finding, path: cardPath } : finding);
    return finishCardResult(expectation, [], cardFindings, findings, classifiedMismatches);
  }

  const hashFinding = validateSha256(expectation.sha256, "card_hash_invalid");
  if (hashFinding) {
    cardFindings.push({ ...hashFinding, agentId: expectation.agentId, ref: expectation.ref });
  }

  const cardText = readFileSync(cardPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(cardText)) {
    cardFindings.push({
      kind: "private_path_in_card",
      agentId: expectation.agentId,
      ref: expectation.ref,
      path: cardPath
    });
  }

  const actualHash = sha256Text(cardText);
  const expectedHash = normalizeSha256(expectation.sha256);
  if (!hashFinding && actualHash !== expectedHash) {
    cardFindings.push({
      kind: "card_hash_mismatch",
      agentId: expectation.agentId,
      ref: expectation.ref,
      path: cardPath,
      expected: expectedHash,
      actual: actualHash
    });
  }

  verifiedRefs.push({
    ref: expectation.ref,
    path: cardPath,
    sha256: actualHash,
    source: "card"
  });

  const parsed = parseJson(cardText, expectation.ref, cardFindings);
  const record = parseCardRecord(expectation, parsed, cardFindings);
  if (!record) {
    return finishCardResult(expectation, [], cardFindings, findings, classifiedMismatches);
  }

  validateCardWithSchema(expectation, record, schemaValidator, cardFindings);
  verifyCapabilitySemantics(config, expectation, record, cardFindings);

  return finishCardResult(
    expectation,
    record.capabilities ?? [],
    cardFindings,
    findings,
    classifiedMismatches
  );
}

function parseCardRecord(
  expectation: H05CapabilityCardExpectation,
  parsed: unknown,
  cardFindings: H05CapabilityContractFinding[]
): H05AgentCardRecord | null {
  if (!isRecord(parsed)) {
    cardFindings.push({ kind: "card_not_object", agentId: expectation.agentId, ref: expectation.ref });
    return null;
  }

  const agentId = parsed.agent_id;
  if (agentId !== expectation.agentId) {
    cardFindings.push({
      kind: "agent_id_mismatch",
      agentId: expectation.agentId,
      ref: expectation.ref,
      expected: expectation.agentId,
      actual: typeof agentId === "string" ? agentId : "missing_or_invalid"
    });
  }

  return parsed as unknown as H05AgentCardRecord;
}

function validateCardWithSchema(
  expectation: H05CapabilityCardExpectation,
  record: H05AgentCardRecord,
  schemaValidator: ValidateFunction<unknown> | null,
  cardFindings: H05CapabilityContractFinding[]
): void {
  if (!schemaValidator) {
    cardFindings.push({ kind: "schema_validator_unavailable", agentId: expectation.agentId });
    return;
  }

  if (!schemaValidator(record)) {
    for (const issue of schemaValidator.errors ?? []) {
      const finding: H05CapabilityContractFinding = {
        kind: schemaIssueKind(issue),
        agentId: expectation.agentId
      };
      cardFindings.push(issue.message ? { ...finding, detail: issue.message } : finding);
    }
  }
}

function verifyCapabilitySemantics(
  config: H05CapabilityContractConfig,
  expectation: H05CapabilityCardExpectation,
  record: H05AgentCardRecord,
  cardFindings: H05CapabilityContractFinding[]
): void {
  validateRequiredCapabilities(expectation, record, cardFindings);
  validateAllowedCapabilities(expectation, record, cardFindings);
  validateWriteBoundaries(expectation, record, cardFindings);
  validatePrivatePromptExposure(expectation, record, cardFindings);
  validateCannotClaim(config, expectation, record, cardFindings);
  validateCapabilityOverclaims(expectation, record, cardFindings);
}

function validateRequiredCapabilities(
  expectation: H05CapabilityCardExpectation,
  record: H05AgentCardRecord,
  cardFindings: H05CapabilityContractFinding[]
): void {
  const capabilities = new Set(record.capabilities ?? []);
  for (const requiredCapability of expectation.requiredCapabilities ?? []) {
    if (!capabilities.has(requiredCapability)) {
      cardFindings.push({
        kind: "required_capability_missing",
        agentId: expectation.agentId,
        expected: requiredCapability
      });
    }
  }
}

function validateAllowedCapabilities(
  expectation: H05CapabilityCardExpectation,
  record: H05AgentCardRecord,
  cardFindings: H05CapabilityContractFinding[]
): void {
  const allowedCapabilities = new Set(expectation.allowedCapabilities ?? []);
  const allowedPrefixes = new Set(expectation.allowedCapabilityPrefixes ?? []);

  for (const capability of record.capabilities ?? []) {
    const prefix = capability.includes(":") ? capability.split(":")[0] : "";
    if (
      allowedCapabilities.size > 0 &&
      !allowedCapabilities.has(capability)
    ) {
      cardFindings.push({
        kind: "unsupported_capability_claim",
        agentId: expectation.agentId,
        detail: capability
      });
      continue;
    }

    if (
      allowedPrefixes.size > 0 &&
      (!prefix || !allowedPrefixes.has(prefix))
    ) {
      cardFindings.push({
        kind: "unsupported_capability_adapter",
        agentId: expectation.agentId,
        detail: capability
      });
    }
  }
}

function validateWriteBoundaries(
  expectation: H05CapabilityCardExpectation,
  record: H05AgentCardRecord,
  cardFindings: H05CapabilityContractFinding[]
): void {
  for (const boundary of record.write_boundaries ?? []) {
    if (BROAD_WRITE_BOUNDARY_PATTERN.test(boundary) || FORBIDDEN_OPERATION_PATTERN.test(boundary)) {
      cardFindings.push({
        kind: "write_permission_overclaim",
        agentId: expectation.agentId,
        detail: boundary
      });
    }
  }

  for (const capability of record.capabilities ?? []) {
    if (FORBIDDEN_OPERATION_PATTERN.test(capability)) {
      cardFindings.push({
        kind: "unsupported_tool_capability",
        agentId: expectation.agentId,
        detail: capability
      });
    }
  }
}

function validatePrivatePromptExposure(
  expectation: H05CapabilityCardExpectation,
  record: H05AgentCardRecord,
  cardFindings: H05CapabilityContractFinding[]
): void {
  const searchableText = [
    record.role_family,
    ...record.capabilities,
    ...record.write_boundaries,
    ...record.cannot_claim
  ].join(" ");
  if (PRIVATE_PROMPT_PATTERN.test(searchableText)) {
    cardFindings.push({
      kind: "private_prompt_or_instruction_exposure",
      agentId: expectation.agentId
    });
  }
}

function validateCannotClaim(
  config: H05CapabilityContractConfig,
  expectation: H05CapabilityCardExpectation,
  record: H05AgentCardRecord,
  cardFindings: H05CapabilityContractFinding[]
): void {
  const claims = new Set(record.cannot_claim ?? []);
  for (const requiredClaim of config.requiredCannotClaim ?? []) {
    if (!claims.has(requiredClaim)) {
      cardFindings.push({
        kind: "cannot_claim_missing_required",
        agentId: expectation.agentId,
        expected: requiredClaim
      });
    }
  }
}

function validateCapabilityOverclaims(
  expectation: H05CapabilityCardExpectation,
  record: H05AgentCardRecord,
  cardFindings: H05CapabilityContractFinding[]
): void {
  const claimText = [
    record.role_family,
    ...record.capabilities,
    ...record.write_boundaries
  ].join(" ");

  if (STABLE_AGENT_PATTERN.test(claimText)) {
    cardFindings.push({
      kind: "stable_agent_overclaim",
      agentId: expectation.agentId
    });
  }

  if (MECHANICAL_INDEPENDENCE_PATTERN.test(claimText)) {
    cardFindings.push({
      kind: "mechanical_independence_overclaim",
      agentId: expectation.agentId
    });
  }
}

function finishCardResult(
  expectation: H05CapabilityCardExpectation,
  capabilities: readonly string[],
  cardFindings: H05CapabilityContractFinding[],
  findings: H05CapabilityContractFinding[],
  classifiedMismatches: H05CapabilityContractFinding[]
): H05CapabilityCardValidationResult {
  const actualStatus: H05ExpectedCapabilityCardStatus = cardFindings.length === 0 ? "passed" : "failed";
  const findingKinds = cardFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "card_status_mismatch",
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
    classifiedMismatches.push(...cardFindings);
  } else {
    findings.push(...cardFindings);
  }

  return {
    agentId: expectation.agentId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    capabilities,
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
  findings: H05CapabilityContractFinding[]
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
  findings: H05CapabilityContractFinding[]
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

function validateSha256(value: string | undefined, kind: string): H05CapabilityContractFinding | null {
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
