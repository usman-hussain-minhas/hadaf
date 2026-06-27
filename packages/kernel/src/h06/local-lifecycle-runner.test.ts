import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH06LocalLifecycleRunnerConfig,
  type H06LocalLifecycleRunnerConfig
} from "./local-lifecycle-runner.js";

const configPath = "fixtures/h06-local-lifecycle-runner/valid-config.json";

function loadConfig(): H06LocalLifecycleRunnerConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H06LocalLifecycleRunnerConfig;
}

test("verifies H06 local lifecycle runner fixture pack", () => {
  const report = verifyH06LocalLifecycleRunnerConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.run_results.length, 6);
  assert.equal(report.final_posture_recommendation, "H06_F04_LOCAL_LIFECYCLE_RUNNER_FOUNDATION_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "runner_scenario"));
  assert(report.verified_refs.some((ref) => ref.source === "truth_ledger"));
  assert(report.cannot_claim.includes("live_lifecycle_runner_execution"));
});

test("calibrates local lifecycle runner negative fixtures", () => {
  const report = verifyH06LocalLifecycleRunnerConfig(loadConfig());
  const runResults = new Map(report.run_results.map((result) => [result.runId, result]));

  assert.equal(runResults.get("run-H06-F04-valid")?.status, "passed");
  assert.equal(runResults.get("run-H06-F04-missing-emitted-record")?.status, "failed");
  assert.equal(runResults.get("run-H06-F04-stale-restart-reconcile")?.status, "failed");
  assert.equal(runResults.get("run-H06-F04-live-provider-overclaim")?.status, "failed");
  assert.equal(runResults.get("run-H06-F04-production-activation-overclaim")?.status, "failed");
  assert.equal(runResults.get("run-H06-F04-transient-output-only")?.status, "failed");

  for (const kind of [
    "missing_emitted_record_kind",
    "durable_output_ref_missing_for_record",
    "stale_restart_reconcile_state",
    "live_provider_call_overclaim",
    "production_activation_overclaim",
    "transient_only_output_not_terminal_evidence"
  ]) {
    assert(report.classified_mismatches.some((finding) => finding.kind === kind), kind);
  }
});

test("fails when the runner scenario hash drifts", () => {
  const loaded = loadConfig();
  const [validRun] = loaded.runs;
  assert(validRun);
  const config = {
    ...loaded,
    runs: [
      {
        ...validRun,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  };

  const report = verifyH06LocalLifecycleRunnerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "runner_scenario_hash_mismatch"));
});

test("fails when a required cannot_claim is missing from a positive scenario", () => {
  const loaded = loadConfig();
  const [validRun] = loaded.runs;
  assert(validRun);
  const config = {
    ...loaded,
    requiredCannotClaim: ["nonexistent_claim_for_test"],
    runs: [validRun]
  };

  const report = verifyH06LocalLifecycleRunnerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "required_cannot_claim_missing"));
});

test("fails when an expected negative finding is not observed", () => {
  const loaded = loadConfig();
  const [validRun] = loaded.runs;
  assert(validRun);
  const config = {
    ...loaded,
    runs: [
      {
        ...validRun,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["stale_restart_reconcile_state"]
      }
    ]
  };

  const report = verifyH06LocalLifecycleRunnerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "runner_scenario_status_unexpected"));
  assert(report.findings.some((finding) => finding.kind === "expected_negative_finding_missing"));
});
