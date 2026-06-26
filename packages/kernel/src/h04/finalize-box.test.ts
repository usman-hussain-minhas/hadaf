import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH04FinalizeBoxConfig,
  type H04FinalizeBoxConfig
} from "./finalize-box.js";

const configPath = "fixtures/h04-finalize-box/valid-config.json";

function loadConfig(): H04FinalizeBoxConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H04FinalizeBoxConfig;
}

test("verifies a schema-backed H04 finalize-box fixture pack", () => {
  const report = verifyH04FinalizeBoxConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.box_results.length, 6);
  assert.equal(report.final_posture_recommendation, "H04_F05_FINALIZE_BOX_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "schema_ref"));
  assert(report.verified_refs.some((ref) => ref.source === "box"));
  assert(report.cannot_claim.includes("h04_hmc_projection_implemented"));
});

test("calibrates negative finalizer fixtures without failing the suite config", () => {
  const report = verifyH04FinalizeBoxConfig(loadConfig());
  const results = new Map(report.box_results.map((result) => [result.ref, result]));

  assert.equal(results.get("fixture://boxes/valid-finalization.json")?.status, "passed");
  assert.equal(results.get("fixture://boxes/open-ffet.json")?.status, "failed");
  assert.equal(results.get("fixture://boxes/missing-evidence.json")?.status, "failed");
  assert.equal(results.get("fixture://boxes/successor-blocking-debt.json")?.status, "failed");
  assert.equal(results.get("fixture://boxes/missing-cannot-claim.json")?.status, "failed");
  assert.equal(results.get("fixture://boxes/stale-product-sha.json")?.status, "failed");

  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "required_ffet_check_missing"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "successor_blocking_debt"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "cannot_claim_missing_required"
    )
  );
  assert(
    report.classified_mismatches.some((finding) => finding.kind === "stale_product_sha")
  );
});

test("fails when the finalizer schema hash drifts", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schema: {
      ...loaded.schema,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  };

  const report = verifyH04FinalizeBoxConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const config = {
    ...loadConfig(),
    boxes: [
      {
        boxId: "H04",
        ref: "fixture://boxes/valid-finalization.json",
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["successor_blocking_debt"]
      }
    ]
  };

  const report = verifyH04FinalizeBoxConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "box_status_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "expected_finding_missing"));
});
