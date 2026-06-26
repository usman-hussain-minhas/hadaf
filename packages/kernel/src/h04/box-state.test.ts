import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH04BoxStateConfig,
  type H04BoxStateConfig
} from "./box-state.js";

const configPath = "fixtures/h04-box-state/valid-config.json";

function loadConfig(): H04BoxStateConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H04BoxStateConfig;
}

test("verifies a schema-backed H04 Box lifecycle fixture pack", () => {
  const report = verifyH04BoxStateConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.box_results.length, 7);
  assert.equal(report.final_posture_recommendation, "H04_F01_BOX_STATE_MACHINE_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "box"));
  assert(report.cannot_claim.includes("h04_ffet_lifecycle_implemented"));
});

test("calibrates negative Box state fixtures without failing the suite config", () => {
  const report = verifyH04BoxStateConfig(loadConfig());
  const results = new Map(report.box_results.map((result) => [result.boxId, result]));

  assert.equal(results.get("H04")?.status, "passed");
  assert.equal(results.get("H04-invalid-transition")?.status, "failed");
  assert.equal(results.get("H04-ready-without-assurance")?.status, "failed");
  assert.equal(results.get("H04-closed-with-blocking-debt")?.status, "failed");
  assert.equal(results.get("H04-dependency-placeholder-hash")?.status, "failed");
  assert.equal(results.get("H04-dependency-conflicting-hash")?.status, "failed");
  assert.equal(results.get("H04-merged-ffets-overclaim")?.status, "failed");

  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "invalid_state_transition"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "readiness_without_assurance_or_truth_ledger"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "readiness_inferred_from_merged_ffets"
    )
  );
});

test("fails when the configured schema hash drifts", () => {
  const config = {
    ...loadConfig(),
    schema: {
      ...loadConfig().schema,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  };

  const report = verifyH04BoxStateConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const config = {
    ...loadConfig(),
    boxes: [
      {
        boxId: "H04",
        ref: "fixture://boxes/valid-box.json",
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["readiness_inferred_from_merged_ffets"]
      }
    ]
  };

  const report = verifyH04BoxStateConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "box_status_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "expected_finding_missing"));
});
