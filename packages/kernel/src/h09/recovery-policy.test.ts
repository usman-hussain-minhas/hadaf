import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH09RecoveryPolicyConfig, type H09RecoveryPolicyConfig } from "./recovery-policy.js";

const configPath = "fixtures/h09-recovery-policy/valid-config.json";

function loadConfig(): H09RecoveryPolicyConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H09RecoveryPolicyConfig;
}

test("verifies bounded H09 recovery policy and budgets", () => {
  const report = verifyH09RecoveryPolicyConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-policy");

  assert.equal(report.status, "passed");
  assert.equal(result?.status, "passed");
  assert.equal(result?.decision, "self_heal_allowed");
  assert.equal(result?.maxSelfHealsPerFfet, 3);
  assert.equal(result?.hardStopClassCount, 6);
  assert(report.cannot_claim.includes("H09_recovery_engine_implemented"));
});

test("calibrates H09 recovery policy negative scenarios", () => {
  const report = verifyH09RecoveryPolicyConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("unbounded-self-heal")?.status, "failed");
  assert.equal(results.get("authority-repair-overclaim")?.status, "failed");
  assert.equal(results.get("security-exposure-self-heal")?.status, "failed");
  assert.equal(results.get("budget-exhaustion-success")?.status, "failed");
  assert.equal(results.get("stable-independent-overclaim")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "budget_exceeds_run_control"));
  assert(report.findings.some((finding) => finding.kind === "authority_repair_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "security_exposure_self_heal_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "budget_exhaustion_success_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "stable_agents_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "independent_audit_overclaim"));
});

test("fails when a policy hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH09RecoveryPolicyConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        policySha256: "pending-h09-policy-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "policy_hash_invalid"));
});

test("fails when an expected H09 finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH09RecoveryPolicyConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["authority_repair_overclaim"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});

test("exports H09 recovery policy APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH09RecoveryPolicyConfig, "function");
});
