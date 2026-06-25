import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";

export type H03SchemaRegistryStatus = "passed" | "failed";
export type H03SchemaRole = "historical" | "active" | "companion" | "fixture";
export type H03ExpectedValidationStatus = "passed" | "failed";
export type H03SemanticCheckKind =
  | "question_register_hash_matches_structured_ref"
  | "approval_for_review_is_unapproved"
  | "execution_authorization_absent"
  | "structured_contract_refs_present";

export interface H03SchemaRegistryConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schemas: readonly H03SchemaDescriptor[];
  readonly requiredSchemas?: readonly H03SchemaVersionRef[];
  readonly instanceValidations?: readonly H03InstanceValidation[];
  readonly semanticValidations?: readonly H03SemanticValidation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H03SchemaVersionRef {
  readonly schemaId: string;
  readonly schemaVersion: string;
}

export interface H03SchemaDescriptor extends H03SchemaVersionRef {
  readonly ref: string;
  readonly sha256: string;
  readonly role: H03SchemaRole;
}

export interface H03InstanceValidation extends H03SchemaVersionRef {
  readonly validationId: string;
  readonly instanceRef: string;
  readonly expectedStatus: H03ExpectedValidationStatus;
}

export interface H03SemanticValidation {
  readonly validationId: string;
  readonly kind: H03SemanticCheckKind;
  readonly instanceRef: string;
  readonly expectedStatus: H03ExpectedValidationStatus;
}

export interface H03SchemaRegistryReport {
  readonly status: H03SchemaRegistryStatus;
  readonly findings: readonly H03SchemaRegistryFinding[];
  readonly verifiedSchemas: readonly H03VerifiedSchema[];
  readonly instanceResults: readonly H03ValidationResult[];
  readonly semanticResults: readonly H03ValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H03VerifiedSchema extends H03SchemaVersionRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly role: H03SchemaRole;
  readonly jsonSchemaId: string | null;
}

export interface H03ValidationResult {
  readonly validationId: string;
  readonly status: H03ExpectedValidationStatus;
  readonly expectedStatus: H03ExpectedValidationStatus;
  readonly findingKinds: readonly string[];
}

export interface H03SchemaRegistryFinding {
  readonly kind: string;
  readonly schemaId?: string;
  readonly schemaVersion?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly validationId?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface LoadedSchema extends H03SchemaDescriptor {
  readonly path: string;
  readonly jsonSchemaId: string | null;
  readonly document: AnySchema;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
type AddFormats = (ajv: Ajv2020) => void;
const addFormats = ((addFormatsModule as unknown as { readonly default?: AddFormats }).default ??
  (addFormatsModule as unknown as AddFormats));

export function verifyH03SchemaRegistryConfig(
  config: H03SchemaRegistryConfig
): H03SchemaRegistryReport {
  const findings: H03SchemaRegistryFinding[] = [];
  const verifiedSchemas: H03VerifiedSchema[] = [];
  const instanceResults: H03ValidationResult[] = [];
  const semanticResults: H03ValidationResult[] = [];

  validateRequiredSchemaSelection(config, findings);
  const loadedSchemas = loadSchemas(config, findings, verifiedSchemas);
  const validators = compileSchemas(loadedSchemas, findings);

  for (const validation of config.instanceValidations ?? []) {
    instanceResults.push(runInstanceValidation(config, validation, validators, findings));
  }

  for (const validation of config.semanticValidations ?? []) {
    semanticResults.push(runSemanticValidation(config, validation, findings));
  }

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    verifiedSchemas,
    instanceResults,
    semanticResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function validateRequiredSchemaSelection(
  config: H03SchemaRegistryConfig,
  findings: H03SchemaRegistryFinding[]
): void {
  const keys = new Set(config.schemas.map((schema) => schemaKey(schema)));
  for (const requiredSchema of config.requiredSchemas ?? []) {
    if (!keys.has(schemaKey(requiredSchema))) {
      findings.push({
        kind: "required_schema_version_missing",
        schemaId: requiredSchema.schemaId,
        schemaVersion: requiredSchema.schemaVersion
      });
    }
  }

  const seenRefs = new Set<string>();
  for (const schema of config.schemas) {
    const key = schemaKey(schema);
    if (seenRefs.has(key)) {
      findings.push({
        kind: "duplicate_schema_version",
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion
      });
    }
    seenRefs.add(key);
  }
}

function loadSchemas(
  config: H03SchemaRegistryConfig,
  findings: H03SchemaRegistryFinding[],
  verifiedSchemas: H03VerifiedSchema[]
): LoadedSchema[] {
  const loadedSchemas: LoadedSchema[] = [];
  for (const schema of config.schemas) {
    const hashFinding = validateExpectedHash(schema.ref, schema.sha256);
    if (hashFinding) {
      findings.push({
        ...hashFinding,
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion
      });
      continue;
    }

    const schemaPath = resolveLogicalRef(schema.ref, config.logicalRoots, findings);
    if (!schemaPath) {
      findings.push({
        kind: "unresolved_schema_ref",
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion,
        ref: schema.ref
      });
      continue;
    }
    if (!existsSync(schemaPath)) {
      findings.push({
        kind: "missing_schema_ref",
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion,
        ref: schema.ref,
        path: schemaPath
      });
      continue;
    }

    const schemaText = readFileSync(schemaPath, "utf8");
    if (PRIVATE_PATH_PATTERN.test(schemaText)) {
      findings.push({
        kind: "private_path_in_schema_document",
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion,
        ref: schema.ref,
        path: schemaPath
      });
      continue;
    }

    const actualHash = sha256Text(schemaText);
    const expectedHash = normalizeSha256(schema.sha256);
    if (actualHash !== expectedHash) {
      findings.push({
        kind: "schema_hash_mismatch",
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion,
        ref: schema.ref,
        path: schemaPath,
        expected: expectedHash,
        actual: actualHash
      });
      continue;
    }

    let document: AnySchema;
    try {
      document = JSON.parse(schemaText) as AnySchema;
    } catch (error) {
      findings.push({
        kind: "schema_json_parse_failed",
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion,
        ref: schema.ref,
        path: schemaPath,
        detail: error instanceof Error ? error.message : "unknown parse error"
      });
      continue;
    }

    const jsonSchemaId = getJsonSchemaId(document);
    loadedSchemas.push({
      ...schema,
      path: schemaPath,
      jsonSchemaId,
      document
    });
    verifiedSchemas.push({
      schemaId: schema.schemaId,
      schemaVersion: schema.schemaVersion,
      ref: schema.ref,
      path: schemaPath,
      sha256: actualHash,
      role: schema.role,
      jsonSchemaId
    });
  }
  return loadedSchemas;
}

function compileSchemas(
  loadedSchemas: readonly LoadedSchema[],
  findings: H03SchemaRegistryFinding[]
): Map<string, ValidateFunction> {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateSchema: true
  });
  addFormats(ajv);

  for (const schema of loadedSchemas) {
    try {
      ajv.addSchema(schema.document, schemaKey(schema));
    } catch (error) {
      findings.push({
        kind: "schema_compile_failed",
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion,
        ref: schema.ref,
        path: schema.path,
        detail: error instanceof Error ? error.message : "unknown compile error"
      });
    }
  }

  const validators = new Map<string, ValidateFunction>();
  for (const schema of loadedSchemas) {
    try {
      const validateByKey = ajv.getSchema(schemaKey(schema));
      const validateById = schema.jsonSchemaId ? ajv.getSchema(schema.jsonSchemaId) : undefined;
      const validate = validateByKey ?? validateById;
      if (!validate) {
        findings.push({
          kind: "compiled_schema_unavailable",
          schemaId: schema.schemaId,
          schemaVersion: schema.schemaVersion,
          ref: schema.ref
        });
        continue;
      }
      validators.set(schemaKey(schema), validate);
    } catch (error) {
      findings.push({
        kind: "schema_lookup_failed",
        schemaId: schema.schemaId,
        schemaVersion: schema.schemaVersion,
        ref: schema.ref,
        detail: error instanceof Error ? error.message : "unknown lookup error"
      });
    }
  }
  return validators;
}

function runInstanceValidation(
  config: H03SchemaRegistryConfig,
  validation: H03InstanceValidation,
  validators: ReadonlyMap<string, ValidateFunction>,
  findings: H03SchemaRegistryFinding[]
): H03ValidationResult {
  const findingKinds: string[] = [];
  const validate = validators.get(schemaKey(validation));
  if (!validate) {
    const kind = "validation_schema_version_unavailable";
    findingKinds.push(kind);
    findings.push({
      kind,
      schemaId: validation.schemaId,
      schemaVersion: validation.schemaVersion,
      validationId: validation.validationId
    });
    return resultFor(validation.validationId, "failed", validation.expectedStatus, findingKinds);
  }

  const instance = loadInstance(config, validation.instanceRef, validation.validationId, findings);
  if (!instance.loaded) {
    findingKinds.push("instance_load_failed");
    return resultFor(validation.validationId, "failed", validation.expectedStatus, findingKinds);
  }

  const passed = validate(instance.value);
  if (!passed) {
    findingKinds.push(...ajvErrorKinds(validate.errors));
  }
  const actualStatus: H03ExpectedValidationStatus = passed ? "passed" : "failed";
  if (actualStatus !== validation.expectedStatus) {
    findings.push({
      kind: "instance_validation_unexpected_status",
      schemaId: validation.schemaId,
      schemaVersion: validation.schemaVersion,
      validationId: validation.validationId,
      ref: validation.instanceRef,
      expected: validation.expectedStatus,
      actual: actualStatus,
      detail: findingKinds.join(", ")
    });
  }

  return resultFor(validation.validationId, actualStatus, validation.expectedStatus, findingKinds);
}

function runSemanticValidation(
  config: H03SchemaRegistryConfig,
  validation: H03SemanticValidation,
  findings: H03SchemaRegistryFinding[]
): H03ValidationResult {
  const instance = loadInstance(config, validation.instanceRef, validation.validationId, findings);
  if (!instance.loaded) {
    return resultFor(validation.validationId, "failed", validation.expectedStatus, ["instance_load_failed"]);
  }

  const findingKinds = semanticFindingKinds(validation.kind, instance.value);
  const actualStatus: H03ExpectedValidationStatus = findingKinds.length === 0 ? "passed" : "failed";
  if (actualStatus !== validation.expectedStatus) {
    findings.push({
      kind: "semantic_validation_unexpected_status",
      validationId: validation.validationId,
      ref: validation.instanceRef,
      expected: validation.expectedStatus,
      actual: actualStatus,
      detail: findingKinds.join(", ")
    });
  }
  return resultFor(validation.validationId, actualStatus, validation.expectedStatus, findingKinds);
}

function loadInstance(
  config: H03SchemaRegistryConfig,
  ref: string,
  validationId: string,
  findings: H03SchemaRegistryFinding[]
): { readonly loaded: true; readonly value: unknown } | { readonly loaded: false } {
  const instancePath = resolveLogicalRef(ref, config.logicalRoots, findings);
  if (!instancePath || !existsSync(instancePath)) {
    const finding: H03SchemaRegistryFinding = {
      kind: "missing_instance_ref",
      validationId,
      ref
    };
    if (instancePath) {
      findings.push({
        ...finding,
        path: instancePath
      });
    } else {
      findings.push(finding);
    }
    return { loaded: false };
  }

  const instanceText = readFileSync(instancePath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(instanceText)) {
    findings.push({
      kind: "private_path_in_instance",
      validationId,
      ref,
      path: instancePath
    });
    return { loaded: false };
  }
  try {
    return {
      loaded: true,
      value: JSON.parse(instanceText)
    };
  } catch (error) {
    findings.push({
      kind: "instance_json_parse_failed",
      validationId,
      ref,
      path: instancePath,
      detail: error instanceof Error ? error.message : "unknown parse error"
    });
    return { loaded: false };
  }
}

function semanticFindingKinds(kind: H03SemanticCheckKind, value: unknown): string[] {
  if (!isRecord(value)) return ["semantic_instance_not_object"];
  switch (kind) {
    case "question_register_hash_matches_structured_ref":
      return value.question_register_hash ===
        getNestedString(value, ["question_resolution", "question_register", "sha256"])
        ? []
        : ["question_register_hash_mismatch"];
    case "approval_for_review_is_unapproved":
      return isForReviewApprovalUnapproved(value) ? [] : ["for_review_approval_overclaim"];
    case "execution_authorization_absent":
      return Object.hasOwn(value, "execution_authorized") ? ["execution_authorization_inside_constitution"] : [];
    case "structured_contract_refs_present":
      return hasAllStructuredContractRefs(value) ? [] : ["structured_contract_ref_missing"];
  }
}

function hasAllStructuredContractRefs(value: Record<string, unknown>): boolean {
  const contracts = value.structured_contracts;
  if (!isRecord(contracts)) return false;
  return [
    "box_dependency_graph",
    "agent_topology",
    "proof_matrix",
    "assurance_matrix",
    "resource_limits",
    "performance_environment_contract",
    "independent_review_policy"
  ].every((key) => isRecord(contracts[key]) && typeof contracts[key].sha256 === "string");
}

function isForReviewApprovalUnapproved(value: Record<string, unknown>): boolean {
  const approval = value.approval;
  if (!isRecord(approval)) return false;
  if (approval.status !== "draft" && approval.status !== "for_human_review") return false;
  return approval.approved_by === null &&
    approval.approved_at === null &&
    approval.approval_record_ref === null &&
    approval.approval_record_hash === null;
}

function resultFor(
  validationId: string,
  status: H03ExpectedValidationStatus,
  expectedStatus: H03ExpectedValidationStatus,
  findingKinds: readonly string[]
): H03ValidationResult {
  return {
    validationId,
    status,
    expectedStatus,
    findingKinds
  };
}

function ajvErrorKinds(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `json_schema_${error.keyword}`);
}

function validateExpectedHash(ref: string, expectedSha256: string): H03SchemaRegistryFinding | null {
  if (PLACEHOLDER_PATTERN.test(expectedSha256)) {
    return {
      kind: "placeholder_hash",
      ref,
      expected: expectedSha256
    };
  }
  if (!SHA256_PATTERN.test(expectedSha256)) {
    return {
      kind: "invalid_sha256",
      ref,
      expected: expectedSha256
    };
  }
  return null;
}

function resolveLogicalRef(
  ref: string,
  roots: Record<string, string>,
  findings: H03SchemaRegistryFinding[]
): string | null {
  const match = /^([a-z][a-z0-9_-]*):\/\/(.+)$/u.exec(ref);
  if (!match) return null;
  const scheme = match[1];
  const body = match[2];
  if (!scheme || !body) return null;
  const root = roots[scheme];
  if (!root) return null;
  const resolved = resolveInsideRoot(root, body);
  if (!resolved) {
    findings.push({
      kind: "logical_ref_escapes_root",
      ref
    });
  }
  return resolved;
}

function resolveInsideRoot(root: string, body: string): string | null {
  if (!isRelativePublicPath(body)) return null;
  const resolved = normalize(join(root, body));
  const rootRelative = relative(root, resolved);
  if (rootRelative.startsWith("..")) return null;
  return resolved;
}

function isRelativePublicPath(path: string): boolean {
  return path.length > 0 &&
    !isAbsolute(path) &&
    !path.split(/[\\/]+/u).includes("..") &&
    !PRIVATE_PATH_PATTERN.test(path);
}

function getJsonSchemaId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.$id === "string" ? value.$id : null;
}

function getNestedString(value: Record<string, unknown>, path: readonly string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return typeof current === "string" ? current : null;
}

function schemaKey(schema: H03SchemaVersionRef): string {
  return `${schema.schemaId}@${schema.schemaVersion}`;
}

function normalizeSha256(hash: string): string {
  return hash.startsWith("sha256:") ? hash.slice("sha256:".length) : hash;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
