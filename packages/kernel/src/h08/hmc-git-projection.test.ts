import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH08HmcGitProjectionConfig, type H08HmcGitProjectionConfig } from "./hmc-git-projection.js";

const configPath = "fixtures/h08-git-projection/valid-config.json";

function loadConfig(): H08HmcGitProjectionConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H08HmcGitProjectionConfig;
}

test("projects fixture-backed H08 Git/CI/PR conductor state without authority claims", () => {
  const report = verifyH08HmcGitProjectionConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-projection");

  assert.equal(report.status, "passed");
  assert.equal(result?.status, "passed");
  assert.equal(result?.activeFfet, "H08-F06");
  assert.equal(result?.verifiedComponentCount, 5);
  assert(report.verified_refs.some((ref) => ref.source === "h08_hmc_git_projection"));
  assert(report.cannot_claim.includes("H08_git_ci_pr_merge_conductor_implemented"));
  assert(report.cannot_claim.includes("github_settings_mutation_authorized"));
  assert(report.cannot_claim.includes("branch_protection_mutation_authorized"));
});

test("calibrates H08 projection overclaim and stale-state failures", () => {
  const report = verifyH08HmcGitProjectionConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("authority-overclaim")?.status, "failed");
  assert.equal(results.get("settings-mutation-overclaim")?.status, "failed");
  assert.equal(results.get("live-persistent-overclaim")?.status, "failed");
  assert.equal(results.get("stale-unclassified")?.status, "failed");
  assert.equal(results.get("h13-overclaim")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "h08_projection_claims_authority"));
  assert(report.findings.some((finding) => finding.kind === "h08_settings_mutation_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "h08_branch_protection_mutation_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "h08_live_adapter_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "h08_persistence_overclaim"));
  assert(report.findings.some((finding) => finding.kind === "h08_projection_not_fresh"));
  assert(report.findings.some((finding) => finding.kind === "h08_h13_system_assurance_overclaim"));
});

test("fails when a projection hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08HmcGitProjectionConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        projectionSha256: "pending-h08-projection-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "projection_hash_invalid"));
});

test("fails when an expected H08 projection finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH08HmcGitProjectionConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["h08_settings_mutation_overclaim"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});

test("exports H08 HMC Git projection APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH08HmcGitProjectionConfig, "function");
});
