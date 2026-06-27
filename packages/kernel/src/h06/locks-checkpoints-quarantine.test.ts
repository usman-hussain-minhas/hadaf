import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH06LocksCheckpointsQuarantineConfig,
  type H06LocksCheckpointsQuarantineConfig
} from "./locks-checkpoints-quarantine.js";

const configPath = "fixtures/h06-locks-checkpoints-quarantine/valid-config.json";

function loadConfig(): H06LocksCheckpointsQuarantineConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H06LocksCheckpointsQuarantineConfig;
}

test("verifies H06 lock, checkpoint, and quarantine records", () => {
  const report = verifyH06LocksCheckpointsQuarantineConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.lock_results.length, 5);
  assert.equal(report.checkpoint_results.length, 4);
  assert.equal(report.quarantine_results.length, 5);
  assert.equal(report.final_posture_recommendation, "H06_F02_LOCKS_CHECKPOINTS_QUARANTINE_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "runtime_record"));
  assert(report.cannot_claim.includes("production_resource_orchestration"));
});

test("calibrates lock, checkpoint, and quarantine negative fixtures", () => {
  const report = verifyH06LocksCheckpointsQuarantineConfig(loadConfig());
  const lockResults = new Map(report.lock_results.map((result) => [result.recordId, result]));
  const checkpointResults = new Map(report.checkpoint_results.map((result) => [result.recordId, result]));
  const quarantineResults = new Map(report.quarantine_results.map((result) => [result.recordId, result]));

  assert.equal(lockResults.get("lock-H06-F02-active")?.status, "passed");
  assert.equal(lockResults.get("lock-H06-F02-released")?.status, "passed");
  assert.equal(lockResults.get("lock-H06-F02-stale-active")?.status, "failed");
  assert.equal(lockResults.get("lock-H06-F02-conflict")?.status, "failed");
  assert.equal(lockResults.get("lock-H06-F02-missing-cannot-claim")?.status, "failed");

  assert.equal(checkpointResults.get("checkpoint-H06-F02-fresh")?.status, "passed");
  assert.equal(checkpointResults.get("checkpoint-H06-F02-stale-sha")?.status, "failed");
  assert.equal(checkpointResults.get("checkpoint-H06-F02-stale-freshness")?.status, "failed");
  assert.equal(checkpointResults.get("checkpoint-H06-F02-placeholder")?.status, "failed");

  assert.equal(quarantineResults.get("quarantine-H06-F02-contained")?.status, "passed");
  assert.equal(quarantineResults.get("quarantine-H06-F02-human-required")?.status, "passed");
  assert.equal(quarantineResults.get("quarantine-H06-F02-secret-cleanup")?.status, "failed");
  assert.equal(quarantineResults.get("quarantine-H06-F02-absolute-path")?.status, "failed");
  assert.equal(quarantineResults.get("quarantine-H06-F02-missing-evidence")?.status, "failed");

  for (const kind of [
    "stale_active_lock",
    "write_set_collision_detected",
    "required_cannot_claim_missing",
    "checkpoint_product_sha_stale",
    "checkpoint_freshness_not_fresh",
    "checkpoint_placeholder_state_hash",
    "secret_exposure_cleanup_allowed_without_human_decision",
    "absolute_affected_path",
    "quarantine_evidence_hash_invalid_placeholder"
  ]) {
    assert(report.classified_mismatches.some((finding) => finding.kind === kind), kind);
  }
});

test("fails when the configured lock schema hash is a placeholder", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schemas: {
      ...loaded.schemas,
      lock: {
        ...loaded.schemas.lock,
        sha256: "pending-runtime-lock-schema-hash"
      }
    }
  };

  const report = verifyH06LocksCheckpointsQuarantineConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_invalid_placeholder"));
});

test("fails when a runtime record hash drifts", () => {
  const loaded = loadConfig();
  const [validLock] = loaded.locks;
  assert(validLock);
  const config = {
    ...loaded,
    locks: [
      {
        ...validLock,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ],
    checkpoints: [],
    quarantines: []
  };

  const report = verifyH06LocksCheckpointsQuarantineConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "lock_record_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const loaded = loadConfig();
  const [validLock] = loaded.locks;
  assert(validLock);
  const config = {
    ...loaded,
    locks: [
      {
        ...validLock,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["stale_active_lock"]
      }
    ],
    checkpoints: [],
    quarantines: []
  };

  const report = verifyH06LocksCheckpointsQuarantineConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "lock_record_status_unexpected"));
  assert(report.findings.some((finding) => finding.kind === "expected_negative_finding_missing"));
});
