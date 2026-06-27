import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH10UpskillProposalConfig, type H10UpskillProposalConfig } from "./upskill-proposals.js";

const configPath = "fixtures/h10-upskill-proposals/valid-config.json";

function loadConfig(): H10UpskillProposalConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H10UpskillProposalConfig;
}

test("verifies bounded H10 upskill proposal records", () => {
  const report = verifyH10UpskillProposalConfig(loadConfig());
  const decision = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-decision-upskill");
  const bounded = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-bounded-promotion");

  assert.equal(report.status, "passed");
  assert.equal(decision?.status, "passed");
  assert.equal(decision?.upskillType, "decision");
  assert.equal(decision?.durableEffectType, "fixture");
  assert.equal(bounded?.requestedStatus, "qualified_for_bounded_use");
  assert.equal(report.upskill_summary.proposal_count, 2);
  assert.equal(report.upskill_summary.decision_upskill_count, 1);
  assert.equal(report.upskill_summary.bounded_promotion_count, 2);
  assert.equal(report.upskill_summary.blocking_finding_count, 0);
  assert(report.upskill_summary.calibrated_negative_finding_count > 0);
});

test("calibrates H10 upskill proposal negative scenarios", () => {
  const report = verifyH10UpskillProposalConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("lesson-without-effect")?.status, "failed");
  assert.equal(results.get("silent-authority-change")?.status, "failed");
  assert.equal(results.get("stable-promotion")?.status, "failed");
  assert.equal(results.get("independent-qualification-overclaim")?.status, "failed");
  assert.equal(results.get("missing-non-degradation")?.status, "failed");
  assert.equal(results.get("model-weight-update-overclaim")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "durable_effect_missing"));
  assert(report.findings.some((finding) => finding.kind === "silent_authority_change"));
  assert(report.findings.some((finding) => finding.kind === "forbidden_promotion_status"));
  assert(report.findings.some((finding) => finding.kind === "independent_quality_auditor_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "non_degradation_missing"));
  assert(report.findings.some((finding) => finding.kind === "model_weight_update_overclaim"));
});

test("fails when a record hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH10UpskillProposalConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        recordSha256: "pending-h10-upskill-hash"
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
  const report = verifyH10UpskillProposalConfig({
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

test("exports H10 upskill proposal APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH10UpskillProposalConfig, "function");
});
