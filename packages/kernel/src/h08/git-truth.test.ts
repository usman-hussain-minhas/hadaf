import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { verifyH08GitTruthConfig, type H08GitTruthConfig } from "./git-truth.js";

const configPath = "fixtures/h08-git-truth/valid-config.json";

function loadConfig(): H08GitTruthConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H08GitTruthConfig;
}

test("verifies read-only Git and GitHub truth snapshots", () => {
  const report = verifyH08GitTruthConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.scenario_results.length, 6);
  assert(report.verified_refs.some((ref) => ref.source === "git_github_truth_snapshot"));
  assert(report.cannot_claim.includes("github_settings_mutation_authorized"));
  assert(report.cannot_claim.includes("branch_protection_mutation_authorized"));
});

test("calibrates H08 Git/GitHub truth negative scenarios", () => {
  const report = verifyH08GitTruthConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("valid-current-truth")?.status, "passed");
  assert.equal(results.get("head-origin-mismatch")?.status, "failed");
  assert.equal(results.get("open-pr-mismatch")?.status, "failed");
  assert.equal(results.get("github-unavailable")?.status, "failed");
  assert.equal(results.get("settings-mutation-claim")?.status, "failed");
  assert.equal(results.get("private-metadata")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "head_origin_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "open_pr_count_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "github_truth_unavailable"));
  assert(report.findings.some((finding) => finding.kind === "github_settings_mutation_claimed"));
  assert(report.findings.some((finding) => finding.kind === "private_metadata_detected"));
});

test("fails when a snapshot hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08GitTruthConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        snapshotSha256: "pending-h08-git-truth-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "snapshot_hash_invalid"));
});

test("fails when an expected scenario finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08GitTruthConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["github_truth_unavailable"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});
