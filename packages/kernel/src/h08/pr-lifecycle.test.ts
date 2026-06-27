import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { verifyH08PrLifecycleConfig, type H08PrLifecycleConfig } from "./pr-lifecycle.js";

const configPath = "fixtures/h08-pr-lifecycle/valid-config.json";

function loadConfig(): H08PrLifecycleConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H08PrLifecycleConfig;
}

test("verifies scoped PR lifecycle and terminal learning records", () => {
  const report = verifyH08PrLifecycleConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.scenario_results.length, 6);
  assert(report.verified_refs.some((ref) => ref.source === "pr_lifecycle_record"));
  assert(report.cannot_claim.includes("github_settings_mutation_authorized"));
  assert(report.cannot_claim.includes("branch_protection_mutation_authorized"));
});

test("calibrates PR lifecycle negative scenarios", () => {
  const report = verifyH08PrLifecycleConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("valid-pr-lifecycle")?.status, "passed");
  assert.equal(results.get("role-mixed-pr")?.status, "failed");
  assert.equal(results.get("unsafe-pr-metadata")?.status, "failed");
  assert.equal(results.get("head-sha-drift")?.status, "failed");
  assert.equal(results.get("merge-sha-missing")?.status, "failed");
  assert.equal(results.get("terminal-learning-missing")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "product_pr_private_plane_file"));
  assert(report.findings.some((finding) => finding.kind === "unsafe_pr_metadata"));
  assert(report.findings.some((finding) => finding.kind === "head_sha_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "merge_sha_missing_or_invalid"));
  assert(report.findings.some((finding) => finding.kind === "terminal_learning_missing"));
});

test("fails when a lifecycle record hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08PrLifecycleConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        recordSha256: "pending-h08-pr-lifecycle-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "record_hash_invalid"));
});

test("fails when an expected lifecycle finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08PrLifecycleConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["unsafe_pr_metadata"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});
