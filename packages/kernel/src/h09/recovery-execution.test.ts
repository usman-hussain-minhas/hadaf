import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyH09RecoveryExecutionConfig, type H09RecoveryExecutionConfig } from "./recovery-execution.js";

const configPath = "fixtures/h09-recovery-execution/valid-config.json";

function loadConfig(): H09RecoveryExecutionConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H09RecoveryExecutionConfig;
}

test("verifies evidence-preserving recovery execution records", () => {
  const report = verifyH09RecoveryExecutionConfig(loadConfig());
  const result = report.scenario_results.find((scenario) => scenario.scenarioId === "valid-recovery-execution");

  assert.equal(report.status, "passed");
  assert.equal(result?.status, "passed");
  assert.equal(result?.decision, "execution_record_valid");
  assert.equal(result?.recoveryAction, "quarantine");
  assert.equal(result?.quarantineRequired, true);
  assert.equal(result?.rollbackRequired, true);
});

test("calibrates unsafe H09 recovery execution records", () => {
  const report = verifyH09RecoveryExecutionConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("transient-only-evidence")?.decision, "hard_stop");
  assert.equal(results.get("rollback-missing-target")?.decision, "hard_stop");
  assert.equal(results.get("quarantine-omitted")?.decision, "hard_stop");
  assert.equal(results.get("broad-cleanup")?.decision, "hard_stop");
  assert.equal(results.get("remote-branch-delete-without-closeout")?.decision, "hard_stop");

  assert(report.findings.some((finding) => finding.kind === "transient_only_terminal_evidence"));
  assert(report.findings.some((finding) => finding.kind === "rollback_exact_target_missing_or_invalid"));
  assert(report.findings.some((finding) => finding.kind === "quarantine_not_performed_for_unsafe_state"));
  assert(report.findings.some((finding) => finding.kind === "broad_cleanup_planned"));
  assert(report.findings.some((finding) => finding.kind === "remote_branch_delete_without_closeout"));
});

test("fails when an execution hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH09RecoveryExecutionConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        executionSha256: "pending-recovery-execution-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "execution_hash_invalid"));
});

test("fails when an expected H09 execution finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH09RecoveryExecutionConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["transient_only_terminal_evidence"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});

test("exports H09 recovery execution APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH09RecoveryExecutionConfig, "function");
});
