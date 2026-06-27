import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH08ConductorConfig, type H08ConductorConfig } from "./conductor.js";

const configPath = "fixtures/h08-conductor/valid-config.json";

function loadConfig(): H08ConductorConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H08ConductorConfig;
}

test("allows a bounded dry-run conductor envelope with all prerequisites", () => {
  const report = verifyH08ConductorConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "dry-run-ready");

  assert.equal(report.status, "passed");
  assert.equal(result?.status, "passed");
  assert.equal(result?.decision, "dry_run_allowed");
  assert(report.cannot_claim.includes("github_settings_mutation_authorized"));
  assert(report.cannot_claim.includes("branch_protection_mutation_authorized"));
});

test("blocks unsafe conductor envelopes", () => {
  const report = verifyH08ConductorConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("missing-h08-gate")?.status, "failed");
  assert.equal(results.get("settings-mutation")?.status, "failed");
  assert.equal(results.get("force-push")?.status, "failed");
  assert.equal(results.get("wrong-repository")?.status, "failed");
  assert.equal(results.get("remote-cleanup-without-closeout")?.status, "failed");
  assert.equal(results.get("human-branch-protection")?.decision, "human_action_required");

  assert(report.findings.some((finding) => finding.kind === "h08_gate_not_satisfied"));
  assert(report.findings.some((finding) => finding.kind === "settings_mutation_blocked"));
  assert(report.findings.some((finding) => finding.kind === "force_push_blocked"));
  assert(report.findings.some((finding) => finding.kind === "wrong_repository"));
  assert(report.findings.some((finding) => finding.kind === "remote_branch_cleanup_not_allowed"));
  assert(report.findings.some((finding) => finding.kind === "human_branch_protection_blocker"));
});

test("fails when an envelope hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08ConductorConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        envelopeSha256: "pending-h08-conductor-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "envelope_hash_invalid"));
});

test("fails when an expected conductor finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08ConductorConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["settings_mutation_blocked"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});
