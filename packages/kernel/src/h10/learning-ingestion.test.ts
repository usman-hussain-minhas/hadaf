import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH10LearningIngestionConfig, type H10LearningIngestionConfig } from "./learning-ingestion.js";

const configPath = "fixtures/h10-learning-ingestion/valid-config.json";

function loadConfig(): H10LearningIngestionConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H10LearningIngestionConfig;
}

test("verifies valid terminal learning records", () => {
  const report = verifyH10LearningIngestionConfig(loadConfig());
  const prResult = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-pr-learning");
  const ffetResult = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-ffet-learning");
  const transactionResult = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-transaction-learning");

  assert.equal(report.status, "passed");
  assert.equal(prResult?.status, "passed");
  assert.equal(prResult?.eventType, "product_pr");
  assert.equal(prResult?.durableEffectType, "fixture");
  assert.equal(ffetResult?.status, "passed");
  assert.equal(transactionResult?.status, "passed");
  assert.equal(report.learning_summary.learning_record_count, 3);
  assert.equal(report.learning_summary.transaction_learning_count, 1);
  assert.equal(report.learning_summary.blocking_finding_count, 0);
  assert(report.learning_summary.calibrated_negative_finding_count > 0);
  assert(report.cannot_claim.includes("stable_agents"));
});

test("calibrates terminal learning negative scenarios", () => {
  const report = verifyH10LearningIngestionConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("missing-closeout")?.status, "failed");
  assert.equal(results.get("missing-evidence-hash")?.status, "failed");
  assert.equal(results.get("stale-product-sha")?.status, "failed");
  assert.equal(results.get("lesson-without-durable-effect")?.status, "failed");
  assert.equal(results.get("generated-status-authority")?.status, "failed");
  assert.equal(results.get("private-metadata-residue")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "closeout_missing"));
  assert(report.findings.some((finding) => finding.kind === "evidence_hash_invalid"));
  assert(report.findings.some((finding) => finding.kind === "source_event_product_sha_stale"));
  assert(report.findings.some((finding) => finding.kind === "durable_effect_missing"));
  assert(report.findings.some((finding) => finding.kind === "generated_status_authority_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "private_metadata_detected"));
});

test("fails when a record hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH10LearningIngestionConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        recordSha256: "pending-h10-learning-hash"
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
  const report = verifyH10LearningIngestionConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["generated_status_authority_overclaim"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});

test("exports H10 learning ingestion APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH10LearningIngestionConfig, "function");
});
