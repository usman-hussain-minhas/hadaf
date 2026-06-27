import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { normalize, relative, resolve } from "node:path";

export type H06LocalLifecycleRunnerStatus = "passed" | "failed";
export type H06ExpectedLocalLifecycleRunnerStatus = "passed" | "failed";
export type H06LocalLifecycleRunnerRecordKind =
  | "worktree"
  | "lock"
  | "checkpoint"
  | "quarantine"
  | "pod"
  | "truth_ledger";

export interface H06LocalLifecycleRunnerConfig {
  readonly logicalRoots: Record<string, string>;
  readonly schemas: H06LocalLifecycleRunnerSchemaSet;
  readonly runs: readonly H06LocalLifecycleRunnerExpectation[];
  readonly requiredEmittedKinds?: readonly H06LocalLifecycleRunnerRecordKind[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H06LocalLifecycleRunnerSchemaSet {
  readonly common: H06LocalLifecycleRunnerSchemaDescriptor;
  readonly worktree: H06LocalLifecycleRunnerSchemaDescriptor;
  readonly lock: H06LocalLifecycleRunnerSchemaDescriptor;
  readonly checkpoint: H06LocalLifecycleRunnerSchemaDescriptor;
  readonly quarantine: H06LocalLifecycleRunnerSchemaDescriptor;
  readonly pod: H06LocalLifecycleRunnerSchemaDescriptor;
  readonly truthLedgerEvent: H06LocalLifecycleRunnerSchemaDescriptor;
}

export interface H06LocalLifecycleRunnerSchemaDescriptor {
  readonly ref: string;
  readonly sha256: string;
}

export interface H06LocalLifecycleRunnerExpectation {
  readonly runId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H06ExpectedLocalLifecycleRunnerStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H06LocalLifecycleRunnerReport {
  readonly status: H06LocalLifecycleRunnerStatus;
  readonly findings: readonly H06LocalLifecycleRunnerFinding[];
  readonly classified_mismatches: readonly H06LocalLifecycleRunnerFinding[];
  readonly verified_refs: readonly H06VerifiedLocalLifecycleRunnerRef[];
  readonly hash_failures: readonly H06LocalLifecycleRunnerFinding[];
  readonly run_results: readonly H06LocalLifecycleRunnerValidationResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H06LocalLifecycleRunnerValidationResult {
  readonly runId: string;
  readonly ref: string;
  readonly status: H06ExpectedLocalLifecycleRunnerStatus;
  readonly expectedStatus: H06ExpectedLocalLifecycleRunnerStatus;
  readonly maturity: string | null;
  readonly lifecycleMode: string | null;
  readonly emittedKinds: readonly H06LocalLifecycleRunnerRecordKind[];
  readonly findingKinds: readonly string[];
}

export interface H06VerifiedLocalLifecycleRunnerRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "schema" | "runner_scenario" | H06LocalLifecycleRunnerRecordKind;
}

export interface H06LocalLifecycleRunnerFinding {
  readonly kind: string;
  readonly runId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H06LocalLifecycleRunnerScenario {
  readonly schema_version: string;
  readonly run_id: string;
  readonly box_id: string;
  readonly ffet_id: string;
  readonly maturity: string;
  readonly lifecycle_mode: string;
  readonly run_status: string;
  readonly record_refs: readonly H06LocalLifecycleRecordRef[];
  readonly emitted_record_refs: readonly H06LocalLifecycleRecordRef[];
  readonly restart_reconcile: {
    readonly checkpoint_ref: string;
    readonly freshness_status: string;
    readonly reconcile_action: string;
  };
  readonly provider_policy: {
    readonly network_policy: string;
    readonly live_provider_calls_allowed: boolean;
    readonly provider_refs: readonly string[];
  };
  readonly output_policy: {
    readonly durable_outputs_required: boolean;
    readonly transient_only_allowed: boolean;
    readonly durable_output_refs: readonly string[];
  };
  readonly claims: readonly string[];
  readonly cannot_claim: readonly string[];
}

interface H06LocalLifecycleRecordRef {
  readonly kind: H06LocalLifecycleRunnerRecordKind;
  readonly ref: string;
  readonly sha256: string;
}

interface LoadedRunnerScenario {
  readonly expectation: H06LocalLifecycleRunnerExpectation;
  readonly scenario: H06LocalLifecycleRunnerScenario | null;
  readonly path: string | null;
  readonly findings: H06LocalLifecycleRunnerFinding[];
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const FORBIDDEN_POSITIVE_CLAIM_PATTERNS: readonly [RegExp, string][] = [
  [/\b(?:live[_\s-]+provider[_\s-]+calls?[_\s-]+allowed|live[_\s-]+lifecycle[_\s-]+runner[_\s-]+execution)\b/iu, "live_provider_call_overclaim"],
  [/\b(?:production[_\s-]+activation|production[_\s-]+ready|release[_\s-]+candidate|self[_\s-]+hosting[_\s-]+ready)\b/iu, "production_activation_overclaim"],
  [/\b(?:stable[_\s-]+agents?|mechanically[_\s-]+independent[_\s-]+agents?)\b/iu, "agent_independence_or_stability_overclaim"],
  [/\b(?:H07[_\s-]+proof[_\s-]+engine|H08[_\s/-]+git[_\s/-]+ci[_\s/-]+pr[_\s-]+merge[_\s-]+conductor)(?:[_\s-]+implemented)?\b/iu, "future_box_capability_overclaim"]
];

export function verifyH06LocalLifecycleRunnerConfig(
  config: H06LocalLifecycleRunnerConfig
): H06LocalLifecycleRunnerReport {
  const findings: H06LocalLifecycleRunnerFinding[] = [];
  const classifiedMismatches: H06LocalLifecycleRunnerFinding[] = [];
  const verifiedRefs: H06VerifiedLocalLifecycleRunnerRef[] = [];
  const validators = loadSchemaValidators(config, findings, verifiedRefs);

  const loadedRuns = config.runs.map((expectation) => loadRunnerScenario(config, expectation, verifiedRefs));
  const runResults = loadedRuns.map((loaded) =>
    verifyRunnerScenario(config, loaded, validators, findings, classifiedMismatches, verifiedRefs)
  );

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
    run_results: runResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function loadSchemaValidators(
  config: H06LocalLifecycleRunnerConfig,
  findings: H06LocalLifecycleRunnerFinding[],
  verifiedRefs: H06VerifiedLocalLifecycleRunnerRef[]
): Record<H06LocalLifecycleRunnerRecordKind, ValidateFunction<unknown> | null> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const commonSchema = loadSchema(config, config.schemas.common, findings, verifiedRefs);
  if (commonSchema) {
    try {
      ajv.addSchema(commonSchema as AnySchema);
    } catch (error) {
      findings.push({ kind: "common_schema_compile_failed", detail: errorDetail(error) });
    }
  }

  return {
    worktree: compileSchema(config, config.schemas.worktree, ajv, findings, verifiedRefs),
    lock: compileSchema(config, config.schemas.lock, ajv, findings, verifiedRefs),
    checkpoint: compileSchema(config, config.schemas.checkpoint, ajv, findings, verifiedRefs),
    quarantine: compileSchema(config, config.schemas.quarantine, ajv, findings, verifiedRefs),
    pod: compileSchema(config, config.schemas.pod, ajv, findings, verifiedRefs),
    truth_ledger: compileSchema(config, config.schemas.truthLedgerEvent, ajv, findings, verifiedRefs)
  };
}

function compileSchema(
  config: H06LocalLifecycleRunnerConfig,
  schema: H06LocalLifecycleRunnerSchemaDescriptor,
  ajv: Ajv2020,
  findings: H06LocalLifecycleRunnerFinding[],
  verifiedRefs: H06VerifiedLocalLifecycleRunnerRef[]
): ValidateFunction<unknown> | null {
  const parsedSchema = loadSchema(config, schema, findings, verifiedRefs);
  if (!parsedSchema) return null;
  try {
    return ajv.compile(parsedSchema as AnySchema);
  } catch (error) {
    findings.push({ kind: "schema_compile_failed", ref: schema.ref, detail: errorDetail(error) });
    return null;
  }
}

function loadSchema(
  config: H06LocalLifecycleRunnerConfig,
  schema: H06LocalLifecycleRunnerSchemaDescriptor,
  findings: H06LocalLifecycleRunnerFinding[],
  verifiedRefs: H06VerifiedLocalLifecycleRunnerRef[]
): unknown | null {
  const hashFinding = validateSha256(schema.sha256, "schema_hash_invalid");
  if (hashFinding) {
    findings.push({ ...hashFinding, ref: schema.ref });
    return null;
  }

  const schemaPath = resolveLogicalRef(schema.ref, config.logicalRoots, findings);
  if (!schemaPath) return null;
  if (!existsSync(schemaPath)) {
    findings.push({ kind: "schema_missing", ref: schema.ref, path: schemaPath });
    return null;
  }

  const schemaText = readFileSync(schemaPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(schemaText)) {
    findings.push({ kind: "private_path_in_schema", ref: schema.ref, path: schemaPath });
    return null;
  }

  const actualHash = sha256Text(schemaText);
  const expectedHash = normalizeSha256(schema.sha256);
  if (actualHash !== expectedHash) {
    findings.push({ kind: "schema_hash_mismatch", ref: schema.ref, path: schemaPath, expected: expectedHash, actual: actualHash });
    return null;
  }

  verifiedRefs.push({ ref: schema.ref, path: schemaPath, sha256: actualHash, source: "schema" });
  return parseJson(schemaText, schema.ref, findings);
}

function loadRunnerScenario(
  config: H06LocalLifecycleRunnerConfig,
  expectation: H06LocalLifecycleRunnerExpectation,
  verifiedRefs: H06VerifiedLocalLifecycleRunnerRef[]
): LoadedRunnerScenario {
  const runFindings: H06LocalLifecycleRunnerFinding[] = [];
  const scenarioPath = resolveLogicalRef(expectation.ref, config.logicalRoots, runFindings);
  if (!scenarioPath || !existsSync(scenarioPath)) {
    const finding: H06LocalLifecycleRunnerFinding = {
      kind: "runner_scenario_missing",
      runId: expectation.runId,
      ref: expectation.ref
    };
    runFindings.push(scenarioPath ? { ...finding, path: scenarioPath } : finding);
    return { expectation, scenario: null, path: scenarioPath, findings: runFindings };
  }

  const hashFinding = validateSha256(expectation.sha256, "runner_scenario_hash_invalid");
  if (hashFinding) {
    runFindings.push({ ...hashFinding, runId: expectation.runId, ref: expectation.ref });
  }

  const scenarioText = readFileSync(scenarioPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(scenarioText)) {
    runFindings.push({ kind: "private_path_in_runner_scenario", runId: expectation.runId, ref: expectation.ref, path: scenarioPath });
  }

  const actualHash = sha256Text(scenarioText);
  const expectedHash = normalizeSha256(expectation.sha256);
  if (actualHash !== expectedHash) {
    runFindings.push({
      kind: "runner_scenario_hash_mismatch",
      runId: expectation.runId,
      ref: expectation.ref,
      path: scenarioPath,
      expected: expectedHash,
      actual: actualHash
    });
  } else {
    verifiedRefs.push({ ref: expectation.ref, path: scenarioPath, sha256: actualHash, source: "runner_scenario" });
  }

  const parsed = parseJson(scenarioText, expectation.ref, runFindings);
  if (!isRunnerScenario(parsed)) {
    runFindings.push({ kind: "runner_scenario_malformed", runId: expectation.runId, ref: expectation.ref, path: scenarioPath });
    return { expectation, scenario: null, path: scenarioPath, findings: runFindings };
  }

  return { expectation, scenario: parsed, path: scenarioPath, findings: runFindings };
}

function verifyRunnerScenario(
  config: H06LocalLifecycleRunnerConfig,
  loaded: LoadedRunnerScenario,
  validators: Record<H06LocalLifecycleRunnerRecordKind, ValidateFunction<unknown> | null>,
  findings: H06LocalLifecycleRunnerFinding[],
  classifiedMismatches: H06LocalLifecycleRunnerFinding[],
  verifiedRefs: H06VerifiedLocalLifecycleRunnerRef[]
): H06LocalLifecycleRunnerValidationResult {
  const runFindings = [...loaded.findings];
  const scenario = loaded.scenario;
  if (scenario) {
    runFindings.push(...scenarioSemanticFindings(config, loaded.expectation, scenario));
    for (const recordRef of uniqueRecordRefs([...scenario.record_refs, ...scenario.emitted_record_refs])) {
      runFindings.push(...verifyReferencedRecord(config, loaded.expectation, recordRef, validators, verifiedRefs));
    }
  }

  return finishRunResult(loaded.expectation, scenario, runFindings, findings, classifiedMismatches);
}

function scenarioSemanticFindings(
  config: H06LocalLifecycleRunnerConfig,
  expectation: H06LocalLifecycleRunnerExpectation,
  scenario: H06LocalLifecycleRunnerScenario
): H06LocalLifecycleRunnerFinding[] {
  const findings: H06LocalLifecycleRunnerFinding[] = [];
  if (scenario.run_id !== expectation.runId) {
    findings.push({ kind: "runner_scenario_id_mismatch", runId: expectation.runId, expected: expectation.runId, actual: scenario.run_id });
  }
  if (scenario.box_id !== "H06") {
    findings.push({ kind: "runner_scenario_wrong_box", runId: expectation.runId, expected: "H06", actual: scenario.box_id });
  }
  if (scenario.ffet_id !== "H06-F04") {
    findings.push({ kind: "runner_scenario_wrong_ffet", runId: expectation.runId, expected: "H06-F04", actual: scenario.ffet_id });
  }
  if (scenario.maturity !== "fixture_backed") {
    findings.push({ kind: "runner_scenario_maturity_overclaim", runId: expectation.runId, expected: "fixture_backed", actual: scenario.maturity });
  }
  if (scenario.lifecycle_mode !== "fixture_replay") {
    findings.push({ kind: "runner_scenario_mode_overclaim", runId: expectation.runId, expected: "fixture_replay", actual: scenario.lifecycle_mode });
  }
  if (scenario.restart_reconcile.freshness_status !== "fresh") {
    findings.push({
      kind: "stale_restart_reconcile_state",
      runId: expectation.runId,
      ref: scenario.restart_reconcile.checkpoint_ref,
      actual: scenario.restart_reconcile.freshness_status
    });
  }
  if (scenario.provider_policy.live_provider_calls_allowed || scenario.provider_policy.provider_refs.length > 0) {
    findings.push({ kind: "live_provider_call_overclaim", runId: expectation.runId, detail: scenario.provider_policy.network_policy });
  }
  if (!scenario.output_policy.durable_outputs_required || scenario.output_policy.transient_only_allowed) {
    findings.push({ kind: "transient_only_output_not_terminal_evidence", runId: expectation.runId });
  }

  findings.push(...claimFindings(expectation.runId, scenario.claims));
  findings.push(...emissionFindings(config, expectation, scenario));
  findings.push(...cannotClaimFindings(config, expectation, scenario));
  return findings;
}

function emissionFindings(
  config: H06LocalLifecycleRunnerConfig,
  expectation: H06LocalLifecycleRunnerExpectation,
  scenario: H06LocalLifecycleRunnerScenario
): H06LocalLifecycleRunnerFinding[] {
  const findings: H06LocalLifecycleRunnerFinding[] = [];
  const emittedKinds = new Set(scenario.emitted_record_refs.map((recordRef) => recordRef.kind));
  for (const kind of config.requiredEmittedKinds ?? []) {
    if (!emittedKinds.has(kind)) {
      findings.push({ kind: "missing_emitted_record_kind", runId: expectation.runId, expected: kind });
    }
  }

  const durableRefs = new Set(scenario.output_policy.durable_output_refs);
  for (const recordRef of scenario.record_refs) {
    if (!durableRefs.has(recordRef.ref)) {
      findings.push({ kind: "durable_output_ref_missing_for_record", runId: expectation.runId, ref: recordRef.ref });
    }
  }

  return findings;
}

function cannotClaimFindings(
  config: H06LocalLifecycleRunnerConfig,
  expectation: H06LocalLifecycleRunnerExpectation,
  scenario: H06LocalLifecycleRunnerScenario
): H06LocalLifecycleRunnerFinding[] {
  const claims = new Set(scenario.cannot_claim);
  return (config.requiredCannotClaim ?? [])
    .filter((claim) => !claims.has(claim))
    .map((claim) => ({ kind: "required_cannot_claim_missing", runId: expectation.runId, expected: claim }));
}

function claimFindings(runId: string, claims: readonly string[]): H06LocalLifecycleRunnerFinding[] {
  const findings: H06LocalLifecycleRunnerFinding[] = [];
  for (const claim of claims) {
    for (const [pattern, kind] of FORBIDDEN_POSITIVE_CLAIM_PATTERNS) {
      if (pattern.test(claim)) findings.push({ kind, runId, detail: claim });
    }
  }
  return findings;
}

function verifyReferencedRecord(
  config: H06LocalLifecycleRunnerConfig,
  expectation: H06LocalLifecycleRunnerExpectation,
  recordRef: H06LocalLifecycleRecordRef,
  validators: Record<H06LocalLifecycleRunnerRecordKind, ValidateFunction<unknown> | null>,
  verifiedRefs: H06VerifiedLocalLifecycleRunnerRef[]
): H06LocalLifecycleRunnerFinding[] {
  const findings: H06LocalLifecycleRunnerFinding[] = [];
  const hashFinding = validateSha256(recordRef.sha256, "record_ref_hash_invalid");
  if (hashFinding) findings.push({ ...hashFinding, runId: expectation.runId, ref: recordRef.ref });
  const recordPath = resolveLogicalRef(recordRef.ref, config.logicalRoots, findings);
  if (!recordPath || !existsSync(recordPath)) {
    const finding: H06LocalLifecycleRunnerFinding = {
      kind: "record_ref_missing",
      runId: expectation.runId,
      ref: recordRef.ref
    };
    findings.push(recordPath ? { ...finding, path: recordPath } : finding);
    return findings;
  }

  const recordText = readFileSync(recordPath, "utf8");
  if (PRIVATE_PATH_PATTERN.test(recordText)) {
    findings.push({ kind: "private_path_in_record_ref", runId: expectation.runId, ref: recordRef.ref, path: recordPath });
  }

  const actualHash = sha256Text(recordText);
  const expectedHash = normalizeSha256(recordRef.sha256);
  if (actualHash !== expectedHash) {
    findings.push({ kind: "record_ref_hash_mismatch", runId: expectation.runId, ref: recordRef.ref, path: recordPath, expected: expectedHash, actual: actualHash });
    return findings;
  }

  const parsed = parseJson(recordText, recordRef.ref, findings);
  const validator = validators[recordRef.kind];
  if (!validator) {
    findings.push({ kind: "record_schema_unavailable", runId: expectation.runId, ref: recordRef.ref, detail: recordRef.kind });
    return findings;
  }

  if (recordRef.kind === "truth_ledger") {
    const events = extractLedgerEvents(parsed);
    if (events.length === 0) {
      findings.push({ kind: "truth_ledger_events_missing", runId: expectation.runId, ref: recordRef.ref });
    }
    for (const event of events) {
      if (!validator(event)) {
        findings.push({ kind: "truth_ledger_event_schema_validation_failed", runId: expectation.runId, ref: recordRef.ref, detail: formatAjvErrors(validator) });
      }
    }
  } else if (!validator(parsed)) {
    findings.push({ kind: `${recordRef.kind}_schema_validation_failed`, runId: expectation.runId, ref: recordRef.ref, detail: formatAjvErrors(validator) });
  }

  verifiedRefs.push({ ref: recordRef.ref, path: recordPath, sha256: actualHash, source: recordRef.kind });
  return findings;
}

function finishRunResult(
  expectation: H06LocalLifecycleRunnerExpectation,
  scenario: H06LocalLifecycleRunnerScenario | null,
  runFindings: readonly H06LocalLifecycleRunnerFinding[],
  findings: H06LocalLifecycleRunnerFinding[],
  classifiedMismatches: H06LocalLifecycleRunnerFinding[]
): H06LocalLifecycleRunnerValidationResult {
  const actualStatus: H06ExpectedLocalLifecycleRunnerStatus = runFindings.length === 0 ? "passed" : "failed";
  if (actualStatus !== expectation.expectedStatus) {
    findings.push({
      kind: "runner_scenario_status_unexpected",
      runId: expectation.runId,
      ref: expectation.ref,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedFindingKind of expectation.expectedFindingKinds ?? []) {
    if (!runFindings.some((finding) => finding.kind === expectedFindingKind)) {
      findings.push({ kind: "expected_negative_finding_missing", runId: expectation.runId, expected: expectedFindingKind });
    }
  }

  if (expectation.expectedStatus === "passed") findings.push(...runFindings);
  else classifiedMismatches.push(...runFindings);

  return {
    runId: expectation.runId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    maturity: scenario?.maturity ?? null,
    lifecycleMode: scenario?.lifecycle_mode ?? null,
    emittedKinds: scenario ? [...new Set(scenario.emitted_record_refs.map((recordRef) => recordRef.kind))] : [],
    findingKinds: runFindings.map((finding) => finding.kind)
  };
}

function uniqueRecordRefs(recordRefs: readonly H06LocalLifecycleRecordRef[]): H06LocalLifecycleRecordRef[] {
  const seen = new Map<string, H06LocalLifecycleRecordRef>();
  for (const recordRef of recordRefs) {
    const key = `${recordRef.kind}:${recordRef.ref}`;
    const existing = seen.get(key);
    if (!existing) seen.set(key, recordRef);
  }
  return [...seen.values()];
}

function extractLedgerEvents(parsed: unknown): readonly unknown[] {
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { events?: unknown }).events)) {
    return (parsed as { events: unknown[] }).events;
  }
  return [];
}

function isRunnerScenario(parsed: unknown): parsed is H06LocalLifecycleRunnerScenario {
  if (!parsed || typeof parsed !== "object") return false;
  const candidate = parsed as Partial<H06LocalLifecycleRunnerScenario>;
  return (
    candidate.schema_version === "fixture_h06_local_lifecycle_runner_scenario_v1" &&
    typeof candidate.run_id === "string" &&
    typeof candidate.box_id === "string" &&
    typeof candidate.ffet_id === "string" &&
    typeof candidate.maturity === "string" &&
    typeof candidate.lifecycle_mode === "string" &&
    typeof candidate.run_status === "string" &&
    Array.isArray(candidate.record_refs) &&
    Array.isArray(candidate.emitted_record_refs) &&
    !!candidate.restart_reconcile &&
    typeof candidate.restart_reconcile === "object" &&
    !!candidate.provider_policy &&
    typeof candidate.provider_policy === "object" &&
    !!candidate.output_policy &&
    typeof candidate.output_policy === "object" &&
    Array.isArray(candidate.claims) &&
    Array.isArray(candidate.cannot_claim)
  );
}

function validateSha256(value: string, kind: string): H06LocalLifecycleRunnerFinding | null {
  if (PLACEHOLDER_PATTERN.test(value)) return { kind: `${kind}_placeholder`, actual: value };
  if (!SHA256_PATTERN.test(value)) return { kind, actual: value };
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H06LocalLifecycleRunnerFinding[]
): string | null {
  const [scheme, refPath] = ref.split("://", 2);
  if (!scheme || !refPath) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const root = logicalRoots[scheme];
  if (!root) {
    findings.push({ kind: "logical_root_missing", ref, detail: scheme });
    return null;
  }

  const rootPath = resolve(root);
  const targetPath = resolve(rootPath, refPath);
  const relativePath = relative(rootPath, targetPath);
  if (relativePath.startsWith("..") || normalize(relativePath) === "..") {
    findings.push({ kind: "logical_path_escape", ref, path: targetPath });
    return null;
  }
  return targetPath;
}

function parseJson(text: string, ref: string, findings: H06LocalLifecycleRunnerFinding[]): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    findings.push({ kind: "json_parse_failed", ref, detail: errorDetail(error) });
    return null;
  }
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function formatAjvErrors(validator: ValidateFunction<unknown>): string {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "schema validation failed"}`)
    .join("; ");
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
