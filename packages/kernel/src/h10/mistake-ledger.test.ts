import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH10MistakeLedgerConfig, type H10MistakeLedgerConfig } from "./mistake-ledger.js";

const configPath = "fixtures/h10-mistake-ledger/valid-config.json";

function loadConfig(): H10MistakeLedgerConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H10MistakeLedgerConfig;
}

test("verifies valid H10 mistake ledger record", () => {
  const report = verifyH10MistakeLedgerConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-decision-mistake");

  assert.equal(report.status, "passed");
  assert.equal(result?.status, "passed");
  assert.equal(result?.mistakeType, "decision");
  assert.equal(result?.severity, "medium");
  assert.equal(result?.evidenceRefCount, 2);
  assert.equal(result?.regressionGuardType, "fixture");
  assert.equal(report.ledger_summary.blocking_finding_count, 0);
  assert(report.ledger_summary.calibrated_negative_finding_count > 0);
  assert(report.cannot_claim.includes("stable_agents"));
});

test("calibrates H10 mistake ledger negative scenarios", () => {
  const report = verifyH10MistakeLedgerConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("missing-source-event")?.status, "failed");
  assert.equal(results.get("missing-regression-guard")?.status, "failed");
  assert.equal(results.get("stable-overclaim")?.status, "failed");
  assert.equal(results.get("repeated-unclassified")?.status, "failed");
  assert.equal(results.get("private-path-residue")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "source_event_missing"));
  assert(report.findings.some((finding) => finding.kind === "regression_guard_type_missing"));
  assert(report.findings.some((finding) => finding.kind === "stable_agents_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "repeated_mistake_unclassified"));
  assert(report.findings.some((finding) => finding.kind === "private_metadata_detected"));
});

test("fails when a record hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH10MistakeLedgerConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        recordSha256: "pending-h10-mistake-ledger-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "record_hash_invalid"));
});

test("requires expected findings to be present", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH10MistakeLedgerConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["stable_agents_overclaim"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});

test("exports H10 mistake ledger APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH10MistakeLedgerConfig, "function");
});
