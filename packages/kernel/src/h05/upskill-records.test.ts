import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH05UpskillRecordsConfig,
  type H05UpskillRecordsConfig
} from "./upskill-records.js";

const configPath = "fixtures/h05-upskill-records/valid-config.json";

function loadConfig(): H05UpskillRecordsConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H05UpskillRecordsConfig;
}

test("verifies H05 upskill and decision-learning record fixtures", () => {
  const report = verifyH05UpskillRecordsConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.record_results.length, 10);
  assert.equal(report.final_posture_recommendation, "H05_F03_UPSKILL_DECISION_LEARNING_RECORDS_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "schema_ref"));
  assert(report.verified_refs.some((ref) => ref.source === "record"));
  assert(report.verified_refs.some((ref) => ref.source === "linked_ref"));
  assert(report.cannot_claim.includes("runtime_upskill_enforcement"));
});

test("calibrates upskill and decision-learning negative fixtures", () => {
  const report = verifyH05UpskillRecordsConfig(loadConfig());
  const results = new Map(report.record_results.map((result) => [result.recordId, result]));

  assert.equal(results.get("upskill.coding-guard")?.status, "passed");
  assert.equal(results.get("upskill.decision-guard")?.status, "passed");
  assert.equal(results.get("upskill.no-change-justified")?.status, "passed");
  assert.equal(results.get("upskill.lesson-without-effect")?.status, "failed");
  assert.equal(results.get("upskill.decision-missing-alternatives")?.status, "failed");
  assert.equal(results.get("upskill.decision-missing-stop")?.status, "failed");
  assert.equal(results.get("upskill.silent-authority-change")?.status, "failed");
  assert.equal(results.get("upskill.stable-overclaim")?.status, "failed");
  assert.equal(results.get("upskill.bad-hash")?.status, "failed");
  assert.equal(results.get("upskill.stale-sha")?.status, "failed");

  for (const kind of [
    "lesson_without_durable_effect",
    "decision_upskill_missing_rejected_alternatives",
    "decision_upskill_missing_future_stop_or_ask_condition",
    "silent_authority_change_forbidden",
    "stable_agent_overclaim",
    "triggering_event_ref_sha256_invalid",
    "triggering_event_ref_stale_sha256"
  ]) {
    assert(report.classified_mismatches.some((finding) => finding.kind === kind), kind);
  }
});

test("fails when the configured upskill schema hash drifts", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schema: {
      ...loaded.schema,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  };

  const report = verifyH05UpskillRecordsConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an upskill record hash drifts", () => {
  const loaded = loadConfig();
  const [validRecord] = loaded.records;
  assert(validRecord);
  const config = {
    ...loaded,
    records: [
      {
        ...validRecord,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  };

  const report = verifyH05UpskillRecordsConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "upskill_record_hash_mismatch"));
});

test("fails when an expected negative upskill finding is not observed", () => {
  const loaded = loadConfig();
  const [validRecord] = loaded.records;
  assert(validRecord);
  const config = {
    ...loaded,
    records: [
      {
        ...validRecord,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["stable_agent_overclaim"]
      }
    ]
  };

  const report = verifyH05UpskillRecordsConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "upskill_record_status_unexpected"));
  assert(report.findings.some((finding) => finding.kind === "expected_negative_finding_missing"));
});
