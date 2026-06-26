import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  generateH04RecordFromRequest,
  verifyH04RecordGeneratorConfig,
  type H04RecordGeneratorConfig,
  type H04RecordGeneratorRequest
} from "./record-generator.js";

const configPath = "fixtures/h04-record-generator/valid-config.json";

function loadConfig(): H04RecordGeneratorConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H04RecordGeneratorConfig;
}

test("verifies a schema-backed H04 record-generator fixture pack", () => {
  const report = verifyH04RecordGeneratorConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.request_results.length, 7);
  assert.equal(report.final_posture_recommendation, "H04_F04_RECORD_GENERATOR_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "request"));
  assert(report.generated_records.some((record) => record.claim_eligibility === "eligible"));
  assert(report.cannot_claim.includes("h04_finalize_box_implemented"));
});

test("calibrates negative generator fixtures without failing the suite config", () => {
  const report = verifyH04RecordGeneratorConfig(loadConfig());
  const results = new Map(report.request_results.map((result) => [result.requestId, result]));

  assert.equal(results.get("H04-F04-valid-generator-request")?.status, "passed");
  assert.equal(results.get("H04-F04-transient-only-output")?.status, "failed");
  assert.equal(results.get("H04-F04-private-path-output")?.status, "failed");
  assert.equal(results.get("H04-F04-missing-required-field")?.status, "failed");
  assert.equal(results.get("H04-F04-placeholder-output-hash")?.status, "failed");
  assert.equal(results.get("H04-F04-output-hash-mismatch")?.status, "failed");
  assert.equal(results.get("H04-F04-claim-overeligible")?.status, "failed");

  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "output_ref_transient_only"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "private_path_in_request"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "required_fields_missing"
    )
  );
});

test("generates deterministic record output from a valid request", () => {
  const request = JSON.parse(
    readFileSync("fixtures/h04-record-generator/inputs/valid-generator-request.json", "utf8")
  ) as H04RecordGeneratorRequest;

  const generated = generateH04RecordFromRequest(request);

  assert.equal(generated.schema_version, "1.0.0");
  assert.equal(generated.generator_id, "H04-F04-record-generator");
  assert.equal(generated.claim_eligibility, "eligible");
  assert.deepEqual(generated.missing_fields, []);
  assert.equal(generated.placeholder_scan, "passed");
});

test("fails when the configured schema hash drifts", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schema: {
      ...loaded.schema,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  };

  const report = verifyH04RecordGeneratorConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const config = {
    ...loadConfig(),
    requests: [
      {
        requestId: "H04-F04-valid-generator-request",
        ref: "fixture://inputs/valid-generator-request.json",
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["output_ref_transient_only"]
      }
    ]
  };

  const report = verifyH04RecordGeneratorConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "request_status_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "expected_finding_missing"));
});
