import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH09SelfHealPlannerConfig, type H09SelfHealPlannerConfig } from "./self-heal-planner.js";

const configPath = "fixtures/h09-self-heal-planner/valid-config.json";

function loadConfig(): H09SelfHealPlannerConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H09SelfHealPlannerConfig;
}

test("plans bounded deterministic H09 self-heal work", () => {
  const report = verifyH09SelfHealPlannerConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-formatting-correction");

  assert.equal(report.status, "passed");
  assert.equal(result?.status, "passed");
  assert.equal(result?.decision, "plan_ready");
  assert.deepEqual(result?.plannedActions, ["correction_pr", "validation_rerun"]);
  assert(report.cannot_claim.includes("free_autonomous_fixing"));
});

test("refuses hard-stop and systemic self-heal scenarios", () => {
  const report = verifyH09SelfHealPlannerConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("schema-authority-gap")?.decision, "hard_stop");
  assert.equal(results.get("secret-exposure")?.decision, "hard_stop");
  assert.equal(results.get("licence-conflict")?.decision, "hard_stop");
  assert.equal(results.get("scope-expansion")?.decision, "hard_stop");
  assert.equal(results.get("repeated-same-class")?.decision, "hard_stop");

  assert(report.findings.some((finding) => finding.kind === "hard_stop_requires_human_decision"));
  assert(report.findings.some((finding) => finding.kind === "security_repair_without_human_decision"));
  assert(report.findings.some((finding) => finding.kind === "license_repair_without_human_decision"));
  assert(report.findings.some((finding) => finding.kind === "scope_expansion_without_human_decision"));
  assert(report.findings.some((finding) => finding.kind === "repeated_same_class_systemic_blocker"));
});

test("fails when a request hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH09SelfHealPlannerConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        requestSha256: "pending-self-heal-request-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "request_hash_invalid"));
});

test("fails when an expected H09 planner finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH09SelfHealPlannerConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["hard_stop_requires_human_decision"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});

test("exports H09 self-heal planner APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH09SelfHealPlannerConfig, "function");
});
