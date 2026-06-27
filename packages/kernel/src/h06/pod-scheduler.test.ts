import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { verifyH06PodSchedulerConfig, type H06PodSchedulerConfig } from "./pod-scheduler.js";

const configPath = "fixtures/h06-pod-scheduler/valid-config.json";

function loadConfig(): H06PodSchedulerConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H06PodSchedulerConfig;
}

test("verifies H06 pod scheduler and serial fallback records", () => {
  const report = verifyH06PodSchedulerConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.pod_results.length, 10);
  assert.equal(report.final_posture_recommendation, "H06_F03_POD_SCHEDULER_SERIAL_FALLBACK_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "pod_record"));
  assert(report.cannot_claim.includes("live_parallel_pod_execution"));
});

test("calibrates pod scheduler negative fixtures", () => {
  const report = verifyH06PodSchedulerConfig(loadConfig());
  const podResults = new Map(report.pod_results.map((result) => [result.recordId, result]));

  assert.equal(podResults.get("pod-H06-F03-admitted")?.status, "passed");
  assert.equal(podResults.get("pod-H06-F03-serial-fallback")?.status, "passed");
  assert.equal(podResults.get("pod-H06-F03-collision-blocked")?.status, "passed");
  assert.equal(podResults.get("pod-H06-F03-collision-without-fallback")?.status, "failed");
  assert.equal(podResults.get("pod-H06-F03-write-set-overlap")?.status, "failed");
  assert.equal(podResults.get("pod-H06-F03-unclosed-dependency")?.status, "failed");
  assert.equal(podResults.get("pod-H06-F03-missing-cannot-claim")?.status, "failed");
  assert.equal(podResults.get("pod-H06-F03-runtime-ref-placeholder")?.status, "failed");
  assert.equal(podResults.get("pod-H06-F03-h08-overclaim")?.status, "failed");
  assert.equal(podResults.get("pod-H06-F03-mechanical-independence-overclaim")?.status, "failed");

  for (const kind of [
    "collision_detected_without_block_or_serial_fallback",
    "write_set_overlap_without_collision",
    "pod_admitted_with_blocked_dependency",
    "required_cannot_claim_missing",
    "runtime_ref_hash_invalid_placeholder",
    "future_box_capability_overclaim",
    "agent_independence_or_stability_overclaim"
  ]) {
    assert(report.classified_mismatches.some((finding) => finding.kind === kind), kind);
  }
});

test("fails when the configured pod schema hash is a placeholder", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schemas: {
      ...loaded.schemas,
      pod: {
        ...loaded.schemas.pod,
        sha256: "pending-pod-scheduler-schema-hash"
      }
    }
  };

  const report = verifyH06PodSchedulerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_invalid_placeholder"));
});

test("fails when a pod record hash drifts", () => {
  const loaded = loadConfig();
  const [validPod] = loaded.pods;
  assert(validPod);
  const config = {
    ...loaded,
    pods: [
      {
        ...validPod,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  };

  const report = verifyH06PodSchedulerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "pod_record_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const loaded = loadConfig();
  const [validPod] = loaded.pods;
  assert(validPod);
  const config = {
    ...loaded,
    pods: [
      {
        ...validPod,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["collision_detected_without_block_or_serial_fallback"]
      }
    ]
  };

  const report = verifyH06PodSchedulerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "pod_record_status_unexpected"));
  assert(report.findings.some((finding) => finding.kind === "expected_negative_finding_missing"));
});
