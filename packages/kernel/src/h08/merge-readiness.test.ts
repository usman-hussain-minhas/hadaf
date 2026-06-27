import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH08MergeReadinessConfig, type H08MergeReadinessConfig } from "./merge-readiness.js";

const configPath = "fixtures/h08-merge-readiness/valid-config.json";

function loadConfig(): H08MergeReadinessConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H08MergeReadinessConfig;
}

test("approves a dry-run merge-ready PR when all gates pass", () => {
  const report = verifyH08MergeReadinessConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "merge-ready");

  assert.equal(report.status, "passed");
  assert.equal(result?.status, "passed");
  assert.equal(result?.decision, "approved_for_merge");
  assert(report.cannot_claim.includes("github_settings_mutation_authorized"));
  assert(report.cannot_claim.includes("branch_protection_mutation_authorized"));
});

test("blocks unsafe merge-readiness scenarios", () => {
  const report = verifyH08MergeReadinessConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("exact-head-drift")?.status, "failed");
  assert.equal(results.get("failed-required-check")?.status, "failed");
  assert.equal(results.get("unsafe-metadata")?.status, "failed");
  assert.equal(results.get("missing-evidence-manifest")?.status, "failed");
  assert.equal(results.get("missing-closeout-plan")?.status, "failed");
  assert.equal(results.get("human-branch-protection-blocker")?.status, "failed");
  assert.equal(results.get("human-branch-protection-blocker")?.decision, "human_action_required");

  assert(report.findings.some((finding) => finding.kind === "exact_head_drift"));
  assert(report.findings.some((finding) => finding.kind === "required_check_failed"));
  assert(report.findings.some((finding) => finding.kind === "unsafe_pr_metadata"));
  assert(report.findings.some((finding) => finding.kind === "evidence_manifest_not_fresh"));
  assert(report.findings.some((finding) => finding.kind === "closeout_plan_missing"));
  assert(report.findings.some((finding) => finding.kind === "human_branch_protection_blocker"));
});

test("fails when a merge-readiness hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08MergeReadinessConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        readinessSha256: "pending-h08-merge-readiness-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "readiness_hash_invalid"));
});

test("fails when an expected merge-readiness finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08MergeReadinessConfig({
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
