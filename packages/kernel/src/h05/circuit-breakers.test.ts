import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH05CircuitBreakerConfig,
  type H05CircuitBreakerConfig
} from "./circuit-breakers.js";

const configPath = "fixtures/h05-circuit-breakers/valid-config.json";

function loadConfig(): H05CircuitBreakerConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H05CircuitBreakerConfig;
}

test("verifies H05 circuit breakers and no-rogue-agent boundaries", () => {
  const report = verifyH05CircuitBreakerConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.agent_results.length, 7);
  assert.equal(report.final_posture_recommendation, "H05_F02_CIRCUIT_BREAKERS_NO_ROGUE_CONTROLS_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "schema_ref"));
  assert(report.verified_refs.some((ref) => ref.source === "agent"));
  assert(report.cannot_claim.includes("runtime_circuit_breaker_enforcement"));
});

test("calibrates rogue-agent and circuit-breaker negative fixtures", () => {
  const report = verifyH05CircuitBreakerConfig(loadConfig());
  const results = new Map(report.agent_results.map((result) => [result.agentId, result]));

  assert.equal(results.get("agent.guard-valid")?.status, "passed");
  assert.equal(results.get("agent.missing-breaker")?.status, "failed");
  assert.equal(results.get("agent.release-plane")?.status, "failed");
  assert.equal(results.get("agent.force-push")?.status, "failed");
  assert.equal(results.get("agent.unbounded-write")?.status, "failed");
  assert.equal(results.get("agent.human-gate-bypass")?.status, "failed");
  assert.equal(results.get("agent.no-rogue-overclaim")?.status, "failed");

  for (const kind of [
    "required_circuit_breaker_missing",
    "forbidden_allowed_plane",
    "required_forbidden_plane_missing",
    "force_push_capability_forbidden",
    "unbounded_write_boundary",
    "human_gate_bypass_claim",
    "no_rogue_agent_overclaim"
  ]) {
    assert(report.classified_mismatches.some((finding) => finding.kind === kind), kind);
  }
});

test("fails when the configured schema hash drifts", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schema: {
      ...loaded.schema,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  };

  const report = verifyH05CircuitBreakerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an agent record hash drifts", () => {
  const loaded = loadConfig();
  const [validAgent] = loaded.agents;
  assert(validAgent);
  const config = {
    ...loaded,
    agents: [
      {
        ...validAgent,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  };

  const report = verifyH05CircuitBreakerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "agent_hash_mismatch"));
});

test("fails when an expected circuit-breaker negative finding is not observed", () => {
  const loaded = loadConfig();
  const [validAgent] = loaded.agents;
  assert(validAgent);
  const config = {
    ...loaded,
    agents: [
      {
        ...validAgent,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["required_circuit_breaker_missing"]
      }
    ]
  };

  const report = verifyH05CircuitBreakerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "agent_status_unexpected"));
  assert(report.findings.some((finding) => finding.kind === "expected_negative_finding_missing"));
});
