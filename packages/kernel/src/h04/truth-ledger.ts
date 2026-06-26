import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H04TruthLedgerStatus = "passed" | "failed";
export type H04ExpectedLedgerStatus = "passed" | "failed";

export interface H04TruthLedgerConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schema: H04TruthLedgerSchemaDescriptor;
  readonly ledgers: readonly H04LedgerExpectation[];
  readonly expectedCurrentProductSha?: string;
  readonly expectedCurrentTreeHash?: string;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H04TruthLedgerSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H04LedgerExpectation {
  readonly ledgerId: string;
  readonly ref: string;
  readonly expectedStatus: H04ExpectedLedgerStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H04TruthLedgerReport {
  readonly status: H04TruthLedgerStatus;
  readonly findings: readonly H04TruthLedgerFinding[];
  readonly classified_mismatches: readonly H04TruthLedgerFinding[];
  readonly verified_refs: readonly H04VerifiedTruthLedgerRef[];
  readonly hash_failures: readonly H04TruthLedgerFinding[];
  readonly ledger_results: readonly H04LedgerValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H04LedgerValidationResult {
  readonly ledgerId: string;
  readonly ref: string;
  readonly status: H04ExpectedLedgerStatus;
  readonly expectedStatus: H04ExpectedLedgerStatus;
  readonly event_count: number;
  readonly findingKinds: readonly string[];
}

export interface H04VerifiedTruthLedgerRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "ledger" | "event_source";
}

export interface H04TruthLedgerFinding {
  readonly kind: string;
  readonly ledgerId?: string;
  readonly eventId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H04LedgerDocument {
  readonly ledger_id?: unknown;
  readonly events?: unknown;
}

interface H04TruthLedgerEvent {
  readonly schema_version: string;
  readonly event_id: string;
  readonly event_type: H04TruthLedgerEventType;
  readonly project_id: string;
  readonly box_id: string;
  readonly ffet_id?: string;
  readonly actor_or_system: string;
  readonly source_ref: string;
  readonly source_sha256: string;
  readonly product_sha?: string;
  readonly tree_hash?: string;
  readonly control_ref?: string;
  readonly evidence_ref?: string;
  readonly runtime_ref?: string;
  readonly artifact_purpose: H04ArtifactPurpose;
  readonly truth_source_class: H04TruthSourceClass;
  readonly freshness_status: H04FreshnessStatus;
  readonly created_at: string;
  readonly supersedes?: readonly H04RefHash[];
  readonly cannot_claim: readonly string[];
}

interface H04RefHash {
  readonly ref: string;
  readonly sha256: string;
}

type H04TruthLedgerEventType =
  | "box_planned"
  | "ffet_created"
  | "ffet_audited"
  | "branch_worktree_requested"
  | "validation_recorded"
  | "pr_opened"
  | "ci_state_recorded"
  | "merge_recorded"
  | "evidence_manifest_linked"
  | "closeout_recorded"
  | "learning_recorded"
  | "assurance_recorded"
  | "current_state_superseded"
  | "box_gate_decided"
  | "runtime_recorded";

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

type H04TruthSourceClass =
  | "human_ratification"
  | "accepted_control"
  | "canonical_bundle"
  | "product_git"
  | "github_truth"
  | "evidence_attestation"
  | "runtime_state"
  | "generated_view"
  | "fixture_state"
  | "unavailable"
  | "stale"
  | "conflicting";

type H04FreshnessStatus =
  | "fresh"
  | "stale"
  | "superseded"
  | "unknown"
  | "not_applicable_with_reason";

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const AUTHORITY_SUPPORTING_CLASSES = new Set<H04TruthSourceClass>([
  "human_ratification",
  "accepted_control",
  "canonical_bundle",
  "product_git",
  "github_truth",
  "evidence_attestation"
]);

export function verifyH04TruthLedgerConfig(
  config: H04TruthLedgerConfig
): H04TruthLedgerReport {
  const findings: H04TruthLedgerFinding[] = [];
  const classifiedMismatches: H04TruthLedgerFinding[] = [];
  const verifiedRefs: H04VerifiedTruthLedgerRef[] = [];
  const schemaValidator = loadSchemaValidator(config, findings, verifiedRefs);
  const ledgerResults: H04LedgerValidationResult[] = [];

  for (const ledgerExpectation of config.ledgers) {
    ledgerResults.push(
      verifyLedgerExpectation(
        config,
        ledgerExpectation,
        schemaValidator,
        findings,
        classifiedMismatches,
        verifiedRefs
      )
    );
  }

  const hashFailures = [...findings, ...classifiedMismatches].filter((finding) =>
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
    ledger_results: ledgerResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidator(
  config: H04TruthLedgerConfig,
  findings: H04TruthLedgerFinding[],
  verifiedRefs: H04VerifiedTruthLedgerRef[]
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

function verifyLedgerExpectation(
  config: H04TruthLedgerConfig,
  expectation: H04LedgerExpectation,
  schemaValidator: ValidateFunction<unknown> | null,
  findings: H04TruthLedgerFinding[],
  classifiedMismatches: H04TruthLedgerFinding[],
  verifiedRefs: H04VerifiedTruthLedgerRef[]
): H04LedgerValidationResult {
  const ledgerFindings: H04TruthLedgerFinding[] = [];
  const ledgerPath = resolveLogicalRef(expectation.ref, config.logicalRoots, ledgerFindings);
  if (!ledgerPath || !existsSync(ledgerPath)) {
    const finding: H04TruthLedgerFinding = {
      kind: "ledger_missing",
      ledgerId: expectation.ledgerId,
      ref: expectation.ref
    };
    ledgerFindings.push(ledgerPath ? { ...finding, path: ledgerPath } : finding);
    return finishLedgerResult(expectation, 0, ledgerFindings, findings, classifiedMismatches);
  }

  const ledgerText = readFileSync(ledgerPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(ledgerText)) {
    ledgerFindings.push({
      kind: "private_path_in_ledger",
      ledgerId: expectation.ledgerId,
      ref: expectation.ref,
      path: ledgerPath
    });
  }
  verifiedRefs.push({
    ref: expectation.ref,
    path: ledgerPath,
    sha256: sha256Text(ledgerText),
    source: "ledger"
  });

  const parsed = parseJson(ledgerText, expectation.ref, ledgerFindings);
  const events = parseLedgerEvents(expectation, parsed, ledgerFindings);
  if (events.length === 0) {
    return finishLedgerResult(expectation, 0, ledgerFindings, findings, classifiedMismatches);
  }

  validateEventsWithSchema(expectation, events, schemaValidator, ledgerFindings);
  verifyEventSourceRefs(config, expectation, events, ledgerFindings, verifiedRefs);
  verifyEventSemantics(config, expectation, events, ledgerFindings, classifiedMismatches);

  return finishLedgerResult(
    expectation,
    events.length,
    ledgerFindings,
    findings,
    classifiedMismatches
  );
}

function parseLedgerEvents(
  expectation: H04LedgerExpectation,
  parsed: unknown,
  ledgerFindings: H04TruthLedgerFinding[]
): H04TruthLedgerEvent[] {
  if (!isRecord(parsed)) {
    ledgerFindings.push({
      kind: "ledger_not_object",
      ledgerId: expectation.ledgerId,
      ref: expectation.ref
    });
    return [];
  }

  const document = parsed as H04LedgerDocument;
  if (document.ledger_id !== expectation.ledgerId) {
    ledgerFindings.push({
      kind: "ledger_id_mismatch",
      ledgerId: expectation.ledgerId,
      ref: expectation.ref,
      expected: expectation.ledgerId,
      actual: typeof document.ledger_id === "string" ? document.ledger_id : "missing_or_invalid"
    });
  }

  if (!Array.isArray(document.events)) {
    ledgerFindings.push({
      kind: "ledger_events_missing",
      ledgerId: expectation.ledgerId,
      ref: expectation.ref
    });
    return [];
  }
  return document.events.filter(isRecord) as unknown as H04TruthLedgerEvent[];
}

function validateEventsWithSchema(
  expectation: H04LedgerExpectation,
  events: readonly H04TruthLedgerEvent[],
  schemaValidator: ValidateFunction<unknown> | null,
  ledgerFindings: H04TruthLedgerFinding[]
): void {
  if (!schemaValidator) {
    ledgerFindings.push({ kind: "schema_validator_unavailable", ledgerId: expectation.ledgerId });
    return;
  }

  for (const event of events) {
    const eventId = event.event_id;
    if (!schemaValidator(event)) {
      for (const issue of schemaValidator.errors ?? []) {
        const finding: H04TruthLedgerFinding = {
          kind: schemaIssueKind(issue),
          ledgerId: expectation.ledgerId,
          eventId
        };
        ledgerFindings.push(issue.message ? { ...finding, detail: issue.message } : finding);
      }
    }
  }
}

function verifyEventSourceRefs(
  config: H04TruthLedgerConfig,
  expectation: H04LedgerExpectation,
  events: readonly H04TruthLedgerEvent[],
  ledgerFindings: H04TruthLedgerFinding[],
  verifiedRefs: H04VerifiedTruthLedgerRef[]
): void {
  const sourceHashesByRef = new Map<string, string>();
  for (const event of events) {
    if (!event.source_ref || !event.source_sha256) continue;
    const hashFinding = validateSha256(event.source_sha256, "source_sha256_invalid");
    if (hashFinding) {
      ledgerFindings.push({ ...hashFinding, ledgerId: expectation.ledgerId, eventId: event.event_id });
      continue;
    }

    const normalizedHash = normalizeSha256(event.source_sha256);
    const priorHash = sourceHashesByRef.get(event.source_ref);
    if (priorHash && priorHash !== normalizedHash) {
      ledgerFindings.push({
        kind: "duplicate_source_ref_conflicting_hash",
        ledgerId: expectation.ledgerId,
        eventId: event.event_id,
        ref: event.source_ref,
        expected: priorHash,
        actual: normalizedHash
      });
    }
    sourceHashesByRef.set(event.source_ref, normalizedHash);

    const sourcePath = resolveLogicalRef(event.source_ref, config.logicalRoots, ledgerFindings);
    if (!sourcePath) continue;
    if (!existsSync(sourcePath)) {
      ledgerFindings.push({
        kind: "event_source_missing",
        ledgerId: expectation.ledgerId,
        eventId: event.event_id,
        ref: event.source_ref,
        path: sourcePath
      });
      continue;
    }
    const actualHash = sha256File(sourcePath);
    if (actualHash !== normalizedHash) {
      ledgerFindings.push({
        kind: "event_source_hash_mismatch",
        ledgerId: expectation.ledgerId,
        eventId: event.event_id,
        ref: event.source_ref,
        path: sourcePath,
        expected: normalizedHash,
        actual: actualHash
      });
      continue;
    }
    verifiedRefs.push({
      ref: event.source_ref,
      path: sourcePath,
      sha256: actualHash,
      source: "event_source"
    });
  }
}

function verifyEventSemantics(
  config: H04TruthLedgerConfig,
  expectation: H04LedgerExpectation,
  events: readonly H04TruthLedgerEvent[],
  ledgerFindings: H04TruthLedgerFinding[],
  classifiedMismatches: H04TruthLedgerFinding[]
): void {
  const eventIds = new Map<string, string>();
  const latestFreshByScope = new Set<string>();
  const learningByFfet = new Set<string>();
  const closeoutByFfet: H04TruthLedgerEvent[] = [];

  for (const event of events) {
    const eventFingerprint = sha256Text(JSON.stringify(event));
    const priorFingerprint = eventIds.get(event.event_id);
    if (priorFingerprint && priorFingerprint !== eventFingerprint) {
      ledgerFindings.push({
        kind: "duplicate_event_id_conflict",
        ledgerId: expectation.ledgerId,
        eventId: event.event_id
      });
    }
    eventIds.set(event.event_id, eventFingerprint);

    validateGitHashFields(config, expectation, event, ledgerFindings, classifiedMismatches);
    validateAuthorityBoundary(expectation, event, ledgerFindings);
    validateSupersession(expectation, event, ledgerFindings);

    const scopeKey = `${event.box_id}:${event.ffet_id ?? ""}:${event.artifact_purpose}`;
    if (event.freshness_status === "fresh") {
      latestFreshByScope.add(scopeKey);
    }
    if (
      (event.freshness_status === "stale" || event.freshness_status === "superseded") &&
      latestFreshByScope.has(scopeKey)
    ) {
      ledgerFindings.push({
        kind: "stale_event_after_fresh_event",
        ledgerId: expectation.ledgerId,
        eventId: event.event_id
      });
    }

    if (event.event_type === "learning_recorded" && event.ffet_id) {
      learningByFfet.add(event.ffet_id);
    }
    if (event.event_type === "closeout_recorded" && event.ffet_id) {
      closeoutByFfet.push(event);
    }
  }

  for (const closeoutEvent of closeoutByFfet) {
    if (closeoutEvent.ffet_id && !learningByFfet.has(closeoutEvent.ffet_id)) {
      ledgerFindings.push({
        kind: "terminal_closeout_missing_learning",
        ledgerId: expectation.ledgerId,
        eventId: closeoutEvent.event_id,
        detail: closeoutEvent.ffet_id
      });
    }
  }
}

function validateGitHashFields(
  config: H04TruthLedgerConfig,
  expectation: H04LedgerExpectation,
  event: H04TruthLedgerEvent,
  ledgerFindings: H04TruthLedgerFinding[],
  classifiedMismatches: H04TruthLedgerFinding[]
): void {
  if (event.product_sha && !GIT_OBJECT_PATTERN.test(event.product_sha)) {
    ledgerFindings.push({
      kind: "product_sha_not_git_object_hash",
      ledgerId: expectation.ledgerId,
      eventId: event.event_id,
      actual: event.product_sha
    });
  }
  if (event.tree_hash && !GIT_OBJECT_PATTERN.test(event.tree_hash)) {
    ledgerFindings.push({
      kind: "tree_hash_not_git_object_hash",
      ledgerId: expectation.ledgerId,
      eventId: event.event_id,
      actual: event.tree_hash
    });
  }

  if (
    event.product_sha &&
    config.expectedCurrentProductSha &&
    event.product_sha !== config.expectedCurrentProductSha
  ) {
    const mismatch = {
      kind: "product_sha_stale",
      ledgerId: expectation.ledgerId,
      eventId: event.event_id,
      expected: config.expectedCurrentProductSha,
      actual: event.product_sha
    };
    if (event.freshness_status === "fresh") {
      ledgerFindings.push(mismatch);
    } else {
      classifiedMismatches.push(mismatch);
    }
  }

  if (
    event.tree_hash &&
    config.expectedCurrentTreeHash &&
    event.tree_hash !== config.expectedCurrentTreeHash
  ) {
    const mismatch = {
      kind: "tree_hash_stale",
      ledgerId: expectation.ledgerId,
      eventId: event.event_id,
      expected: config.expectedCurrentTreeHash,
      actual: event.tree_hash
    };
    if (event.freshness_status === "fresh") {
      ledgerFindings.push(mismatch);
    } else {
      classifiedMismatches.push(mismatch);
    }
  }
}

function validateAuthorityBoundary(
  expectation: H04LedgerExpectation,
  event: H04TruthLedgerEvent,
  ledgerFindings: H04TruthLedgerFinding[]
): void {
  if (
    event.artifact_purpose === "authority" &&
    !AUTHORITY_SUPPORTING_CLASSES.has(event.truth_source_class)
  ) {
    ledgerFindings.push({
      kind: "truth_source_authority_overclaim",
      ledgerId: expectation.ledgerId,
      eventId: event.event_id,
      expected: [...AUTHORITY_SUPPORTING_CLASSES].join(","),
      actual: event.truth_source_class
    });
  }

  if (
    event.artifact_purpose === "current_state" &&
    event.freshness_status === "fresh" &&
    (event.truth_source_class === "fixture_state" || event.truth_source_class === "generated_view")
  ) {
    ledgerFindings.push({
      kind: "fixture_or_generated_currentness_overclaim",
      ledgerId: expectation.ledgerId,
      eventId: event.event_id,
      actual: event.truth_source_class
    });
  }
}

function validateSupersession(
  expectation: H04LedgerExpectation,
  event: H04TruthLedgerEvent,
  ledgerFindings: H04TruthLedgerFinding[]
): void {
  const refs = new Map<string, string>();
  for (const superseded of event.supersedes ?? []) {
    const priorHash = refs.get(superseded.ref);
    if (priorHash && priorHash !== superseded.sha256) {
      ledgerFindings.push({
        kind: "supersession_conflict",
        ledgerId: expectation.ledgerId,
        eventId: event.event_id,
        ref: superseded.ref,
        expected: priorHash,
        actual: superseded.sha256
      });
    }
    refs.set(superseded.ref, superseded.sha256);
  }
}

function finishLedgerResult(
  expectation: H04LedgerExpectation,
  eventCount: number,
  ledgerFindings: readonly H04TruthLedgerFinding[],
  findings: H04TruthLedgerFinding[],
  classifiedMismatches: H04TruthLedgerFinding[]
): H04LedgerValidationResult {
  const actualStatus: H04ExpectedLedgerStatus = ledgerFindings.length === 0 ? "passed" : "failed";
  const findingKinds = [...new Set(ledgerFindings.map((finding) => finding.kind))];

  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "ledger_status_mismatch",
      ledgerId: expectation.ledgerId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedKind of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedKind)) {
      findings.push({
        kind: "expected_finding_missing",
        ledgerId: expectation.ledgerId,
        ref: expectation.ref,
        expected: expectedKind,
        actual: findingKinds.join(",")
      });
    }
  }

  if (expectation.expectedStatus === "failed") {
    classifiedMismatches.push(...ledgerFindings);
  } else {
    findings.push(...ledgerFindings);
  }

  return {
    ledgerId: expectation.ledgerId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    event_count: eventCount,
    findingKinds
  };
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H04TruthLedgerFinding[]
): string | null {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/(.+)$/u.exec(ref);
  if (!match) {
    const normalized = normalize(ref);
    if (normalized.startsWith("..") || isAbsolute(normalized)) {
      findings.push({ kind: "ref_path_escape", ref });
      return null;
    }
    return normalized;
  }

  const rootKey = `${match[1]}://`;
  const root = logicalRoots[rootKey];
  if (!root) {
    findings.push({ kind: "logical_root_missing", ref });
    return null;
  }
  return resolveInsideRoot(root, match[2] ?? "", ref, findings);
}

function resolveInsideRoot(
  root: string,
  relativePath: string,
  ref: string,
  findings: H04TruthLedgerFinding[]
): string | null {
  const normalizedRoot = resolve(root);
  const resolved = resolve(normalizedRoot, normalize(relativePath));
  const rootRelative = relative(normalizedRoot, resolved);
  if (rootRelative.startsWith("..") || isAbsolute(rootRelative)) {
    findings.push({ kind: "logical_ref_path_escape", ref });
    return null;
  }
  return resolved;
}

function parseJson(
  text: string,
  ref: string,
  findings: H04TruthLedgerFinding[]
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

function validateSha256(value: string, kind: string): H04TruthLedgerFinding | null {
  const normalized = normalizeSha256(value);
  if (PLACEHOLDER_PATTERN.test(value)) return { kind: `${kind}_placeholder`, actual: value };
  if (!SHA256_PATTERN.test(value)) return { kind, actual: value };
  if (PLACEHOLDER_PATTERN.test(normalized)) return { kind: `${kind}_placeholder`, actual: value };
  return null;
}

function schemaIssueKind(issue: ErrorObject): string {
  if (issue.keyword === "required") return "json_schema_required";
  if (issue.keyword === "additionalProperties") return "json_schema_additional_property";
  if (issue.keyword === "pattern") {
    const path = issue.instancePath.toLowerCase();
    if (path.includes("source_sha256") || path.includes("sha256")) return "json_schema_hash_pattern";
    if (path.includes("product_sha") || path.includes("tree_hash")) {
      return "json_schema_git_hash_pattern";
    }
  }
  return `json_schema_${issue.keyword}`;
}

function sha256File(path: string): string {
  return sha256Text(readFileSync(path, "utf8"));
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
