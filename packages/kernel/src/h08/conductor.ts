import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { withOptionalField } from "./optional-fields.js";

export type H08ConductorStatus = "passed" | "failed";
export type H08ExpectedConductorStatus = "passed" | "failed";
export type H08ConductorDecision = "dry_run_allowed" | "mutation_allowed" | "blocked" | "human_action_required";
export type H08ConductorActionType =
  | "dry_run_merge"
  | "merge_current_pr"
  | "remote_branch_cleanup"
  | "settings_mutation"
  | "branch_protection_mutation"
  | "force_push"
  | "history_rewrite"
  | "broad_cleanup";

export interface H08ConductorConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H08ConductorScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H08ConductorScenarioExpectation {
  readonly scenarioId: string;
  readonly envelopeRef: string;
  readonly envelopeSha256: string;
  readonly expectedStatus: H08ExpectedConductorStatus;
  readonly expectedDecision?: H08ConductorDecision;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H08ConductorExpectedRecord;
}

export interface H08ConductorExpectedRecord {
  readonly repository?: string;
  readonly prNumber?: number;
  readonly headSha?: string;
  readonly actionType?: H08ConductorActionType;
}

export interface H08ConductorReport {
  readonly status: H08ConductorStatus;
  readonly findings: readonly H08ConductorFinding[];
  readonly scenario_results: readonly H08ConductorScenarioResult[];
  readonly verified_refs: readonly H08VerifiedConductorRef[];
  readonly conductor_summary: H08ConductorSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H08ConductorScenarioResult {
  readonly scenarioId: string;
  readonly envelopeRef: string;
  readonly status: H08ConductorStatus;
  readonly expectedStatus: H08ExpectedConductorStatus;
  readonly findingKinds: readonly string[];
  readonly decision: H08ConductorDecision;
  readonly actionType: H08ConductorActionType | null;
  readonly prNumber: number | null;
  readonly headSha: string | null;
}

export interface H08VerifiedConductorRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "conductor_envelope";
}

export interface H08ConductorFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H08ConductorSummary {
  readonly verified_ref_count: number;
  readonly dry_run_allowed_count: number;
  readonly mutation_allowed_count: number;
  readonly blocked_count: number;
  readonly human_action_required_count: number;
  readonly blocking_finding_count: number;
}

interface H08ConductorEnvelope {
  readonly schema_version?: string;
  readonly envelope_id?: string;
  readonly captured_at?: string;
  readonly mode?: "fixture" | "dry_run" | "live_current_repo";
  readonly repository?: {
    readonly owner?: string;
    readonly name?: string;
  };
  readonly h08_gate?: {
    readonly status?: "satisfied" | "missing" | "stale" | "blocked";
    readonly ref?: string;
    readonly sha256?: string;
  };
  readonly merge_readiness?: {
    readonly decision?: "approved_for_merge" | "blocked" | "human_action_required";
    readonly ref?: string;
    readonly sha256?: string;
    readonly pr_number?: number;
    readonly expected_head_sha?: string;
    readonly actual_head_sha?: string;
    readonly exact_head_verified?: boolean;
    readonly required_checks_green?: boolean;
    readonly public_metadata_safe?: boolean;
    readonly evidence_fresh?: boolean;
    readonly closeout_plan_present?: boolean;
    readonly terminal_learning_plan_present?: boolean;
  };
  readonly requested_action?: {
    readonly action_type?: H08ConductorActionType;
    readonly dry_run?: boolean;
    readonly current_run_branch?: boolean;
    readonly closeout_complete?: boolean;
    readonly rollback_needed?: boolean;
    readonly branch_name?: string;
  };
  readonly branch_protection?: {
    readonly human_action_required?: boolean;
    readonly blocker_reason?: string;
  };
  readonly safety_policy?: {
    readonly current_repo_only?: boolean;
    readonly no_settings_mutation?: boolean;
    readonly no_branch_protection_mutation?: boolean;
    readonly no_force_push?: boolean;
    readonly no_history_rewrite?: boolean;
    readonly no_unscoped_cleanup?: boolean;
    readonly exact_head_required?: boolean;
    readonly dry_run_default?: boolean;
  };
  readonly conductor?: {
    readonly decision?: H08ConductorDecision;
    readonly mutation_commands_used?: readonly string[];
    readonly allowed_mutations?: readonly string[];
  };
  readonly cannot_claim?: readonly string[];
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;
const DANGEROUS_COMMAND_PATTERN =
  /\b(?:git\s+(?:push\s+(?:--force|-f)|reset|checkout|switch|commit|merge|rebase)|gh\s+(?:repo|api)|gh\s+pr\s+(?:merge|close|edit|comment))\b/iu;
const REQUIRED_CANNOT_CLAIM = [
  "github_settings_mutation_authorized",
  "branch_protection_mutation_authorized",
  "self_hosting_ready",
  "release_candidate",
  "production_ready",
  "stable_agents",
  "mechanically_independent_agents",
  "independent_quality_auditor_qualified"
];

export function verifyH08ConductorConfig(config: H08ConductorConfig): H08ConductorReport {
  const findings: H08ConductorFinding[] = [];
  const verifiedRefs: H08VerifiedConductorRef[] = [];
  const scenarioResults = config.scenarios.map((scenario) => verifyScenario(config, scenario, findings, verifiedRefs));
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "scenario_status_unexpected" ||
        finding.kind === "scenario_decision_unexpected" ||
        finding.kind === "expected_scenario_finding_missing"
    );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    conductor_summary: {
      verified_ref_count: verifiedRefs.length,
      dry_run_allowed_count: scenarioResults.filter((result) => result.decision === "dry_run_allowed").length,
      mutation_allowed_count: scenarioResults.filter((result) => result.decision === "mutation_allowed").length,
      blocked_count: scenarioResults.filter((result) => result.decision === "blocked").length,
      human_action_required_count: scenarioResults.filter((result) => result.decision === "human_action_required").length,
      blocking_finding_count: findings.length
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H08ConductorConfig,
  expectation: H08ConductorScenarioExpectation,
  findings: H08ConductorFinding[],
  verifiedRefs: H08VerifiedConductorRef[]
): H08ConductorScenarioResult {
  const localFindings: H08ConductorFinding[] = [];
  const hashFinding = validateSha256(expectation.envelopeSha256, "envelope_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.envelopeRef });

  const envelopePath = resolveLogicalRef(expectation.envelopeRef, config.logicalRoots, localFindings);
  let record: H08ConductorEnvelope | null = null;
  if (envelopePath && existsSync(envelopePath) && localFindings.length === 0) {
    const text = readFileSync(envelopePath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.envelopeSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "envelope_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.envelopeRef,
        path: envelopePath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.envelopeRef, path: envelopePath, sha256: actualHash, source: "conductor_envelope" });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.envelopeRef });
    }
    try {
      record = JSON.parse(text) as H08ConductorEnvelope;
    } catch (error) {
      localFindings.push({
        kind: "envelope_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.envelopeRef });
    }
  } else if (envelopePath && !existsSync(envelopePath)) {
    localFindings.push({
      kind: "envelope_missing",
      scenarioId: expectation.scenarioId,
      ref: expectation.envelopeRef,
      path: envelopePath
    });
  }

  if (record) localFindings.push(...verifyRecord(expectation, record));

  const decision = inferDecision(localFindings, record);
  const actualStatus: H08ConductorStatus = localFindings.length === 0 ? "passed" : "failed";
  const findingKindsBeforeExpectationChecks = localFindings.map((finding) => finding.kind);
  if (actualStatus !== expectation.expectedStatus) {
    localFindings.push({
      kind: "scenario_status_unexpected",
      scenarioId: expectation.scenarioId,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }
  if (expectation.expectedDecision && decision !== expectation.expectedDecision) {
    localFindings.push({
      kind: "scenario_decision_unexpected",
      scenarioId: expectation.scenarioId,
      expected: expectation.expectedDecision,
      actual: decision
    });
  }
  for (const expectedKind of expectation.expectedFindingKinds ?? []) {
    if (!findingKindsBeforeExpectationChecks.includes(expectedKind)) {
      localFindings.push({ kind: "expected_scenario_finding_missing", scenarioId: expectation.scenarioId, expected: expectedKind });
    }
  }

  findings.push(...localFindings);
  return {
    scenarioId: expectation.scenarioId,
    envelopeRef: expectation.envelopeRef,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    decision,
    actionType: record?.requested_action?.action_type ?? null,
    prNumber: record?.merge_readiness?.pr_number ?? null,
    headSha: record?.merge_readiness?.actual_head_sha ?? null
  };
}

function verifyRecord(
  expectation: H08ConductorScenarioExpectation,
  record: H08ConductorEnvelope
): H08ConductorFinding[] {
  const findings: H08ConductorFinding[] = [];
  const text = JSON.stringify(record);
  if (PLACEHOLDER_PATTERN.test(text)) findings.push({ kind: "placeholder_value_detected", scenarioId: expectation.scenarioId });
  if (record.schema_version !== "1.0.0") {
    findings.push({
      kind: "schema_version_invalid",
      scenarioId: expectation.scenarioId,
      expected: "1.0.0",
      actual: String(record.schema_version ?? "")
    });
  }
  const expectedRepository = expectation.expected?.repository ?? "usman-hussain-minhas/hadaf";
  const actualRepository = `${record.repository?.owner ?? ""}/${record.repository?.name ?? ""}`;
  if (record.safety_policy?.current_repo_only !== false && actualRepository !== expectedRepository) {
    findings.push({ kind: "wrong_repository", scenarioId: expectation.scenarioId, expected: expectedRepository, actual: actualRepository });
  }
  if (expectation.expected?.prNumber !== undefined && record.merge_readiness?.pr_number !== expectation.expected.prNumber) {
    findings.push({
      kind: "pr_number_mismatch",
      scenarioId: expectation.scenarioId,
      expected: String(expectation.expected.prNumber),
      actual: String(record.merge_readiness?.pr_number ?? "")
    });
  }
  if (expectation.expected?.headSha && record.merge_readiness?.actual_head_sha !== expectation.expected.headSha) {
    findings.push({
      kind: "head_sha_mismatch",
      scenarioId: expectation.scenarioId,
      expected: expectation.expected.headSha,
      actual: String(record.merge_readiness?.actual_head_sha ?? "")
    });
  }
  if (expectation.expected?.actionType && record.requested_action?.action_type !== expectation.expected.actionType) {
    findings.push({
      kind: "action_type_mismatch",
      scenarioId: expectation.scenarioId,
      expected: expectation.expected.actionType,
      actual: String(record.requested_action?.action_type ?? "")
    });
  }

  validateGate(record, expectation, findings);
  validateMergeReadiness(record, expectation, findings);
  validateSafetyPolicy(record, expectation, findings);
  validateRequestedAction(record, expectation, findings);
  validateCommands(record, expectation, findings);
  validateCannotClaim(record, expectation, findings);

  return findings;
}

function validateGate(
  record: H08ConductorEnvelope,
  expectation: H08ConductorScenarioExpectation,
  findings: H08ConductorFinding[]
): void {
  if (record.h08_gate?.status !== "satisfied") {
    findings.push({
      kind: "h08_gate_not_satisfied",
      scenarioId: expectation.scenarioId,
      actual: String(record.h08_gate?.status ?? "")
    });
  }
  const refFinding = validatePublicRef(record.h08_gate?.ref, "h08_gate_ref_invalid");
  if (refFinding) findings.push({ ...refFinding, scenarioId: expectation.scenarioId });
  const hashFinding = validateSha256(record.h08_gate?.sha256, "h08_gate_hash_invalid");
  if (hashFinding) findings.push({ ...hashFinding, scenarioId: expectation.scenarioId });
}

function validateMergeReadiness(
  record: H08ConductorEnvelope,
  expectation: H08ConductorScenarioExpectation,
  findings: H08ConductorFinding[]
): void {
  const readiness = record.merge_readiness;
  if (!readiness) {
    findings.push({ kind: "merge_readiness_missing", scenarioId: expectation.scenarioId });
    return;
  }
  const refFinding = validatePublicRef(readiness.ref, "merge_readiness_ref_invalid");
  if (refFinding) findings.push({ ...refFinding, scenarioId: expectation.scenarioId });
  const hashFinding = validateSha256(readiness.sha256, "merge_readiness_hash_invalid");
  if (hashFinding) findings.push({ ...hashFinding, scenarioId: expectation.scenarioId });
  if (readiness.decision !== "approved_for_merge") {
    findings.push({
      kind: "merge_readiness_not_approved",
      scenarioId: expectation.scenarioId,
      actual: String(readiness.decision ?? "")
    });
  }
  if (!readiness.actual_head_sha || !GIT_SHA_PATTERN.test(readiness.actual_head_sha)) {
    findings.push({ kind: "actual_head_sha_invalid", scenarioId: expectation.scenarioId });
  }
  if (!readiness.expected_head_sha || !GIT_SHA_PATTERN.test(readiness.expected_head_sha)) {
    findings.push({ kind: "expected_head_sha_invalid", scenarioId: expectation.scenarioId });
  }
  if (readiness.exact_head_verified !== true || readiness.actual_head_sha !== readiness.expected_head_sha) {
    findings.push({ kind: "exact_head_not_verified", scenarioId: expectation.scenarioId });
  }
  if (readiness.required_checks_green !== true) findings.push({ kind: "required_checks_not_green", scenarioId: expectation.scenarioId });
  if (readiness.public_metadata_safe !== true) findings.push({ kind: "public_metadata_not_safe", scenarioId: expectation.scenarioId });
  if (readiness.evidence_fresh !== true) findings.push({ kind: "artifact_manifest_not_fresh", scenarioId: expectation.scenarioId });
  if (readiness.closeout_plan_present !== true) findings.push({ kind: "closeout_plan_missing", scenarioId: expectation.scenarioId });
  if (readiness.terminal_learning_plan_present !== true) {
    findings.push({ kind: "terminal_learning_plan_missing", scenarioId: expectation.scenarioId });
  }
}

function validateSafetyPolicy(
  record: H08ConductorEnvelope,
  expectation: H08ConductorScenarioExpectation,
  findings: H08ConductorFinding[]
): void {
  const policy = record.safety_policy;
  if (!policy) {
    findings.push({ kind: "safety_policy_missing", scenarioId: expectation.scenarioId });
    return;
  }
  const requiredTrueFields = [
    ["current_repo_only", policy.current_repo_only],
    ["no_settings_mutation", policy.no_settings_mutation],
    ["no_branch_protection_mutation", policy.no_branch_protection_mutation],
    ["no_force_push", policy.no_force_push],
    ["no_history_rewrite", policy.no_history_rewrite],
    ["no_unscoped_cleanup", policy.no_unscoped_cleanup],
    ["exact_head_required", policy.exact_head_required],
    ["dry_run_default", policy.dry_run_default]
  ] as const;
  for (const [field, value] of requiredTrueFields) {
    if (value !== true) findings.push({ kind: "safety_policy_field_missing", scenarioId: expectation.scenarioId, detail: field });
  }
}

function validateRequestedAction(
  record: H08ConductorEnvelope,
  expectation: H08ConductorScenarioExpectation,
  findings: H08ConductorFinding[]
): void {
  const action = record.requested_action;
  if (!action?.action_type) {
    findings.push({ kind: "action_type_missing", scenarioId: expectation.scenarioId });
    return;
  }
  if (record.branch_protection?.human_action_required === true) {
    findings.push(
      withOptionalField(
        {
          kind: "human_branch_protection_blocker",
          scenarioId: expectation.scenarioId
        },
        "detail",
        record.branch_protection.blocker_reason
      )
    );
  }
  if (action.action_type === "settings_mutation") findings.push({ kind: "settings_mutation_blocked", scenarioId: expectation.scenarioId });
  if (action.action_type === "branch_protection_mutation") {
    findings.push({ kind: "branch_protection_mutation_blocked", scenarioId: expectation.scenarioId });
  }
  if (action.action_type === "force_push") findings.push({ kind: "force_push_blocked", scenarioId: expectation.scenarioId });
  if (action.action_type === "history_rewrite") findings.push({ kind: "history_rewrite_blocked", scenarioId: expectation.scenarioId });
  if (action.action_type === "broad_cleanup") findings.push({ kind: "unscoped_cleanup_blocked", scenarioId: expectation.scenarioId });
  if (action.action_type === "remote_branch_cleanup") {
    if (action.current_run_branch !== true || action.closeout_complete !== true || action.rollback_needed !== false) {
      findings.push({ kind: "remote_branch_cleanup_not_allowed", scenarioId: expectation.scenarioId });
    }
  }
  if (action.action_type === "merge_current_pr" && action.dry_run !== false) {
    findings.push({ kind: "live_merge_requires_explicit_non_dry_run", scenarioId: expectation.scenarioId });
  }
}

function validateCommands(
  record: H08ConductorEnvelope,
  expectation: H08ConductorScenarioExpectation,
  findings: H08ConductorFinding[]
): void {
  const commands = record.conductor?.mutation_commands_used ?? [];
  if (record.requested_action?.dry_run !== false && commands.length > 0) {
    findings.push({ kind: "dry_run_mutation_command_detected", scenarioId: expectation.scenarioId });
  }
  for (const command of commands) {
    if (DANGEROUS_COMMAND_PATTERN.test(command)) {
      findings.push({ kind: "dangerous_mutation_command_detected", scenarioId: expectation.scenarioId, detail: command });
    }
  }
}

function validateCannotClaim(
  record: H08ConductorEnvelope,
  expectation: H08ConductorScenarioExpectation,
  findings: H08ConductorFinding[]
): void {
  const cannotClaim = record.cannot_claim ?? [];
  for (const claim of REQUIRED_CANNOT_CLAIM) {
    if (!cannotClaim.includes(claim)) {
      findings.push({ kind: "cannot_claim_missing", scenarioId: expectation.scenarioId, detail: claim });
    }
  }
}

function inferDecision(
  findings: readonly H08ConductorFinding[],
  record: H08ConductorEnvelope | null
): H08ConductorDecision {
  if (findings.some((finding) => finding.kind === "human_branch_protection_blocker")) return "human_action_required";
  if (findings.length > 0) return "blocked";
  if (record?.requested_action?.action_type === "dry_run_merge") return "dry_run_allowed";
  return "mutation_allowed";
}

function validateSha256(value: string | undefined, kind: string): H08ConductorFinding | null {
  if (!value || !SHA256_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(value)) {
    return { kind, actual: String(value ?? "") };
  }
  return null;
}

function validatePublicRef(value: string | undefined, kind: string): H08ConductorFinding | null {
  if (!value || PLACEHOLDER_PATTERN.test(value) || PRIVATE_METADATA_PATTERN.test(value)) {
    return { kind, actual: String(value ?? "") };
  }
  return null;
}

function resolveLogicalRef(
  ref: string,
  roots: Record<string, string>,
  findings: H08ConductorFinding[]
): string | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.+)$/iu.exec(ref);
  if (!match) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const scheme = match[1] ?? "";
  const body = match[2] ?? "";
  const root = roots[scheme];
  if (!root) {
    findings.push({ kind: "logical_root_missing", ref });
    return null;
  }
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, body);
  const relativePath = relative(rootPath, candidate);
  if (isAbsolute(body) || relativePath.startsWith("..") || isAbsolute(relativePath) || normalize(body).startsWith("..")) {
    findings.push({ kind: "logical_path_escape", ref });
    return null;
  }
  return candidate;
}

function containsPrivateMetadata(value: unknown): boolean {
  return PRIVATE_METADATA_PATTERN.test(JSON.stringify(value));
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
