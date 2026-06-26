import { createHash } from "node:crypto";

export type H05HmcAgentProjectionStatus = "passed" | "failed";
export type H05HmcAgentProjectionMaturity =
  | "mocked"
  | "fixture_backed"
  | "api_backed"
  | "persistent"
  | "production_connected";

export interface H05HmcAgentProjectionConfig {
  readonly projectionId: string;
  readonly boxId: string;
  readonly productSha: string;
  readonly treeHash: string;
  readonly authority: "derived_view_only";
  readonly maturity: H05HmcAgentProjectionMaturity;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly requiredPrerequisites: readonly string[];
  readonly prerequisites: readonly H05HmcPrerequisiteInput[];
  readonly agents: readonly H05HmcAgentProjectionInput[];
  readonly requiredCannotClaim: readonly string[];
  readonly cannotClaim: readonly string[];
  readonly claimAuthority?: boolean;
  readonly claimStableAgents?: boolean;
  readonly claimMechanicalIndependence?: boolean;
  readonly claimRuntimeEnforcement?: boolean;
  readonly claimLiveAdapter?: boolean;
  readonly claimPersistence?: boolean;
}

export interface H05HmcPrerequisiteInput {
  readonly id: string;
  readonly status: string;
  readonly closeoutComplete: boolean;
  readonly evidenceManifestVerified: boolean;
  readonly terminalLearningComplete: boolean;
}

export interface H05HmcAgentProjectionInput {
  readonly agentId: string;
  readonly title: string;
  readonly status: string;
  readonly maturity: H05HmcAgentProjectionMaturity;
  readonly qualificationStatus: string;
  readonly boundedUseStatus: string;
  readonly registryStatus: "verified" | "missing" | "stale" | "conflict";
  readonly capabilityStatus: "verified" | "missing" | "stale" | "conflict";
  readonly circuitBreakerStatus: "verified" | "missing" | "stale" | "conflict" | "runtime_enforced";
  readonly upskillStatus: "verified" | "missing" | "stale" | "conflict" | "runtime_enforced";
  readonly truthSource: "fixture" | "verified_evidence" | "generated" | "unknown";
  readonly freshness: "fresh" | "stale" | "missing" | "conflict";
}

export interface H05HmcAgentProjectionReport {
  readonly status: H05HmcAgentProjectionStatus;
  readonly findings: readonly H05HmcAgentProjectionFinding[];
  readonly projection: H05HmcDerivedAgentProjection;
  readonly cannot_claim: readonly string[];
}

export interface H05HmcAgentProjectionFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H05HmcDerivedAgentProjection {
  readonly id: string;
  readonly boxId: string;
  readonly authority: "derived_view_only";
  readonly maturity: H05HmcAgentProjectionMaturity;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly productSha: string;
  readonly treeHash: string;
  readonly lifecycleHash: string;
  readonly agentStateHash: string;
  readonly prerequisiteSummary: {
    readonly total: number;
    readonly closeoutComplete: number;
    readonly evidenceVerified: number;
    readonly terminalLearningComplete: number;
  };
  readonly agentSummary: {
    readonly total: number;
    readonly boundedForH05: number;
    readonly fixtureTested: number;
    readonly registryVerified: number;
    readonly capabilityVerified: number;
    readonly circuitBreakersVerified: number;
    readonly upskillRecordsVerified: number;
  };
}

const SHA40_PATTERN = /^[a-f0-9]{40}$/u;
const ALLOWED_MATURITY = new Set<H05HmcAgentProjectionMaturity>(["mocked", "fixture_backed"]);
const REQUIRED_PREREQUISITES = new Set(["H05-F00", "H05-F01", "H05-F02", "H05-F03"]);
const STABLE_PATTERN = /\bstable(?:[_\s-]+agent|[_\s-]+agents)?\b|^stable$/iu;
const MECHANICAL_INDEPENDENCE_PATTERN =
  /\b(?:mechanically[_\s-]+independent|independent[_\s-]+quality[_\s-]+auditor|independent[_\s-]+process)(?:\b|[_\s-])/iu;

export function deriveH05HmcAgentProjection(
  config: H05HmcAgentProjectionConfig
): H05HmcAgentProjectionReport {
  const findings: H05HmcAgentProjectionFinding[] = [];

  validateAuthority(config, findings);
  validateMaturity(config.maturity, config.projectionId, findings);
  validateShas(config, findings);
  validatePrerequisites(config, findings);
  validateAgents(config, findings);
  validateClaims(config, findings);

  const projection: H05HmcDerivedAgentProjection = {
    id: config.projectionId,
    boxId: config.boxId,
    authority: config.authority,
    maturity: config.maturity,
    freshness: config.freshness,
    productSha: config.productSha,
    treeHash: config.treeHash,
    lifecycleHash: hashJson({
      boxId: config.boxId,
      prerequisites: config.prerequisites,
      agents: config.agents
    }),
    agentStateHash: hashJson(config.agents),
    prerequisiteSummary: {
      total: config.prerequisites.length,
      closeoutComplete: config.prerequisites.filter((prerequisite) => prerequisite.closeoutComplete).length,
      evidenceVerified: config.prerequisites.filter((prerequisite) => prerequisite.evidenceManifestVerified).length,
      terminalLearningComplete: config.prerequisites.filter((prerequisite) => prerequisite.terminalLearningComplete).length
    },
    agentSummary: {
      total: config.agents.length,
      boundedForH05: config.agents.filter((agent) => agent.boundedUseStatus === "bounded_for_h05").length,
      fixtureTested: config.agents.filter((agent) => agent.qualificationStatus === "fixture_tested").length,
      registryVerified: config.agents.filter((agent) => agent.registryStatus === "verified").length,
      capabilityVerified: config.agents.filter((agent) => agent.capabilityStatus === "verified").length,
      circuitBreakersVerified: config.agents.filter((agent) => agent.circuitBreakerStatus === "verified").length,
      upskillRecordsVerified: config.agents.filter((agent) => agent.upskillStatus === "verified").length
    }
  };

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    projection,
    cannot_claim: [...config.cannotClaim]
  };
}

function validateAuthority(
  config: H05HmcAgentProjectionConfig,
  findings: H05HmcAgentProjectionFinding[]
): void {
  if (config.authority !== "derived_view_only" || config.claimAuthority === true) {
    findings.push({
      kind: "h05_agent_projection_claims_authority",
      ref: config.projectionId,
      expected: "derived_view_only",
      actual: config.authority
    });
  }
}

function validateMaturity(
  maturity: H05HmcAgentProjectionMaturity,
  ref: string,
  findings: H05HmcAgentProjectionFinding[]
): void {
  if (!ALLOWED_MATURITY.has(maturity)) {
    findings.push({
      kind: "h05_agent_projection_maturity_overclaim",
      ref,
      expected: "fixture_backed_or_mocked",
      actual: maturity
    });
  }
}

function validateShas(
  config: H05HmcAgentProjectionConfig,
  findings: H05HmcAgentProjectionFinding[]
): void {
  if (!SHA40_PATTERN.test(config.productSha)) {
    findings.push({ kind: "invalid_product_sha", ref: "productSha", expected: "40 hex", actual: config.productSha });
  }
  if (!SHA40_PATTERN.test(config.treeHash)) {
    findings.push({ kind: "invalid_tree_hash", ref: "treeHash", expected: "40 hex", actual: config.treeHash });
  }
}

function validatePrerequisites(
  config: H05HmcAgentProjectionConfig,
  findings: H05HmcAgentProjectionFinding[]
): void {
  for (const required of REQUIRED_PREREQUISITES) {
    if (config.requiredPrerequisites.includes(required)) continue;
    findings.push({ kind: "missing_required_prerequisite", ref: required });
  }

  const prerequisitesById = new Map(config.prerequisites.map((prerequisite) => [prerequisite.id, prerequisite]));
  for (const required of config.requiredPrerequisites) {
    const prerequisite = prerequisitesById.get(required);
    if (!prerequisite) {
      findings.push({ kind: "prerequisite_missing", ref: required });
      continue;
    }
    if (prerequisite.status === "closeout_complete" && prerequisite.closeoutComplete !== true) {
      findings.push({
        kind: "prerequisite_closeout_status_overclaim",
        ref: required,
        expected: "closeoutComplete=true",
        actual: "false"
      });
    }
    if (prerequisite.closeoutComplete && (!prerequisite.evidenceManifestVerified || !prerequisite.terminalLearningComplete)) {
      findings.push({
        kind: "prerequisite_closeout_missing_evidence_or_learning",
        ref: required,
        expected: "evidenceManifestVerified and terminalLearningComplete",
        actual: `${prerequisite.evidenceManifestVerified}/${prerequisite.terminalLearningComplete}`
      });
    }
  }
}

function validateAgents(
  config: H05HmcAgentProjectionConfig,
  findings: H05HmcAgentProjectionFinding[]
): void {
  for (const agent of config.agents) {
    validateMaturity(agent.maturity, `agent:${agent.agentId}`, findings);
    if (agent.freshness !== "fresh") {
      findings.push({
        kind: "agent_projection_not_fresh",
        ref: `agent:${agent.agentId}`,
        expected: "fresh",
        actual: agent.freshness
      });
    }
    if (agent.registryStatus !== "verified") {
      findings.push({
        kind: "agent_registry_not_verified",
        ref: `agent:${agent.agentId}`,
        expected: "verified",
        actual: agent.registryStatus
      });
    }
    if (agent.capabilityStatus !== "verified") {
      findings.push({
        kind: "agent_capability_not_verified",
        ref: `agent:${agent.agentId}`,
        expected: "verified",
        actual: agent.capabilityStatus
      });
    }
    if (agent.circuitBreakerStatus !== "verified") {
      const kind =
        agent.circuitBreakerStatus === "runtime_enforced"
          ? "runtime_circuit_breaker_enforcement_overclaim"
          : "agent_circuit_breaker_not_verified";
      findings.push({
        kind,
        ref: `agent:${agent.agentId}`,
        expected: "verified",
        actual: agent.circuitBreakerStatus
      });
    }
    if (agent.upskillStatus !== "verified") {
      const kind =
        agent.upskillStatus === "runtime_enforced"
          ? "runtime_upskill_enforcement_overclaim"
          : "agent_upskill_not_verified";
      findings.push({
        kind,
        ref: `agent:${agent.agentId}`,
        expected: "verified",
        actual: agent.upskillStatus
      });
    }
    if (STABLE_PATTERN.test(agent.status) || STABLE_PATTERN.test(agent.qualificationStatus)) {
      findings.push({
        kind: "stable_agent_projection_overclaim",
        ref: `agent:${agent.agentId}`,
        expected: "fixture_tested_or_bounded",
        actual: `${agent.status}/${agent.qualificationStatus}`
      });
    }
    if (MECHANICAL_INDEPENDENCE_PATTERN.test(agent.status) || MECHANICAL_INDEPENDENCE_PATTERN.test(agent.qualificationStatus)) {
      findings.push({
        kind: "mechanical_independence_projection_overclaim",
        ref: `agent:${agent.agentId}`,
        expected: "cannot_claim_preserved",
        actual: `${agent.status}/${agent.qualificationStatus}`
      });
    }
  }
}

function validateClaims(
  config: H05HmcAgentProjectionConfig,
  findings: H05HmcAgentProjectionFinding[]
): void {
  const claimChecks: readonly [boolean | undefined, string, string][] = [
    [config.claimStableAgents, "stable_agent_projection_overclaim", "stable_agents"],
    [config.claimMechanicalIndependence, "mechanical_independence_projection_overclaim", "mechanically_independent_agents"],
    [config.claimRuntimeEnforcement, "runtime_enforcement_projection_overclaim", "runtime_enforcement"],
    [config.claimLiveAdapter, "live_adapter_overclaim", "live_github_adapter_implemented"],
    [config.claimPersistence, "persistence_overclaim", "persistent_state_store_implemented"]
  ];
  for (const [enabled, kind, ref] of claimChecks) {
    if (enabled !== true) continue;
    findings.push({ kind, ref, expected: "cannot_claim_preserved", actual: "claimed" });
  }

  for (const required of config.requiredCannotClaim) {
    if (config.cannotClaim.includes(required)) continue;
    findings.push({
      kind: "missing_required_cannot_claim",
      ref: `cannot_claim:${required}`
    });
  }
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
