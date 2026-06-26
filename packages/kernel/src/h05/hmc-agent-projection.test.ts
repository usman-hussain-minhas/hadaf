import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveH05HmcAgentProjection,
  type H05HmcAgentProjectionConfig
} from "./hmc-agent-projection.js";

test("derives a fixture-backed H05 HMC agent projection", () => {
  const report = deriveH05HmcAgentProjection(validConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.projection.authority, "derived_view_only");
  assert.equal(report.projection.maturity, "fixture_backed");
  assert.equal(report.projection.prerequisiteSummary.closeoutComplete, 4);
  assert.equal(report.projection.agentSummary.total, 3);
  assert.equal(report.projection.agentSummary.registryVerified, 3);
  assert.equal(report.projection.agentSummary.circuitBreakersVerified, 3);
  assert.match(report.projection.lifecycleHash, /^[a-f0-9]{64}$/u);
  assert.match(report.projection.agentStateHash, /^[a-f0-9]{64}$/u);
});

test("rejects authority, live adapter, persistence, and maturity overclaims", () => {
  const report = deriveH05HmcAgentProjection({
    ...validConfig(),
    maturity: "persistent",
    claimAuthority: true,
    claimLiveAdapter: true,
    claimPersistence: true
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h05_agent_projection_claims_authority");
  assertFinding(report, "h05_agent_projection_maturity_overclaim");
  assertFinding(report, "live_adapter_overclaim");
  assertFinding(report, "persistence_overclaim");
});

test("rejects stable-agent and mechanical-independence projection overclaims", () => {
  const report = deriveH05HmcAgentProjection({
    ...validConfig(),
    claimStableAgents: true,
    claimMechanicalIndependence: true,
    agents: [
      {
        ...validConfig().agents[0]!,
        status: "stable_agent",
        qualificationStatus: "mechanically_independent"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "stable_agent_projection_overclaim");
  assertFinding(report, "mechanical_independence_projection_overclaim");
});

test("rejects runtime-enforcement overclaims", () => {
  const report = deriveH05HmcAgentProjection({
    ...validConfig(),
    claimRuntimeEnforcement: true,
    agents: [
      {
        ...validConfig().agents[0]!,
        circuitBreakerStatus: "runtime_enforced",
        upskillStatus: "runtime_enforced"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "runtime_enforcement_projection_overclaim");
  assertFinding(report, "runtime_circuit_breaker_enforcement_overclaim");
  assertFinding(report, "runtime_upskill_enforcement_overclaim");
});

test("rejects missing prerequisite closeout evidence and learning", () => {
  const report = deriveH05HmcAgentProjection({
    ...validConfig(),
    prerequisites: [
      {
        id: "H05-F03",
        status: "closeout_complete",
        closeoutComplete: true,
        evidenceManifestVerified: false,
        terminalLearningComplete: false
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "prerequisite_missing");
  assertFinding(report, "prerequisite_closeout_missing_evidence_or_learning");
});

test("rejects missing cannot_claim and malformed or stale inputs", () => {
  const report = deriveH05HmcAgentProjection({
    ...validConfig(),
    productSha: "not-a-sha",
    freshness: "stale",
    cannotClaim: [],
    agents: [
      {
        ...validConfig().agents[0]!,
        freshness: "stale",
        registryStatus: "missing"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "invalid_product_sha");
  assertFinding(report, "agent_projection_not_fresh");
  assertFinding(report, "agent_registry_not_verified");
  assertFinding(report, "missing_required_cannot_claim");
});

test("exports H05 HMC agent projection APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.deriveH05HmcAgentProjection, "function");
});

function validConfig(): H05HmcAgentProjectionConfig {
  return {
    projectionId: "H05",
    boxId: "H05",
    productSha: sha40(),
    treeHash: sha40("a"),
    authority: "derived_view_only",
    maturity: "fixture_backed",
    freshness: "fresh",
    requiredPrerequisites: ["H05-F00", "H05-F01", "H05-F02", "H05-F03"],
    prerequisites: ["H05-F00", "H05-F01", "H05-F02", "H05-F03"].map(closeout),
    agents: [
      agent("codex.bootstrap"),
      agent("quality.auditor"),
      agent("git.conductor")
    ],
    requiredCannotClaim: requiredCannotClaim(),
    cannotClaim: requiredCannotClaim()
  };
}

function closeout(id: string): H05HmcPrerequisite {
  return {
    id,
    status: "closeout_complete",
    closeoutComplete: true,
    evidenceManifestVerified: true,
    terminalLearningComplete: true
  };
}

type H05HmcPrerequisite = H05HmcAgentProjectionConfig["prerequisites"][number];

function agent(agentId: string): H05HmcAgentProjectionConfig["agents"][number] {
  return {
    agentId,
    title: agentId,
    status: "fixture_projected",
    maturity: "fixture_backed",
    qualificationStatus: "fixture_tested",
    boundedUseStatus: "bounded_for_h05",
    registryStatus: "verified",
    capabilityStatus: "verified",
    circuitBreakerStatus: "verified",
    upskillStatus: "verified",
    truthSource: "fixture",
    freshness: "fresh"
  };
}

function requiredCannotClaim(): string[] {
  return [
    "stable_agents",
    "mechanically_independent_agents",
    "independent_quality_auditor_qualified",
    "runtime_circuit_breaker_enforcement",
    "runtime_upskill_enforcement",
    "HMC_authoritative_state",
    "live_github_adapter_implemented",
    "persistent_state_store_implemented"
  ];
}

function sha40(seed = "0"): string {
  return seed.repeat(40).slice(0, 40);
}

function findings(report: ReturnType<typeof deriveH05HmcAgentProjection>, kind: string): number {
  return report.findings.filter((finding) => finding.kind === kind).length;
}

function assertFinding(report: ReturnType<typeof deriveH05HmcAgentProjection>, kind: string): void {
  assert.equal(findings(report, kind) > 0, true);
}
