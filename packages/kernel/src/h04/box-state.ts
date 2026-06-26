import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H04BoxStateStatus = "passed" | "failed";
export type H04ExpectedBoxStatus = "passed" | "failed";

export interface H04BoxStateConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H04BoxStateSchemaDescriptor;
  readonly boxes: readonly H04BoxExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H04BoxStateSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H04BoxExpectation {
  readonly boxId: string;
  readonly ref: string;
  readonly expectedStatus: H04ExpectedBoxStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H04BoxStateReport {
  readonly status: H04BoxStateStatus;
  readonly findings: readonly H04BoxStateFinding[];
  readonly classified_mismatches: readonly H04BoxStateFinding[];
  readonly verified_refs: readonly H04VerifiedBoxStateRef[];
  readonly hash_failures: readonly H04BoxStateFinding[];
  readonly box_results: readonly H04BoxValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H04BoxValidationResult {
  readonly boxId: string;
  readonly ref: string;
  readonly status: H04ExpectedBoxStatus;
  readonly expectedStatus: H04ExpectedBoxStatus;
  readonly state: H04BoxLifecycleState | "unknown";
  readonly findingKinds: readonly string[];
}

export interface H04VerifiedBoxStateRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "box";
}

export interface H04BoxStateFinding {
  readonly kind: string;
  readonly boxId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H04BoxLifecycleRecord {
  readonly schema_version: string;
  readonly box_id: string;
  readonly state: H04BoxLifecycleState;
  readonly allowed_transitions: readonly H04BoxLifecycleState[];
  readonly dependencies: readonly H04RefHash[];
  readonly accepted_debt: readonly H04AcceptedDebt[];
  readonly blocking_debt: readonly H04BlockingDebt[];
  readonly gate_result: H04GateResult;
  readonly gate_conditions?: readonly string[];
  readonly closeout_ref: string;
  readonly learning_ref: string;
  readonly truth_ledger_refs: readonly H04RefHash[];
  readonly cannot_claim: readonly string[];
}

interface H04RefHash {
  readonly ref: string;
  readonly sha256: string;
}

interface H04AcceptedDebt {
  readonly debt_id: string;
  readonly owner: string;
  readonly remediation_ref: string;
  readonly cannot_claim: readonly string[];
}

interface H04BlockingDebt {
  readonly debt_id: string;
  readonly reason: string;
}

type H04BoxLifecycleState =
  | "planned"
  | "active"
  | "blocked"
  | "implemented"
  | "assured"
  | "closed"
  | "superseded";

type H04GateResult =
  | "GO"
  | "CONDITIONAL_GO"
  | "NO_GO"
  | "BLOCKED"
  | "UNABLE_TO_VERIFY"
  | "NOT_EVALUATED";

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const MERGED_FFET_READINESS_PATTERN = /(?:all\s+ffets\s+merged|merged\s+ffets|prs?\s+merged|merge\s+implies\s+readiness)/iu;

const ALLOWED_TRANSITIONS: Record<H04BoxLifecycleState, readonly H04BoxLifecycleState[]> = {
  planned: ["active", "blocked", "superseded"],
  active: ["blocked", "implemented", "superseded"],
  blocked: ["active", "superseded"],
  implemented: ["assured", "blocked", "superseded"],
  assured: ["closed", "blocked", "superseded"],
  closed: ["superseded"],
  superseded: []
};

const TERMINAL_OR_ASSURANCE_STATES = new Set<H04BoxLifecycleState>(["assured", "closed"]);
const SUCCESS_GATE_RESULTS = new Set<H04GateResult>(["GO", "CONDITIONAL_GO"]);
const NON_SUCCESS_GATE_STATES = new Set<H04BoxLifecycleState>([
  "planned",
  "active",
  "blocked",
  "superseded"
]);

export function verifyH04BoxStateConfig(config: H04BoxStateConfig): H04BoxStateReport {
  const findings: H04BoxStateFinding[] = [];
  const classifiedMismatches: H04BoxStateFinding[] = [];
  const verifiedRefs: H04VerifiedBoxStateRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const boxResults: H04BoxValidationResult[] = [];

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
      finding.kind.includes("placeholder")
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
  config: H04BoxStateConfig,
  findings: H04BoxStateFinding[],
  verifiedRefs: H04VerifiedBoxStateRef[]
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

function verifyBoxExpectation(
  config: H04BoxStateConfig,
  expectation: H04BoxExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H04BoxStateFinding[],
  classifiedMismatches: H04BoxStateFinding[],
  verifiedRefs: H04VerifiedBoxStateRef[]
): H04BoxValidationResult {
  const boxFindings: H04BoxStateFinding[] = [];
  const boxPath = resolveLogicalRef(expectation.ref, config.logicalRoots, boxFindings);
  if (!boxPath || !existsSync(boxPath)) {
    const finding: H04BoxStateFinding = {
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
  const record = parseBoxRecord(expectation, parsed, boxFindings);
  if (!record) {
    return finishBoxResult(expectation, "unknown", boxFindings, findings, classifiedMismatches);
  }

  validateBoxWithSchema(expectation, record, schemaValidator, boxFindings);
  verifyBoxSemantics(expectation, record, boxFindings);

  return finishBoxResult(expectation, record.state, boxFindings, findings, classifiedMismatches);
}

function parseBoxRecord(
  expectation: H04BoxExpectation,
  parsed: unknown,
  boxFindings: H04BoxStateFinding[]
): H04BoxLifecycleRecord | null {
  if (!isRecord(parsed)) {
    boxFindings.push({ kind: "box_not_object", boxId: expectation.boxId, ref: expectation.ref });
    return null;
  }

  const boxId = parsed.box_id;
  if (boxId !== expectation.boxId) {
    boxFindings.push({
      kind: "box_id_mismatch",
      boxId: expectation.boxId,
      ref: expectation.ref,
      expected: expectation.boxId,
      actual: typeof boxId === "string" ? boxId : "missing_or_invalid"
    });
  }

  return parsed as unknown as H04BoxLifecycleRecord;
}

function validateBoxWithSchema(
  expectation: H04BoxExpectation,
  record: H04BoxLifecycleRecord,
  schemaValidator: ValidateFunction<unknown> | null,
  boxFindings: H04BoxStateFinding[]
): void {
  if (!schemaValidator) {
    boxFindings.push({ kind: "schema_validator_unavailable", boxId: expectation.boxId });
    return;
  }

  if (!schemaValidator(record)) {
    for (const issue of schemaValidator.errors ?? []) {
      const finding: H04BoxStateFinding = {
        kind: schemaIssueKind(issue),
        boxId: expectation.boxId
      };
      boxFindings.push(issue.message ? { ...finding, detail: issue.message } : finding);
    }
  }
}

function verifyBoxSemantics(
  expectation: H04BoxExpectation,
  record: H04BoxLifecycleRecord,
  boxFindings: H04BoxStateFinding[]
): void {
  validateTransitions(expectation, record, boxFindings);
  validateRefHashes(expectation, record, boxFindings);
  validateDebt(expectation, record, boxFindings);
  validateReadinessGates(expectation, record, boxFindings);
  validateCannotClaim(expectation, record, boxFindings);
}

function validateTransitions(
  expectation: H04BoxExpectation,
  record: H04BoxLifecycleRecord,
  boxFindings: H04BoxStateFinding[]
): void {
  const allowedForState = new Set(ALLOWED_TRANSITIONS[record.state] ?? []);
  for (const transition of record.allowed_transitions ?? []) {
    if (!allowedForState.has(transition)) {
      boxFindings.push({
        kind: "invalid_state_transition",
        boxId: expectation.boxId,
        expected: [...allowedForState].join(","),
        actual: `${record.state}->${transition}`
      });
    }
  }
}

function validateRefHashes(
  expectation: H04BoxExpectation,
  record: H04BoxLifecycleRecord,
  boxFindings: H04BoxStateFinding[]
): void {
  validateRefHashCollection("dependency", expectation, record.dependencies ?? [], boxFindings);
  validateRefHashCollection("truth_ledger_ref", expectation, record.truth_ledger_refs ?? [], boxFindings);
}

function validateRefHashCollection(
  collectionKind: string,
  expectation: H04BoxExpectation,
  refs: readonly H04RefHash[],
  boxFindings: H04BoxStateFinding[]
): void {
  const hashesByRef = new Map<string, string>();
  for (const refHash of refs) {
    const hashFinding = validateSha256(refHash.sha256, `${collectionKind}_sha256_invalid`);
    if (hashFinding) {
      boxFindings.push({
        ...hashFinding,
        boxId: expectation.boxId,
        ref: refHash.ref
      });
      continue;
    }

    const normalizedHash = normalizeSha256(refHash.sha256);
    const priorHash = hashesByRef.get(refHash.ref);
    if (priorHash && priorHash !== normalizedHash) {
      boxFindings.push({
        kind: `${collectionKind}_duplicate_ref_conflicting_hash`,
        boxId: expectation.boxId,
        ref: refHash.ref,
        expected: priorHash,
        actual: normalizedHash
      });
    }
    hashesByRef.set(refHash.ref, normalizedHash);
  }
}

function validateDebt(
  expectation: H04BoxExpectation,
  record: H04BoxLifecycleRecord,
  boxFindings: H04BoxStateFinding[]
): void {
  const acceptedDebtIds = new Set<string>();
  for (const debt of record.accepted_debt ?? []) {
    acceptedDebtIds.add(debt.debt_id);
    if ((debt.cannot_claim ?? []).length === 0) {
      boxFindings.push({
        kind: "accepted_debt_missing_cannot_claim",
        boxId: expectation.boxId,
        detail: debt.debt_id
      });
    }
  }

  for (const debt of record.blocking_debt ?? []) {
    if (acceptedDebtIds.has(debt.debt_id)) {
      boxFindings.push({
        kind: "debt_both_accepted_and_blocking",
        boxId: expectation.boxId,
        detail: debt.debt_id
      });
    }
  }

  if (TERMINAL_OR_ASSURANCE_STATES.has(record.state) && (record.blocking_debt ?? []).length > 0) {
    boxFindings.push({
      kind: "assurance_or_closed_state_has_blocking_debt",
      boxId: expectation.boxId,
      detail: record.state
    });
  }
}

function validateReadinessGates(
  expectation: H04BoxExpectation,
  record: H04BoxLifecycleRecord,
  boxFindings: H04BoxStateFinding[]
): void {
  if (record.state === "closed" && !SUCCESS_GATE_RESULTS.has(record.gate_result)) {
    boxFindings.push({
      kind: "closed_state_without_success_gate",
      boxId: expectation.boxId,
      expected: "GO,CONDITIONAL_GO",
      actual: record.gate_result
    });
  }

  if (NON_SUCCESS_GATE_STATES.has(record.state) && SUCCESS_GATE_RESULTS.has(record.gate_result)) {
    boxFindings.push({
      kind: "premature_success_gate_for_state",
      boxId: expectation.boxId,
      expected: [...NON_SUCCESS_GATE_STATES].join(","),
      actual: `${record.state}:${record.gate_result}`
    });
  }

  if (TERMINAL_OR_ASSURANCE_STATES.has(record.state) && (record.truth_ledger_refs ?? []).length === 0) {
    boxFindings.push({
      kind: "readiness_without_assurance_or_truth_ledger",
      boxId: expectation.boxId,
      detail: record.state
    });
  }

  for (const condition of record.gate_conditions ?? []) {
    if (MERGED_FFET_READINESS_PATTERN.test(condition)) {
      boxFindings.push({
        kind: "readiness_inferred_from_merged_ffets",
        boxId: expectation.boxId,
        detail: condition
      });
    }
  }
}

function validateCannotClaim(
  expectation: H04BoxExpectation,
  record: H04BoxLifecycleRecord,
  boxFindings: H04BoxStateFinding[]
): void {
  if ((record.cannot_claim ?? []).some((claim) => PLACEHOLDER_PATTERN.test(claim))) {
    boxFindings.push({
      kind: "cannot_claim_placeholder",
      boxId: expectation.boxId
    });
  }

  if (
    record.state !== "closed" &&
    !record.cannot_claim.includes("h04_box_not_closed")
  ) {
    boxFindings.push({
      kind: "non_closed_box_missing_cannot_claim",
      boxId: expectation.boxId,
      expected: "h04_box_not_closed"
    });
  }
}

function finishBoxResult(
  expectation: H04BoxExpectation,
  state: H04BoxLifecycleState | "unknown",
  boxFindings: H04BoxStateFinding[],
  findings: H04BoxStateFinding[],
  classifiedMismatches: H04BoxStateFinding[]
): H04BoxValidationResult {
  const actualStatus: H04ExpectedBoxStatus = boxFindings.length === 0 ? "passed" : "failed";
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
  findings: H04BoxStateFinding[]
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
  findings: H04BoxStateFinding[]
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

function validateSha256(hash: string, kind: string): H04BoxStateFinding | null {
  if (PLACEHOLDER_PATTERN.test(hash) || !SHA256_PATTERN.test(hash)) {
    return { kind, actual: hash };
  }
  return null;
}

function normalizeSha256(hash: string): string {
  return hash.replace(/^sha256:/u, "");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
