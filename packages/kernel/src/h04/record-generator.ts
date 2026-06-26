import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H04RecordGeneratorStatus = "passed" | "failed";
export type H04ExpectedRecordGeneratorStatus = "passed" | "failed";
export type H04RecordGeneratorClaimEligibility =
  | "eligible"
  | "not_eligible"
  | "draft_only"
  | "blocked";
export type H04RecordGeneratorPlaceholderScan = "passed" | "failed" | "not_run";

export interface H04RecordGeneratorConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H04RecordGeneratorSchemaDescriptor;
  readonly schemaRefs?: readonly H04RecordGeneratorSchemaDescriptor[];
  readonly requests: readonly H04RecordGeneratorExpectation[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H04RecordGeneratorSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H04RecordGeneratorExpectation {
  readonly requestId: string;
  readonly ref: string;
  readonly expectedStatus: H04ExpectedRecordGeneratorStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H04RecordGeneratorReport {
  readonly status: H04RecordGeneratorStatus;
  readonly findings: readonly H04RecordGeneratorFinding[];
  readonly classified_mismatches: readonly H04RecordGeneratorFinding[];
  readonly verified_refs: readonly H04RecordGeneratorVerifiedRef[];
  readonly hash_failures: readonly H04RecordGeneratorFinding[];
  readonly request_results: readonly H04RecordGeneratorValidationResult[];
  readonly generated_records: readonly H04GeneratedRecord[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H04RecordGeneratorValidationResult {
  readonly requestId: string;
  readonly ref: string;
  readonly status: H04ExpectedRecordGeneratorStatus;
  readonly expectedStatus: H04ExpectedRecordGeneratorStatus;
  readonly claimEligibility: H04RecordGeneratorClaimEligibility | "unknown";
  readonly missingFields: readonly string[];
  readonly findingKinds: readonly string[];
}

export interface H04RecordGeneratorVerifiedRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "schema_ref" | "request" | "template" | "output";
}

export interface H04RecordGeneratorFinding {
  readonly kind: string;
  readonly requestId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H04RecordGeneratorRequest {
  readonly schema_version: "hadaf_record_generator_request_v1";
  readonly request_id: string;
  readonly generator_id: string;
  readonly template_ref: string;
  readonly template_hash: string;
  readonly output_ref: string;
  readonly output_hash: string;
  readonly artifact_purpose: H04ArtifactPurpose;
  readonly required_fields: readonly string[];
  readonly provided_fields: Record<string, unknown>;
  readonly claim_eligibility?: H04RecordGeneratorClaimEligibility;
  readonly cannot_claim: readonly string[];
}

export interface H04GeneratedRecord {
  readonly schema_version: "1.0.0";
  readonly generator_id: string;
  readonly template_ref: string;
  readonly template_hash: string;
  readonly output_ref: string;
  readonly output_hash: string;
  readonly required_fields: readonly string[];
  readonly missing_fields: readonly string[];
  readonly placeholder_scan: H04RecordGeneratorPlaceholderScan;
  readonly artifact_purpose: H04ArtifactPurpose;
  readonly claim_eligibility: H04RecordGeneratorClaimEligibility;
  readonly cannot_claim: readonly string[];
}

type H04ArtifactPurpose =
  | "authority"
  | "control"
  | "evidence"
  | "runtime"
  | "product_fixture"
  | "generated_view"
  | "validation"
  | "closeout"
  | "learning"
  | "assurance"
  | "current_state"
  | "continuation"
  | "draft";

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const TRANSIENT_REF_PATTERN = /(?:^tmp:\/\/|^scratch:\/\/|\/tmp\/|\/\/transient\/|\/\/scratch\/)/iu;

export function verifyH04RecordGeneratorConfig(
  config: H04RecordGeneratorConfig
): H04RecordGeneratorReport {
  const findings: H04RecordGeneratorFinding[] = [];
  const classifiedMismatches: H04RecordGeneratorFinding[] = [];
  const verifiedRefs: H04RecordGeneratorVerifiedRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const requestResults: H04RecordGeneratorValidationResult[] = [];
  const generatedRecords: H04GeneratedRecord[] = [];

  for (const expectation of config.requests) {
    const result = verifyRequestExpectation(
      config,
      expectation,
      schemaValidator,
      findings,
      classifiedMismatches,
      verifiedRefs
    );
    requestResults.push(result.result);
    if (result.generatedRecord) generatedRecords.push(result.generatedRecord);
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
    request_results: requestResults,
    generated_records: generatedRecords,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

export function generateH04RecordFromRequest(
  request: H04RecordGeneratorRequest
): H04GeneratedRecord {
  const missingFields = request.required_fields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(request.provided_fields, field)
  );
  const placeholderScan = hasPlaceholder(request) ? "failed" : "passed";
  const computedEligibility =
    missingFields.length === 0 && placeholderScan === "passed" ? "eligible" : "blocked";

  return {
    schema_version: "1.0.0",
    generator_id: request.generator_id,
    template_ref: request.template_ref,
    template_hash: normalizeSha256(request.template_hash),
    output_ref: request.output_ref,
    output_hash: normalizeSha256(request.output_hash),
    required_fields: [...request.required_fields],
    missing_fields: missingFields,
    placeholder_scan: placeholderScan,
    artifact_purpose: request.artifact_purpose,
    claim_eligibility: request.claim_eligibility ?? computedEligibility,
    cannot_claim: [...request.cannot_claim]
  };
}

function loadSchemaValidator(
  config: H04RecordGeneratorConfig,
  findings: H04RecordGeneratorFinding[],
  verifiedRefs: H04RecordGeneratorVerifiedRef[]
): ValidateFunction<unknown> | null {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const schemaRef of config.schemaRefs ?? []) {
    const schema = loadSchema(config, schemaRef, "schema_ref", findings, verifiedRefs);
    if (!schema) return null;
    ajv.addSchema(schema as AnySchema);
  }

  const schema = loadSchema(config, config.schema, "schema", findings, verifiedRefs);
  if (!schema) return null;

  try {
    return ajv.compile(schema as AnySchema);
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
  config: H04RecordGeneratorConfig,
  descriptor: H04RecordGeneratorSchemaDescriptor,
  source: "schema" | "schema_ref",
  findings: H04RecordGeneratorFinding[],
  verifiedRefs: H04RecordGeneratorVerifiedRef[]
): unknown | null {
  const hashFinding = validateSha256(descriptor.sha256, `${source}_hash_invalid`);
  if (hashFinding) {
    findings.push({ ...hashFinding, ref: descriptor.ref });
    return null;
  }

  const schemaPath = resolveLogicalRef(descriptor.ref, config.logicalRoots, findings);
  if (!schemaPath) return null;
  if (!existsSync(schemaPath)) {
    findings.push({ kind: `${source}_missing`, ref: descriptor.ref, path: schemaPath });
    return null;
  }

  const schemaText = readFileSync(schemaPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(schemaText)) {
    findings.push({ kind: "private_path_in_schema", ref: descriptor.ref, path: schemaPath });
    return null;
  }

  const actualHash = sha256Text(schemaText);
  const expectedHash = normalizeSha256(descriptor.sha256);
  if (actualHash !== expectedHash) {
    findings.push({
      kind: `${source}_hash_mismatch`,
      ref: descriptor.ref,
      path: schemaPath,
      expected: expectedHash,
      actual: actualHash
    });
    return null;
  }

  verifiedRefs.push({
    ref: descriptor.ref,
    path: schemaPath,
    sha256: actualHash,
    source
  });

  return parseJson(schemaText, descriptor.ref, findings);
}

function verifyRequestExpectation(
  config: H04RecordGeneratorConfig,
  expectation: H04RecordGeneratorExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H04RecordGeneratorFinding[],
  classifiedMismatches: H04RecordGeneratorFinding[],
  verifiedRefs: H04RecordGeneratorVerifiedRef[]
): { result: H04RecordGeneratorValidationResult; generatedRecord: H04GeneratedRecord | null } {
  const requestFindings: H04RecordGeneratorFinding[] = [];
  const requestPath = resolveLogicalRef(expectation.ref, config.logicalRoots, requestFindings);
  if (!requestPath || !existsSync(requestPath)) {
    const finding: H04RecordGeneratorFinding = {
      kind: "request_missing",
      requestId: expectation.requestId,
      ref: expectation.ref
    };
    requestFindings.push(requestPath ? { ...finding, path: requestPath } : finding);
    return {
      result: finishRequestResult(
        expectation,
        "unknown",
        [],
        requestFindings,
        findings,
        classifiedMismatches
      ),
      generatedRecord: null
    };
  }

  const requestText = readFileSync(requestPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(requestText)) {
    requestFindings.push({
      kind: "private_path_in_request",
      requestId: expectation.requestId,
      ref: expectation.ref,
      path: requestPath
    });
  }

  verifiedRefs.push({
    ref: expectation.ref,
    path: requestPath,
    sha256: sha256Text(requestText),
    source: "request"
  });

  const parsed = parseJson(requestText, expectation.ref, requestFindings);
  const request = parseRequest(expectation, parsed, requestFindings);
  if (!request) {
    return {
      result: finishRequestResult(
        expectation,
        "unknown",
        [],
        requestFindings,
        findings,
        classifiedMismatches
      ),
      generatedRecord: null
    };
  }
  if (hasPrivatePath(request)) {
    requestFindings.push({
      kind: "private_path_in_request",
      requestId: expectation.requestId,
      ref: expectation.ref,
      path: requestPath
    });
  }

  verifyDurableReference(config, expectation, request, "template", requestFindings, verifiedRefs);
  verifyDurableReference(config, expectation, request, "output", requestFindings, verifiedRefs);
  const generatedRecord = generateH04RecordFromRequest(request);

  validateGeneratedRecord(expectation, generatedRecord, schemaValidator, requestFindings);
  validateGeneratedSemantics(config, expectation, request, generatedRecord, requestFindings);

  return {
    result: finishRequestResult(
      expectation,
      generatedRecord.claim_eligibility,
      generatedRecord.missing_fields,
      requestFindings,
      findings,
      classifiedMismatches
    ),
    generatedRecord
  };
}

function parseRequest(
  expectation: H04RecordGeneratorExpectation,
  parsed: unknown,
  findings: H04RecordGeneratorFinding[]
): H04RecordGeneratorRequest | null {
  if (!isRecord(parsed)) {
    findings.push({ kind: "request_not_object", requestId: expectation.requestId, ref: expectation.ref });
    return null;
  }
  if (parsed.request_id !== expectation.requestId) {
    findings.push({
      kind: "request_id_mismatch",
      requestId: expectation.requestId,
      ref: expectation.ref,
      expected: expectation.requestId,
      actual: typeof parsed.request_id === "string" ? parsed.request_id : "missing_or_invalid"
    });
  }
  return parsed as unknown as H04RecordGeneratorRequest;
}

function verifyDurableReference(
  config: H04RecordGeneratorConfig,
  expectation: H04RecordGeneratorExpectation,
  request: H04RecordGeneratorRequest,
  role: "template" | "output",
  findings: H04RecordGeneratorFinding[],
  verifiedRefs: H04RecordGeneratorVerifiedRef[]
): void {
  const ref = role === "template" ? request.template_ref : request.output_ref;
  const hash = role === "template" ? request.template_hash : request.output_hash;
  const hashFinding = validateSha256(hash, `${role}_hash_invalid`);
  if (hashFinding) {
    findings.push({ ...hashFinding, requestId: expectation.requestId, ref });
  }

  if (role === "output" && TRANSIENT_REF_PATTERN.test(ref)) {
    findings.push({ kind: "output_ref_transient_only", requestId: expectation.requestId, ref });
  }

  const path = resolveLogicalRef(ref, config.logicalRoots, findings);
  if (!path) return;
  if (!existsSync(path)) {
    findings.push({ kind: `${role}_missing`, requestId: expectation.requestId, ref, path });
    return;
  }

  const text = readFileSync(path, "utf8");
  if (PRIVATE_PATH_PATTERN.test(text)) {
    findings.push({ kind: `private_path_in_${role}`, requestId: expectation.requestId, ref, path });
  }
  const actualHash = sha256Text(text);
  const expectedHash = normalizeSha256(hash);
  if (SHA256_PATTERN.test(hash) && actualHash !== expectedHash) {
    findings.push({
      kind: `${role}_hash_mismatch`,
      requestId: expectation.requestId,
      ref,
      path,
      expected: expectedHash,
      actual: actualHash
    });
  }
  verifiedRefs.push({
    ref,
    path,
    sha256: actualHash,
    source: role
  });
}

function validateGeneratedRecord(
  expectation: H04RecordGeneratorExpectation,
  generatedRecord: H04GeneratedRecord,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H04RecordGeneratorFinding[]
): void {
  if (!schemaValidator) {
    findings.push({ kind: "schema_validator_unavailable", requestId: expectation.requestId });
    return;
  }
  if (!schemaValidator(generatedRecord)) {
    for (const issue of schemaValidator.errors ?? []) {
      const finding: H04RecordGeneratorFinding = {
        kind: schemaIssueKind(issue),
        requestId: expectation.requestId
      };
      findings.push(issue.message ? { ...finding, detail: issue.message } : finding);
    }
  }
}

function validateGeneratedSemantics(
  config: H04RecordGeneratorConfig,
  expectation: H04RecordGeneratorExpectation,
  request: H04RecordGeneratorRequest,
  generatedRecord: H04GeneratedRecord,
  findings: H04RecordGeneratorFinding[]
): void {
  if (generatedRecord.missing_fields.length > 0) {
    findings.push({
      kind: "required_fields_missing",
      requestId: expectation.requestId,
      expected: generatedRecord.required_fields.join(","),
      actual: generatedRecord.missing_fields.join(",")
    });
  }

  if (generatedRecord.placeholder_scan === "failed") {
    findings.push({ kind: "placeholder_scan_failed", requestId: expectation.requestId });
  }

  const semanticEligibility =
    generatedRecord.missing_fields.length === 0 && generatedRecord.placeholder_scan === "passed"
      ? "eligible"
      : "blocked";
  if (request.claim_eligibility === "eligible" && semanticEligibility !== "eligible") {
    findings.push({
      kind: "claim_eligibility_overclaim",
      requestId: expectation.requestId,
      expected: semanticEligibility,
      actual: request.claim_eligibility
    });
  }

  for (const requiredClaim of config.requiredCannotClaim ?? []) {
    if (!generatedRecord.cannot_claim.includes(requiredClaim)) {
      findings.push({
        kind: "cannot_claim_missing_required",
        requestId: expectation.requestId,
        expected: requiredClaim
      });
    }
  }
}

function finishRequestResult(
  expectation: H04RecordGeneratorExpectation,
  claimEligibility: H04RecordGeneratorClaimEligibility | "unknown",
  missingFields: readonly string[],
  requestFindings: H04RecordGeneratorFinding[],
  findings: H04RecordGeneratorFinding[],
  classifiedMismatches: H04RecordGeneratorFinding[]
): H04RecordGeneratorValidationResult {
  const actualStatus: H04ExpectedRecordGeneratorStatus =
    requestFindings.length === 0 ? "passed" : "failed";
  const findingKinds = requestFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "request_status_mismatch",
      requestId: expectation.requestId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedFinding of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedFinding)) {
      findings.push({
        kind: "expected_finding_missing",
        requestId: expectation.requestId,
        ref: expectation.ref,
        expected: expectedFinding,
        actual: findingKinds.join(",")
      });
    }
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...requestFindings);
  } else {
    findings.push(...requestFindings);
  }

  return {
    requestId: expectation.requestId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    claimEligibility,
    missingFields: [...missingFields],
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
  findings: H04RecordGeneratorFinding[]
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
  findings: H04RecordGeneratorFinding[]
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

function hasPlaceholder(value: unknown): boolean {
  if (typeof value === "string") return PLACEHOLDER_PATTERN.test(value);
  if (Array.isArray(value)) return value.some((item) => hasPlaceholder(item));
  if (isRecord(value)) return Object.values(value).some((item) => hasPlaceholder(item));
  return false;
}

function hasPrivatePath(value: unknown): boolean {
  if (typeof value === "string") return PRIVATE_PATH_PATTERN.test(value);
  if (Array.isArray(value)) return value.some((item) => hasPrivatePath(item));
  if (isRecord(value)) return Object.values(value).some((item) => hasPrivatePath(item));
  return false;
}

function validateSha256(value: string, kind: string): H04RecordGeneratorFinding | null {
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
