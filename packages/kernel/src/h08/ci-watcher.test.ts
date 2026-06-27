import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH08CiWatcherConfig, type H08CiWatcherConfig } from "./ci-watcher.js";

const configPath = "fixtures/h08-ci-watcher/valid-config.json";

function loadConfig(): H08CiWatcherConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H08CiWatcherConfig;
}

test("verifies exact-head required CI checks", () => {
  const report = verifyH08CiWatcherConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.scenario_results.length, 7);
  assert(report.verified_refs.some((ref) => ref.source === "ci_status_record"));
  assert(report.cannot_claim.includes("github_settings_mutation_authorized"));
  assert(report.cannot_claim.includes("branch_protection_mutation_authorized"));
});

test("calibrates blocking CI watcher scenarios", () => {
  const report = verifyH08CiWatcherConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("valid-ci-status")?.status, "passed");
  assert.equal(results.get("stale-head-check")?.status, "failed");
  assert.equal(results.get("missing-required-check")?.status, "failed");
  assert.equal(results.get("pending-required-check")?.status, "failed");
  assert.equal(results.get("required-check-failed")?.status, "failed");
  assert.equal(results.get("github-unavailable")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "required_check_stale_head"));
  assert(report.findings.some((finding) => finding.kind === "required_check_missing"));
  assert(report.findings.some((finding) => finding.kind === "required_check_pending"));
  assert(report.findings.some((finding) => finding.kind === "required_check_failed"));
  assert(report.findings.some((finding) => finding.kind === "github_truth_unavailable"));
});

test("classifies optional check failure without blocking exact-head required proof", () => {
  const report = verifyH08CiWatcherConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "optional-check-failed");

  assert.equal(result?.status, "passed");
  assert(result?.classificationKinds.includes("optional_check_failed"));
  assert(report.classifications.some((classification) => classification.kind === "optional_check_failed"));
});

test("fails when a CI status hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08CiWatcherConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        statusSha256: "pending-h08-ci-status-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "status_hash_invalid"));
});

test("fails when expected CI finding or classification is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const missingFindingReport = verifyH08CiWatcherConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["required_check_missing"]
      }
    ]
  });
  const missingClassificationReport = verifyH08CiWatcherConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedClassificationKinds: ["optional_check_failed"]
      }
    ]
  });

  assert.equal(missingFindingReport.status, "failed");
  assert(missingFindingReport.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
  assert.equal(missingClassificationReport.status, "failed");
  assert(
    missingClassificationReport.findings.some((finding) => finding.kind === "expected_scenario_classification_missing")
  );
});
