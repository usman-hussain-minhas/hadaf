import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH05AgentRegistryConfig,
  type H05AgentRegistryConfig
} from "./agent-registry.js";

const configPath = "fixtures/h05-agent-registry/valid-config.json";

function loadConfig(): H05AgentRegistryConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H05AgentRegistryConfig;
}

test("verifies a schema-backed H05 Agent Registry fixture pack", () => {
  const report = verifyH05AgentRegistryConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.agent_results.length, 5);
  assert.equal(report.final_posture_recommendation, "H05_F00_AGENT_REGISTRY_STATE_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "schema_ref"));
  assert(report.verified_refs.some((ref) => ref.source === "agent"));
  assert(report.cannot_claim.includes("stable_agents"));
  assert(report.cannot_claim.includes("mechanically_independent_agents"));
});

test("calibrates negative Agent Registry fixtures without failing the suite config", () => {
  const report = verifyH05AgentRegistryConfig(loadConfig());
  const results = new Map(report.agent_results.map((result) => [result.agentId, result]));

  assert.equal(results.get("codex.bootstrap")?.status, "passed");
  assert.equal(results.get("agent.stable-overclaim")?.status, "failed");
  assert.equal(results.get("agent.independent-overclaim")?.status, "failed");
  assert.equal(results.get("agent.missing-cannot-claim")?.status, "failed");
  assert.equal(results.get("agent.invalid-upskill-ref")?.status, "failed");

  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "stable_agent_overclaim"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "mechanical_independence_overclaim"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "cannot_claim_missing_required"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "upskill_ref_sha256_invalid"
    )
  );
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

  const report = verifyH05AgentRegistryConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an agent hash drifts", () => {
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

  const report = verifyH05AgentRegistryConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "agent_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const loaded = loadConfig();
  const [validAgent] = loaded.agents;
  assert(validAgent);
  const config = {
    ...loaded,
    agents: [
      {
        agentId: "codex.bootstrap",
        ref: "fixture://agents/valid-bounded-agent.json",
        sha256: validAgent.sha256,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["stable_agent_overclaim"]
      }
    ]
  };

  const report = verifyH05AgentRegistryConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "agent_status_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "expected_finding_missing"));
});
