import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { verifyH09HmcRecoveryProjectionConfig, type H09HmcRecoveryProjectionConfig } from "./hmc-recovery-projection.js";

test("verifies H09 HMC recovery projection fixture scenarios", () => {
  const report = verifyH09HmcRecoveryProjectionConfig(readConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.verified_refs.some((ref) => ref.ref === "fixture://records/valid-projection.json"), true);
  assert.equal(report.scenario_results.some((result) => result.scenarioId === "valid-projection" && result.status === "passed"), true);
  assert.equal(
    report.scenario_results.some(
      (result) =>
        result.scenarioId === "authority-overclaim" &&
        result.status === "failed" &&
        result.findingKinds.includes("h09_projection_claims_authority")
    ),
    true
  );
  assert.equal(
    report.scenario_results.some(
      (result) =>
        result.scenarioId === "live-recovery-overclaim" &&
        result.status === "failed" &&
        result.findingKinds.includes("h09_live_autonomous_recovery_overclaim") &&
        result.findingKinds.includes("h09_production_rollback_overclaim")
    ),
    true
  );
  assert.equal(
    report.scenario_results.some(
      (result) =>
        result.scenarioId === "future-box-overclaim" &&
        result.status === "failed" &&
        result.findingKinds.includes("h09_h10_learning_engine_overclaim") &&
        result.findingKinds.includes("h09_h12_box_assurance_overclaim") &&
        result.findingKinds.includes("h09_h13_system_assurance_overclaim")
    ),
    true
  );
  assert.equal(
    report.scenario_results.some(
      (result) =>
        result.scenarioId === "exhausted-unclassified" &&
        result.status === "failed" &&
        result.findingKinds.includes("h09_exhausted_budget_unclassified") &&
        result.selfHealBudgetExhausted
    ),
    true
  );
  assert.equal(report.cannot_claim.includes("H09_recovery_engine_implemented"), true);
  assert.equal(report.final_posture_recommendation, "H09_RECOVERY_PROJECTION_ACTIVE_FIXTURE_BACKED");
});

test("exports H09 HMC recovery projection APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH09HmcRecoveryProjectionConfig, "function");
});

function readConfig(): H09HmcRecoveryProjectionConfig {
  return JSON.parse(readFileSync("fixtures/h09-recovery-projection/valid-config.json", "utf8")) as H09HmcRecoveryProjectionConfig;
}
