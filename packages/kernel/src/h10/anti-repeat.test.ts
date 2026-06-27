import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH10AntiRepeatConfig, type H10AntiRepeatConfig } from "./anti-repeat.js";

const configPath = "fixtures/h10-anti-repeat/valid-config.json";

function loadConfig(): H10AntiRepeatConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H10AntiRepeatConfig;
}

test("verifies passed anti-repeat regression drill", () => {
  const report = verifyH10AntiRepeatConfig(loadConfig());
  const valid = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-regression-drill");

  assert.equal(report.status, "passed");
  assert.equal(valid?.status, "passed");
  assert.equal(valid?.guardType, "verifier_rule");
  assert.equal(valid?.regressionDrillStatus, "passed");
  assert.equal(report.anti_repeat_summary.passed_drill_count, 1);
  assert.equal(report.anti_repeat_summary.guarded_repeat_count, 1);
  assert.equal(report.anti_repeat_summary.blocking_finding_count, 0);
  assert(report.anti_repeat_summary.calibrated_negative_finding_count > 0);
});

test("calibrates anti-repeat negative scenarios", () => {
  const report = verifyH10AntiRepeatConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("repeat-without-guard")?.status, "failed");
  assert.equal(results.get("non-degradation-omitted")?.status, "failed");
  assert.equal(results.get("stale-evidence")?.status, "failed");
  assert.equal(results.get("waiver-without-authority")?.status, "failed");
  assert.equal(results.get("anti-repeat-bypass")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "guard_missing"));
  assert(report.findings.some((finding) => finding.kind === "non_degradation_missing"));
  assert(report.findings.some((finding) => finding.kind === "regression_drill_product_sha_stale"));
  assert(report.findings.some((finding) => finding.kind === "waiver_authority_missing"));
  assert(report.findings.some((finding) => finding.kind === "anti_repeat_bypass_attempted"));
});

test("fails when a record hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH10AntiRepeatConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        recordSha256: "pending-h10-anti-repeat-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "record_hash_invalid"));
});

test("exports H10 anti-repeat APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH10AntiRepeatConfig, "function");
});
