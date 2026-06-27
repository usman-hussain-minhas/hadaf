import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH09AntiTheatreConfig, type H09AntiTheatreConfig } from "./anti-theatre.js";

const configPath = "fixtures/h09-anti-theatre/valid-config.json";

function loadConfig(): H09AntiTheatreConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H09AntiTheatreConfig;
}

test("allows self-heal credit only with changed evidence and validation", () => {
  const report = verifyH09AntiTheatreConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-changed-evidence");

  assert.equal(report.status, "passed");
  assert.equal(result?.status, "passed");
  assert.equal(result?.decision, "self_heal_credit_allowed");
  assert.equal(result?.changedEvidence, true);
  assert.equal(result?.validationRerun, true);
  assert.equal(result?.nonDegradationPassed, true);
});

test("rejects self-heal theatre and exhausted-budget continuation", () => {
  const report = verifyH09AntiTheatreConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("no-op-self-heal")?.decision, "hard_stop");
  assert.equal(results.get("budget-exhausted-continuation")?.decision, "hard_stop");
  assert.equal(results.get("validation-omitted")?.decision, "hard_stop");
  assert.equal(results.get("same-class-ignored")?.decision, "hard_stop");

  assert(report.findings.some((finding) => finding.kind === "self_heal_no_changed_evidence"));
  assert(report.findings.some((finding) => finding.kind === "continue_after_self_heal_budget_exhausted_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "validation_not_rerun_after_recovery"));
  assert(report.findings.some((finding) => finding.kind === "repeated_same_class_systemic_blocker"));
});

test("fails when an attempt hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH09AntiTheatreConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        attemptSha256: "pending-anti-theatre-attempt-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "attempt_hash_invalid"));
});

test("fails when an expected anti-theatre finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH09AntiTheatreConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["self_heal_no_changed_evidence"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});

test("exports H09 anti-theatre APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH09AntiTheatreConfig, "function");
});
