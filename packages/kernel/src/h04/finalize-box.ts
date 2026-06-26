import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H04FinalizeBoxStatus = "passed" | "failed";
export type H04ExpectedFinalizeBoxStatus = "passed" | "failed";
export type H04FinalizeGateResult = "GO" | "CONDITIONAL_GO" | "NO_GO" | "BLOCKED" | "UNABLE_TO_VERIFY";
export type H04FinalizeCheckStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "not_applicable_with_reason"
  | "unable_to_verify";

export interface H04FinalizeBoxConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H04FinalizeBoxSchemaDescriptor;
  readonly schemaRefs?: readonly H04FinalizeBoxSchemaDescriptor[];
  readonly boxes: readonly H04FinalizeBoxExpectation[];
  readonly expectedCurrentProductSha?: string;
  readonly expectedCurrentTreeHash?: string;
  readonly requiredFfetIds?: readonly string[];
  readonly allowedGateResults?: readonly H04FinalizeGateResult[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H04FinalizeBoxSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H04FinalizeBoxExpectation {
  readonly boxId: string;
  readonly ref: string;
  readonly expectedStatus: H04ExpectedFinalizeBoxStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H04FinalizeBoxReport {
  readonly status: H04FinalizeBoxStatus;
  readonly findings: readonly H04FinalizeBoxFinding[];
  readonly classified_mismatches: readonly H04FinalizeBoxFinding[];
  readonly verified_refs: readonly H04FinalizeBoxVerifiedRef[];
  readonly hash_failures: readonly H04FinalizeBoxFinding[];
  readonly box_results: readonly H04FinalizeBoxValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H04FinalizeBoxValidationResult {
  readonly boxId: string;
  readonly ref: string;
  readonly status: H04ExpectedFinalizeBoxStatus;
  readonly expectedStatus: H04ExpectedFinalizeBoxStatus;
  readonly gateResult: H04FinalizeGateResult | "unknown";
  readonly findingKinds: readonly string[];
}

export interface H04FinalizeBoxVerifiedRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "schema_ref" | "box";
}

export interface H04FinalizeBoxFinding {
  readonly kind: string;
  readonly boxId?: string;
  readonly checkId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H04BoxFinalizerOutput {
  readonly schema_version: "1.0.0";
  readonly finalizer_id: string;
  readonly box_id: string;
  readonly product_sha: string;
  readonly tree_hash: string;
  readonly checks: readonly string[];
  readonly check_results: readonly H04FinalizerCheckResult[];
  readonly unavailable_checks: readonly H04UnavailableCheck[];
  readonly approved_debt: readonly H04ApprovedDebt[];
  readonly blocking_findings: readonly H04BlockingFinding[];
  readonly gate_result: H04FinalizeGateResult;
  readonly cannot_claim: readonly string[];
}

interface H04FinalizerCheckResult {
  readonly check_id: string;
  readonly status: H04FinalizeCheckStatus;
  readonly detail?: string;
  readonly evidence_ref?: string;
  readonly evidence_sha256?: string;
}

interface H04UnavailableCheck {
  readonly check_id: string;
  readonly reason: string;
  readonly cannot_claim: readonly string[];
}

interface H04ApprovedDebt {
  readonly debt_id: string;
  readonly owner: string;
  readonly reason: string;
  readonly remediation_ref: string;
}

interface H04BlockingFinding {
  readonly finding_id: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly reason: string;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const FAILING_CHECK_STATUSES = new Set<H04FinalizeCheckStatus>([
  "failed",
  "blocked",
  "unable_to_verify"
]);
const SUCCESSOR_GATE_RESULTS = new Set<H04FinalizeGateResult>(["GO", "CONDITIONAL_GO"]);
const REQUIRED_FFET_CHECK_SUFFIXES = ["closeout", "learning", "evidence_manifest"] as const;

export function verifyH04FinalizeBoxConfig(config: H04FinalizeBoxConfig): H04FinalizeBoxReport {
  const findings: H04FinalizeBoxFinding[] = [];
  const classifiedMismatches: H04FinalizeBoxFinding[] = [];
  const verifiedRefs: H04FinalizeBoxVerifiedRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const boxResults: H04FinalizeBoxValidationResult[] = [];

  for (const boxExpectation of config.boxes) {
    boxResults.push(
      verifyBoxExpectation(
        config,
        boxExpectation,
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
    box_results: boxResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H04FinalizeBoxConfig,
  findings: H04FinalizeBoxFinding[],
  verifiedRefs: H04FinalizeBoxVerifiedRef[]
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
  config: H04FinalizeBoxConfig,
  descriptor: H04FinalizeBoxSchemaDescriptor,
  source: "schema" | "schema_ref",
  findings: H04FinalizeBoxFinding[],
  verifiedRefs: H04FinalizeBoxVerifiedRef[]
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

function verifyBoxExpectation(
  config: H04FinalizeBoxConfig,
  expectation: H04FinalizeBoxExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H04FinalizeBoxFinding[],
  classifiedMismatches: H04FinalizeBoxFinding[],
  verifiedRefs: H04FinalizeBoxVerifiedRef[]
): H04FinalizeBoxValidationResult {
  const boxFindings: H04FinalizeBoxFinding[] = [];
  const boxPath = resolveLogicalRef(expectation.ref, config.logicalRoots, boxFindings);
  if (!boxPath || !existsSync(boxPath)) {
    const finding: H04FinalizeBoxFinding = {
      kind: "box_missing",
      boxId: expectation.boxId,
      ref: expectation.ref
    };
    boxFindings.push(boxPath ? { ...finding, path: boxPath } : finding);
    return finishBoxResult(expectation, "unknown", boxFindings, findings, classifiedMismatches);
  }

  const boxText = readFileSync(boxPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(boxText)) {
    boxFindings.push({
      kind: "private_path_in_box",
      boxId: expectation.boxId,
      ref: expectation.ref,
      path: boxPath
    });
  }

  verifiedRefs.push({
    ref: expectation.ref,
    path: boxPath,
    sha256: sha256Text(boxText),
    source: "box"
  });

  const parsed = parseJson(boxText, expectation.ref, boxFindings);
  const record = parseFinalizerOutput(expectation, parsed, boxFindings);
  if (!record) return finishBoxResult(expectation, "unknown", boxFindings, findings, classifiedMismatches);

  validateSchema(expectation, record, schemaValidator, boxFindings);
  validateFinalizerSemantics(config, expectation, record, boxFindings);

  return finishBoxResult(
    expectation,
    record.gate_result ?? "unknown",
    boxFindings,
    findings,
    classifiedMismatches
  );
}

function parseFinalizerOutput(
  expectation: H04FinalizeBoxExpectation,
  parsed: unknown,
  findings: H04FinalizeBoxFinding[]
): H04BoxFinalizerOutput | null {
  if (!isRecord(parsed)) {
    findings.push({ kind: "box_not_object", boxId: expectation.boxId, ref: expectation.ref });
    return null;
  }
  if (parsed.box_id !== expectation.boxId) {
    findings.push({
      kind: "box_id_mismatch",
      boxId: expectation.boxId,
      ref: expectation.ref,
      expected: expectation.boxId,
      actual: typeof parsed.box_id === "string" ? parsed.box_id : "missing_or_invalid"
    });
  }
  return parsed as unknown as H04BoxFinalizerOutput;
}

function validateSchema(
  expectation: H04FinalizeBoxExpectation,
  record: H04BoxFinalizerOutput,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H04FinalizeBoxFinding[]
): void {
  if (!schemaValidator) {
    findings.push({ kind: "schema_validator_unavailable", boxId: expectation.boxId });
    return;
  }
  if (!schemaValidator(record)) {
    for (const issue of schemaValidator.errors ?? []) {
      const finding: H04FinalizeBoxFinding = {
        kind: schemaIssueKind(issue),
        boxId: expectation.boxId
      };
      findings.push(issue.message ? { ...finding, detail: issue.message } : finding);
    }
  }
}

function validateFinalizerSemantics(
  config: H04FinalizeBoxConfig,
  expectation: H04FinalizeBoxExpectation,
  record: H04BoxFinalizerOutput,
  findings: H04FinalizeBoxFinding[]
): void {
  if (config.expectedCurrentProductSha && record.product_sha !== config.expectedCurrentProductSha) {
    findings.push({
      kind: "stale_product_sha",
      boxId: expectation.boxId,
      expected: config.expectedCurrentProductSha,
      actual: record.product_sha
    });
  }
  if (config.expectedCurrentTreeHash && record.tree_hash !== config.expectedCurrentTreeHash) {
    findings.push({
      kind: "stale_tree_hash",
      boxId: expectation.boxId,
      expected: config.expectedCurrentTreeHash,
      actual: record.tree_hash
    });
  }
  if (!GIT_OBJECT_PATTERN.test(record.product_sha)) {
    findings.push({ kind: "product_sha_invalid", boxId: expectation.boxId, actual: record.product_sha });
  }
  if (!GIT_OBJECT_PATTERN.test(record.tree_hash)) {
    findings.push({ kind: "tree_hash_invalid", boxId: expectation.boxId, actual: record.tree_hash });
  }
  if (hasPlaceholder(record)) {
    findings.push({ kind: "placeholder_scan_failed", boxId: expectation.boxId });
  }
  if (hasPrivatePath(record)) {
    findings.push({ kind: "private_path_in_box", boxId: expectation.boxId, ref: expectation.ref });
  }

  const checkIds = new Set(record.checks);
  const resultsById = new Map<string, H04FinalizerCheckResult>();
  for (const result of record.check_results) {
    if (resultsById.has(result.check_id)) {
      findings.push({ kind: "duplicate_check_result", boxId: expectation.boxId, checkId: result.check_id });
    }
    resultsById.set(result.check_id, result);
    if (!checkIds.has(result.check_id)) {
      findings.push({ kind: "check_result_not_declared", boxId: expectation.boxId, checkId: result.check_id });
    }
    if (FAILING_CHECK_STATUSES.has(result.status)) {
      findings.push({
        kind: "required_check_not_passing",
        boxId: expectation.boxId,
        checkId: result.check_id,
        actual: result.status
      });
    }
    if (result.evidence_sha256 && validateSha256(result.evidence_sha256, "evidence_hash_invalid")) {
      findings.push({
        kind: "evidence_hash_invalid",
        boxId: expectation.boxId,
        checkId: result.check_id,
        actual: result.evidence_sha256
      });
    }
  }

  for (const checkId of record.checks) {
    if (!resultsById.has(checkId)) {
      findings.push({ kind: "declared_check_missing_result", boxId: expectation.boxId, checkId });
    }
  }

  for (const ffetId of config.requiredFfetIds ?? []) {
    for (const suffix of REQUIRED_FFET_CHECK_SUFFIXES) {
      const checkId = `ffet:${ffetId}:${suffix}`;
      const result = resultsById.get(checkId);
      if (!result) {
        findings.push({
          kind: "required_ffet_check_missing",
          boxId: expectation.boxId,
          checkId,
          expected: "passed"
        });
      } else if (result.status !== "passed") {
        findings.push({
          kind: "required_ffet_check_not_passing",
          boxId: expectation.boxId,
          checkId,
          expected: "passed",
          actual: result.status
        });
      }
    }
  }

  const allowedGateResults = new Set(config.allowedGateResults ?? ["GO", "CONDITIONAL_GO"]);
  if (!allowedGateResults.has(record.gate_result)) {
    findings.push({
      kind: "gate_result_not_allowed",
      boxId: expectation.boxId,
      expected: [...allowedGateResults].join(","),
      actual: record.gate_result
    });
  }
  if (SUCCESSOR_GATE_RESULTS.has(record.gate_result) && record.blocking_findings.length > 0) {
    findings.push({
      kind: "successor_blocking_debt",
      boxId: expectation.boxId,
      actual: String(record.blocking_findings.length)
    });
  }
  if (record.gate_result === "GO" && record.approved_debt.length > 0) {
    findings.push({
      kind: "go_with_approved_debt",
      boxId: expectation.boxId,
      actual: String(record.approved_debt.length)
    });
  }

  for (const unavailable of record.unavailable_checks) {
    if (unavailable.cannot_claim.length === 0) {
      findings.push({
        kind: "unavailable_check_missing_cannot_claim",
        boxId: expectation.boxId,
        checkId: unavailable.check_id
      });
    }
  }
  for (const requiredClaim of config.requiredCannotClaim ?? []) {
    if (!record.cannot_claim.includes(requiredClaim)) {
      findings.push({
        kind: "cannot_claim_missing_required",
        boxId: expectation.boxId,
        expected: requiredClaim
      });
    }
  }
}

function finishBoxResult(
  expectation: H04FinalizeBoxExpectation,
  gateResult: H04FinalizeGateResult | "unknown",
  boxFindings: H04FinalizeBoxFinding[],
  findings: H04FinalizeBoxFinding[],
  classifiedMismatches: H04FinalizeBoxFinding[]
): H04FinalizeBoxValidationResult {
  const actualStatus: H04ExpectedFinalizeBoxStatus = boxFindings.length === 0 ? "passed" : "failed";
  const findingKinds = boxFindings.map((finding) => finding.kind);

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "box_status_mismatch",
      boxId: expectation.boxId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedFinding of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedFinding)) {
      findings.push({
        kind: "expected_finding_missing",
        boxId: expectation.boxId,
        ref: expectation.ref,
        expected: expectedFinding,
        actual: findingKinds.join(",")
      });
    }
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...boxFindings);
  } else {
    findings.push(...boxFindings);
  }

  return {
    boxId: expectation.boxId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    gateResult,
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
  findings: H04FinalizeBoxFinding[]
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

function parseJson(text: string, ref: string, findings: H04FinalizeBoxFinding[]): unknown | null {
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

function validateSha256(value: string, kind: string): H04FinalizeBoxFinding | null {
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
