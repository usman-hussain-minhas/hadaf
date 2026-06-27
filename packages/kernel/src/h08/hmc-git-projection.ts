import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H08HmcGitProjectionStatus = "passed" | "failed";
export type H08ExpectedHmcGitProjectionStatus = "passed" | "failed";
export type H08HmcProjectionMaturity = "mocked" | "fixture_backed" | "api_backed" | "persistent" | "production_connected";
export type H08HmcProjectionEvidenceStatus = "verified" | "missing" | "stale" | "conflict";
export type H08HmcProjectionFreshness = "fresh" | "stale" | "missing" | "conflict";

export interface H08HmcGitProjectionConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H08HmcGitProjectionScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H08HmcGitProjectionScenarioExpectation {
  readonly scenarioId: string;
  readonly projectionRef: string;
  readonly projectionSha256: string;
  readonly expectedStatus: H08ExpectedHmcGitProjectionStatus;
  readonly expectedFindingKinds?: readonly string[];
  readonly expected?: H08ExpectedHmcGitProjectionRecord;
}

export interface H08ExpectedHmcGitProjectionRecord {
  readonly status?: string;
  readonly activeFfet?: string;
  readonly gitTruthStatus?: string;
  readonly conductorStatus?: string;
}

export interface H08HmcGitProjectionReport {
  readonly status: H08HmcGitProjectionStatus;
  readonly findings: readonly H08HmcGitProjectionFinding[];
  readonly scenario_results: readonly H08HmcGitProjectionScenarioResult[];
  readonly verified_refs: readonly H08VerifiedHmcGitProjectionRef[];
  readonly projection_summary: H08HmcGitProjectionSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H08HmcGitProjectionScenarioResult {
  readonly scenarioId: string;
  readonly projectionRef: string;
  readonly status: H08HmcGitProjectionStatus;
  readonly expectedStatus: H08ExpectedHmcGitProjectionStatus;
  readonly findingKinds: readonly string[];
  readonly projectionStatus: string | null;
  readonly activeFfet: string | null;
  readonly verifiedComponentCount: number;
  readonly blockedClaimCount: number;
}

export interface H08VerifiedHmcGitProjectionRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "h08_hmc_git_projection";
}

export interface H08HmcGitProjectionFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H08HmcGitProjectionSummary {
  readonly verified_ref_count: number;
  readonly verified_component_count: number;
  readonly blocking_finding_count: number;
  readonly blocked_claim_count: number;
  readonly settings_mutation_overclaim_count: number;
  readonly live_or_persistent_overclaim_count: number;
}

interface H08HmcGitProjectionRecord {
  readonly schema_version?: string;
  readonly projection_id?: string;
  readonly status?: string;
  readonly maturity?: H08HmcProjectionMaturity;
  readonly authority?: "derived_view_only" | "authority";
  readonly freshness?: H08HmcProjectionFreshness;
  readonly active_ffet?: string;
  readonly box?: H08ProjectionBoxRecord;
  readonly components?: readonly H08ProjectionComponentRecord[];
  readonly github_settings?: H08ProjectionSettingsRecord;
  readonly conductor?: H08ProjectionConductorRecord;
  readonly dogfood?: H08ProjectionDogfoodRecord;
  readonly blocked_claims?: readonly H08ProjectionBlockedClaimRecord[];
  readonly prerequisite_closeouts?: readonly H08ProjectionPrerequisiteRecord[];
  readonly claims?: H08ProjectionClaimsRecord;
  readonly cannot_claim?: readonly string[];
}

interface H08ProjectionBoxRecord {
  readonly id?: string;
  readonly status?: string;
  readonly assurance_status?: "not_started" | "pending" | "in_progress" | "complete";
}

interface H08ProjectionComponentRecord {
  readonly component_id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly maturity?: H08HmcProjectionMaturity;
  readonly evidence_status?: H08HmcProjectionEvidenceStatus;
  readonly freshness?: H08HmcProjectionFreshness;
  readonly truth_source?: "fixture" | "verified_evidence" | "generated" | "unknown";
  readonly required?: boolean;
}

interface H08ProjectionSettingsRecord {
  readonly inspection_status?: "verified" | "missing" | "stale" | "conflict";
  readonly settings_mutation_authorized?: boolean;
  readonly branch_protection_mutation_authorized?: boolean;
  readonly sha_pinning_platform_required_claimed?: boolean;
}

interface H08ProjectionConductorRecord {
  readonly status?: string;
  readonly bounded_envelope_verified?: boolean;
  readonly dry_run_default?: boolean;
  readonly full_conductor_implemented?: boolean;
  readonly live_mutation_permitted?: boolean;
}

interface H08ProjectionDogfoodRecord {
  readonly mode?: "fixture" | "dry_run" | "limited_current_repo" | "live";
  readonly limited_current_repo_merge_allowed?: boolean;
  readonly live_github_adapter_implemented?: boolean;
  readonly persistent_state_store_implemented?: boolean;
  readonly production_connected?: boolean;
}

interface H08ProjectionBlockedClaimRecord {
  readonly claim_id?: string;
  readonly reason?: string;
  readonly cannot_claim?: string;
}

interface H08ProjectionPrerequisiteRecord {
  readonly id?: string;
  readonly status?: string;
  readonly closeout_status?: "not_applicable" | "pending" | "closeout_complete";
  readonly evidence_status?: H08HmcProjectionEvidenceStatus;
  readonly terminal_learning_status?: "complete" | "missing" | "stale" | "conflict";
}

interface H08ProjectionClaimsRecord {
  readonly hmc_authority?: boolean;
  readonly full_conductor?: boolean;
  readonly settings_mutation?: boolean;
  readonly branch_protection_mutation?: boolean;
  readonly live_adapter?: boolean;
  readonly persistence?: boolean;
  readonly production_connected?: boolean;
  readonly h13_system_assurance?: boolean;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_METADATA_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\|control:\/\/|evidence:\/\/|runtime:\/\/|release:\/\/|input\/planning_bundle)/u;
const VALID_MATURITIES = new Set(["mocked", "fixture_backed", "api_backed", "persistent", "production_connected"]);
const REQUIRED_COMPONENTS = new Set(["git_truth", "pr_lifecycle", "ci_watcher", "merge_readiness", "conductor"]);
const REQUIRED_CANNOT_CLAIM = [
  "HMC_authoritative_state",
  "H08_git_ci_pr_merge_conductor_implemented",
  "github_settings_mutation_authorized",
  "branch_protection_mutation_authorized",
  "live_github_adapter_implemented",
  "persistent_state_store_implemented",
  "H13_system_assurance_engine_implemented",
  "self_hosting_ready",
  "production_ready"
];

export function verifyH08HmcGitProjectionConfig(config: H08HmcGitProjectionConfig): H08HmcGitProjectionReport {
  const findings: H08HmcGitProjectionFinding[] = [];
  const verifiedRefs: H08VerifiedHmcGitProjectionRef[] = [];
  const scenarioResults = config.scenarios.map((scenario) => verifyScenario(config, scenario, findings, verifiedRefs));
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "scenario_status_unexpected" ||
        finding.kind === "expected_scenario_finding_missing"
    );
  const settingsMutationOverclaims = findings.filter((finding) => finding.kind.includes("settings_mutation")).length;
  const liveOrPersistentOverclaims = findings.filter(
    (finding) => finding.kind.includes("live") || finding.kind.includes("persistent") || finding.kind.includes("production")
  ).length;

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    projection_summary: {
      verified_ref_count: verifiedRefs.length,
      verified_component_count: scenarioResults.reduce((sum, result) => sum + result.verifiedComponentCount, 0),
      blocking_finding_count: findings.length,
      blocked_claim_count: scenarioResults.reduce((sum, result) => sum + result.blockedClaimCount, 0),
      settings_mutation_overclaim_count: settingsMutationOverclaims,
      live_or_persistent_overclaim_count: liveOrPersistentOverclaims
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  config: H08HmcGitProjectionConfig,
  expectation: H08HmcGitProjectionScenarioExpectation,
  findings: H08HmcGitProjectionFinding[],
  verifiedRefs: H08VerifiedHmcGitProjectionRef[]
): H08HmcGitProjectionScenarioResult {
  const localFindings: H08HmcGitProjectionFinding[] = [];
  const hashFinding = validateSha256(expectation.projectionSha256, "projection_hash_invalid");
  if (hashFinding) {
    localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.projectionRef });
  }

  const projectionPath = resolveLogicalRef(expectation.projectionRef, config.logicalRoots, localFindings);
  let record: H08HmcGitProjectionRecord | null = null;
  if (projectionPath && existsSync(projectionPath) && localFindings.length === 0) {
    const text = readFileSync(projectionPath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.projectionSha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "projection_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.projectionRef,
        path: projectionPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({
        ref: expectation.projectionRef,
        path: projectionPath,
        sha256: actualHash,
        source: "h08_hmc_git_projection"
      });
    }
    if (PRIVATE_METADATA_PATTERN.test(text)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.projectionRef });
    }
    try {
      record = JSON.parse(text) as H08HmcGitProjectionRecord;
    } catch (error) {
      localFindings.push({
        kind: "projection_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (record && containsPrivateMetadata(record)) {
      localFindings.push({ kind: "private_metadata_detected", scenarioId: expectation.scenarioId, ref: expectation.projectionRef });
    }
  } else if (projectionPath && !existsSync(projectionPath)) {
    localFindings.push({
      kind: "projection_missing",
      scenarioId: expectation.scenarioId,
      ref: expectation.projectionRef,
      path: projectionPath
    });
  }

  if (record) localFindings.push(...verifyRecord(expectation, record));

  const actualStatus: H08HmcGitProjectionStatus = localFindings.length === 0 ? "passed" : "failed";
  const findingKindsBeforeExpectationChecks = localFindings.map((finding) => finding.kind);
  if (actualStatus !== expectation.expectedStatus) {
    localFindings.push({
      kind: "scenario_status_unexpected",
      scenarioId: expectation.scenarioId,
      expected: expectation.expectedStatus,
      actual: actualStatus
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
    projectionRef: expectation.projectionRef,
    status: localFindings.length === 0 ? actualStatus : expectation.expectedStatus === "failed" && actualStatus === "failed" ? "failed" : actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    projectionStatus: record?.status ?? null,
    activeFfet: record?.active_ffet ?? null,
    verifiedComponentCount: record?.components?.filter((component) => component.evidence_status === "verified").length ?? 0,
    blockedClaimCount: record?.blocked_claims?.length ?? 0
  };
}

function verifyRecord(
  expectation: H08HmcGitProjectionScenarioExpectation,
  record: H08HmcGitProjectionRecord
): H08HmcGitProjectionFinding[] {
  const findings: H08HmcGitProjectionFinding[] = [];
  const scenarioId = expectation.scenarioId;

  if (record.schema_version !== "h08_hmc_git_projection_v1") {
    findings.push({ kind: "invalid_schema_version", scenarioId, ref: "projection:schema_version", expected: "h08_hmc_git_projection_v1", actual: record.schema_version ?? "missing" });
  }
  if (record.authority !== "derived_view_only" || record.claims?.hmc_authority === true) {
    findings.push({
      kind: "h08_projection_claims_authority",
      scenarioId,
      ref: "projection:authority",
      expected: "derived_view_only",
      actual: record.authority ?? "missing"
    });
  }
  if (!record.maturity || !VALID_MATURITIES.has(record.maturity)) {
    findings.push({ kind: "invalid_projection_maturity", scenarioId, ref: "projection:maturity", actual: record.maturity ?? "missing" });
  } else if (record.maturity !== "fixture_backed") {
    findings.push({ kind: "h08_projection_maturity_overclaim", scenarioId, ref: "projection:maturity", expected: "fixture_backed", actual: record.maturity });
  }
  if (record.freshness !== "fresh") {
    findings.push({ kind: "h08_projection_not_fresh", scenarioId, ref: "projection:freshness", expected: "fresh", actual: record.freshness ?? "missing" });
  }

  if (expectation.expected?.status && record.status !== expectation.expected.status) {
    findings.push({ kind: "projection_status_unexpected", scenarioId, ref: "projection:status", expected: expectation.expected.status, actual: record.status ?? "missing" });
  }
  if (expectation.expected?.activeFfet && record.active_ffet !== expectation.expected.activeFfet) {
    findings.push({ kind: "active_ffet_unexpected", scenarioId, ref: "projection:active_ffet", expected: expectation.expected.activeFfet, actual: record.active_ffet ?? "missing" });
  }

  findings.push(...verifyComponents(scenarioId, expectation, record));
  findings.push(...verifySettings(scenarioId, record.github_settings));
  findings.push(...verifyConductor(scenarioId, record.conductor));
  findings.push(...verifyDogfood(scenarioId, record.dogfood));
  findings.push(...verifyPrerequisites(scenarioId, record.prerequisite_closeouts ?? []));
  findings.push(...verifyClaims(scenarioId, record.claims));
  findings.push(...verifyCannotClaims(scenarioId, record.cannot_claim ?? [], record.blocked_claims ?? []));

  return findings;
}

function verifyComponents(
  scenarioId: string,
  expectation: H08HmcGitProjectionScenarioExpectation,
  record: H08HmcGitProjectionRecord
): H08HmcGitProjectionFinding[] {
  const findings: H08HmcGitProjectionFinding[] = [];
  const components = record.components ?? [];
  const componentIds = new Set(components.map((component) => component.component_id).filter((id): id is string => typeof id === "string"));
  for (const required of REQUIRED_COMPONENTS) {
    if (componentIds.has(required)) continue;
    findings.push({ kind: "h08_required_component_missing", scenarioId, ref: `component:${required}` });
  }
  for (const component of components) {
    const ref = `component:${component.component_id ?? "unknown"}`;
    if (!component.component_id) {
      findings.push({ kind: "h08_component_id_missing", scenarioId, ref });
    }
    if (!component.maturity || !VALID_MATURITIES.has(component.maturity)) {
      findings.push({ kind: "h08_component_maturity_invalid", scenarioId, ref, actual: component.maturity ?? "missing" });
    } else if (component.maturity !== "fixture_backed") {
      findings.push({ kind: "h08_component_maturity_overclaim", scenarioId, ref, expected: "fixture_backed", actual: component.maturity });
    }
    if (component.required === true && component.evidence_status !== "verified") {
      findings.push({ kind: "h08_required_component_not_verified", scenarioId, ref, expected: "verified", actual: component.evidence_status ?? "missing" });
    }
    if (component.freshness !== "fresh") {
      findings.push({ kind: "h08_component_not_fresh", scenarioId, ref, expected: "fresh", actual: component.freshness ?? "missing" });
    }
  }
  if (expectation.expected?.gitTruthStatus) {
    const gitTruth = components.find((component) => component.component_id === "git_truth");
    if (gitTruth?.status !== expectation.expected.gitTruthStatus) {
      findings.push({ kind: "git_truth_status_unexpected", scenarioId, ref: "component:git_truth", expected: expectation.expected.gitTruthStatus, actual: gitTruth?.status ?? "missing" });
    }
  }
  if (expectation.expected?.conductorStatus) {
    const conductor = components.find((component) => component.component_id === "conductor");
    if (conductor?.status !== expectation.expected.conductorStatus) {
      findings.push({ kind: "conductor_status_unexpected", scenarioId, ref: "component:conductor", expected: expectation.expected.conductorStatus, actual: conductor?.status ?? "missing" });
    }
  }
  return findings;
}

function verifySettings(
  scenarioId: string,
  settings: H08ProjectionSettingsRecord | undefined
): H08HmcGitProjectionFinding[] {
  const findings: H08HmcGitProjectionFinding[] = [];
  if (!settings) return [{ kind: "h08_github_settings_missing", scenarioId, ref: "github_settings" }];
  if (settings.inspection_status !== "verified") {
    findings.push({ kind: "h08_github_settings_not_verified", scenarioId, ref: "github_settings", expected: "verified", actual: settings.inspection_status ?? "missing" });
  }
  if (settings.settings_mutation_authorized === true) {
    findings.push({ kind: "h08_settings_mutation_overclaim", scenarioId, ref: "github_settings:settings_mutation_authorized", expected: "false", actual: "true" });
  }
  if (settings.branch_protection_mutation_authorized === true) {
    findings.push({ kind: "h08_branch_protection_mutation_overclaim", scenarioId, ref: "github_settings:branch_protection_mutation_authorized", expected: "false", actual: "true" });
  }
  if (settings.sha_pinning_platform_required_claimed === true) {
    findings.push({ kind: "h08_platform_sha_pinning_overclaim", scenarioId, ref: "github_settings:sha_pinning_platform_required_claimed", expected: "scanner_only_or_unclaimed", actual: "claimed" });
  }
  return findings;
}

function verifyConductor(
  scenarioId: string,
  conductor: H08ProjectionConductorRecord | undefined
): H08HmcGitProjectionFinding[] {
  const findings: H08HmcGitProjectionFinding[] = [];
  if (!conductor) return [{ kind: "h08_conductor_projection_missing", scenarioId, ref: "conductor" }];
  if (conductor.bounded_envelope_verified !== true) {
    findings.push({ kind: "h08_conductor_envelope_not_verified", scenarioId, ref: "conductor", expected: "bounded_envelope_verified=true", actual: String(conductor.bounded_envelope_verified ?? "missing") });
  }
  if (conductor.dry_run_default !== true) {
    findings.push({ kind: "h08_conductor_dry_run_default_missing", scenarioId, ref: "conductor", expected: "true", actual: String(conductor.dry_run_default ?? "missing") });
  }
  if (conductor.full_conductor_implemented === true) {
    findings.push({ kind: "h08_full_conductor_overclaim", scenarioId, ref: "conductor:full_conductor_implemented", expected: "false", actual: "true" });
  }
  if (conductor.live_mutation_permitted === true) {
    findings.push({ kind: "h08_live_mutation_overclaim", scenarioId, ref: "conductor:live_mutation_permitted", expected: "false", actual: "true" });
  }
  return findings;
}

function verifyDogfood(
  scenarioId: string,
  dogfood: H08ProjectionDogfoodRecord | undefined
): H08HmcGitProjectionFinding[] {
  const findings: H08HmcGitProjectionFinding[] = [];
  if (!dogfood) return [{ kind: "h08_dogfood_projection_missing", scenarioId, ref: "dogfood" }];
  if (dogfood.mode === "live") {
    findings.push({ kind: "h08_live_dogfood_overclaim", scenarioId, ref: "dogfood:mode", expected: "fixture_or_dry_run_or_limited_current_repo", actual: dogfood.mode });
  }
  if (dogfood.live_github_adapter_implemented === true) {
    findings.push({ kind: "h08_live_adapter_overclaim", scenarioId, ref: "dogfood:live_github_adapter_implemented", expected: "false", actual: "true" });
  }
  if (dogfood.persistent_state_store_implemented === true) {
    findings.push({ kind: "h08_persistence_overclaim", scenarioId, ref: "dogfood:persistent_state_store_implemented", expected: "false", actual: "true" });
  }
  if (dogfood.production_connected === true) {
    findings.push({ kind: "h08_production_connected_overclaim", scenarioId, ref: "dogfood:production_connected", expected: "false", actual: "true" });
  }
  return findings;
}

function verifyPrerequisites(
  scenarioId: string,
  prerequisites: readonly H08ProjectionPrerequisiteRecord[]
): H08HmcGitProjectionFinding[] {
  const findings: H08HmcGitProjectionFinding[] = [];
  for (const prerequisite of prerequisites) {
    if (
      prerequisite.closeout_status === "closeout_complete" &&
      prerequisite.evidence_status === "verified" &&
      prerequisite.terminal_learning_status === "complete"
    ) {
      continue;
    }
    findings.push({
      kind: "h08_prerequisite_not_closeout_complete",
      scenarioId,
      ref: `prerequisite:${prerequisite.id ?? "unknown"}`,
      expected: "closeout_complete/verified/complete",
      actual: `${prerequisite.closeout_status ?? "missing"}/${prerequisite.evidence_status ?? "missing"}/${prerequisite.terminal_learning_status ?? "missing"}`
    });
  }
  return findings;
}

function verifyClaims(
  scenarioId: string,
  claims: H08ProjectionClaimsRecord | undefined
): H08HmcGitProjectionFinding[] {
  if (!claims) return [];
  const checks: readonly [boolean | undefined, string, string][] = [
    [claims.hmc_authority, "h08_projection_claims_authority", "HMC_authoritative_state"],
    [claims.full_conductor, "h08_full_conductor_overclaim", "H08_git_ci_pr_merge_conductor_implemented"],
    [claims.settings_mutation, "h08_settings_mutation_overclaim", "github_settings_mutation_authorized"],
    [claims.branch_protection_mutation, "h08_branch_protection_mutation_overclaim", "branch_protection_mutation_authorized"],
    [claims.live_adapter, "h08_live_adapter_overclaim", "live_github_adapter_implemented"],
    [claims.persistence, "h08_persistence_overclaim", "persistent_state_store_implemented"],
    [claims.production_connected, "h08_production_connected_overclaim", "production_ready"],
    [claims.h13_system_assurance, "h08_h13_system_assurance_overclaim", "H13_system_assurance_engine_implemented"]
  ];
  return checks
    .filter(([enabled]) => enabled === true)
    .map(([, kind, ref]) => ({ kind, scenarioId, ref, expected: "cannot_claim_preserved", actual: "claimed" }));
}

function verifyCannotClaims(
  scenarioId: string,
  cannotClaim: readonly string[],
  blockedClaims: readonly H08ProjectionBlockedClaimRecord[]
): H08HmcGitProjectionFinding[] {
  const findings: H08HmcGitProjectionFinding[] = [];
  for (const required of REQUIRED_CANNOT_CLAIM) {
    if (cannotClaim.includes(required)) continue;
    findings.push({ kind: "missing_h08_projection_cannot_claim", scenarioId, ref: `cannot_claim:${required}` });
  }
  for (const blocked of blockedClaims) {
    if (!blocked.cannot_claim || cannotClaim.includes(blocked.cannot_claim)) continue;
    findings.push({ kind: "h08_blocked_claim_missing_cannot_claim", scenarioId, ref: `blocked_claim:${blocked.claim_id ?? "unknown"}`, expected: blocked.cannot_claim });
  }
  return findings;
}

function resolveLogicalRef(
  ref: string,
  roots: Record<string, string>,
  findings: H08HmcGitProjectionFinding[]
): string | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.+)$/iu.exec(ref);
  if (!match) {
    findings.push({ kind: "invalid_logical_ref", ref, detail: "Expected logical URI." });
    return null;
  }
  const scheme = match[1] ?? "";
  const body = match[2] ?? "";
  const root = roots[scheme];
  if (!root) {
    findings.push({ kind: "unknown_logical_root", ref, detail: scheme });
    return null;
  }
  const rootPath = resolve(root);
  const targetPath = resolve(rootPath, body);
  if (!isPathInside(rootPath, targetPath)) {
    findings.push({ kind: "logical_path_escape", ref, path: targetPath });
    return null;
  }
  return targetPath;
}

function validateSha256(value: string, kind: string): H08HmcGitProjectionFinding | null {
  if (!value || PLACEHOLDER_PATTERN.test(value) || !SHA256_PATTERN.test(value)) {
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

function containsPrivateMetadata(value: unknown): boolean {
  if (typeof value === "string") return PRIVATE_METADATA_PATTERN.test(value);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsPrivateMetadata(item));
  return Object.values(value).some((item) => containsPrivateMetadata(item));
}

function isPathInside(root: string, target: string): boolean {
  const normalizedRoot = normalize(root);
  const normalizedTarget = normalize(target);
  const pathRelative = relative(normalizedRoot, normalizedTarget);
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative));
}
