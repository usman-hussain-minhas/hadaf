import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH05CapabilityContractConfig,
  type H05CapabilityContractConfig
} from "./capability-contracts.js";

const configPath = "fixtures/h05-capability-contracts/valid-config.json";

function loadConfig(): H05CapabilityContractConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H05CapabilityContractConfig;
}

test("verifies schema-bound H05 agent cards against capability expectations", () => {
  const report = verifyH05CapabilityContractConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.card_results.length, 5);
  assert.equal(report.final_posture_recommendation, "H05_F01_AGENT_CARDS_CAPABILITY_CONTRACTS_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "schema_ref"));
  assert(report.verified_refs.some((ref) => ref.source === "card"));
  assert(report.cannot_claim.includes("stable_agents"));
});

test("calibrates negative capability-contract fixtures without failing the suite config", () => {
  const report = verifyH05CapabilityContractConfig(loadConfig());
  const results = new Map(report.card_results.map((result) => [result.agentId, result]));

  assert.equal(results.get("agent.capability-valid")?.status, "passed");
  assert.equal(results.get("agent.unsupported-tool")?.status, "failed");
  assert.equal(results.get("agent.write-overclaim")?.status, "failed");
  assert.equal(results.get("agent.private-prompt")?.status, "failed");
  assert.equal(results.get("agent.capability-missing-cannot-claim")?.status, "failed");

  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "unsupported_tool_capability"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "write_permission_overclaim"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "private_prompt_or_instruction_exposure"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "cannot_claim_missing_required"
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

  const report = verifyH05CapabilityContractConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when a card hash drifts", () => {
  const loaded = loadConfig();
  const [validCard] = loaded.cards;
  assert(validCard);
  const config = {
    ...loaded,
    cards: [
      {
        ...validCard,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  };

  const report = verifyH05CapabilityContractConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "card_hash_mismatch"));
});

test("fails when an expected capability negative finding is not observed", () => {
  const loaded = loadConfig();
  const [validCard] = loaded.cards;
  assert(validCard);
  const config = {
    ...loaded,
    cards: [
      {
        ...validCard,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["unsupported_tool_capability"]
      }
    ]
  };

  const report = verifyH05CapabilityContractConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "card_status_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "expected_finding_missing"));
});
