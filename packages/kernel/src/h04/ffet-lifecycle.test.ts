import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH04FfetLifecycleConfig,
  type H04FfetLifecycleConfig
} from "./ffet-lifecycle.js";

const configPath = "fixtures/h04-ffet-lifecycle/valid-config.json";

function loadConfig(): H04FfetLifecycleConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H04FfetLifecycleConfig;
}

test("verifies a schema-backed H04 FFET lifecycle fixture pack", () => {
  const report = verifyH04FfetLifecycleConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.ffet_results.length, 7);
  assert.equal(report.final_posture_recommendation, "H04_F02_FFET_LIFECYCLE_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "ffet"));
  assert(report.cannot_claim.includes("dedicated_ffet_question_default_fields_implemented"));
});

test("calibrates negative FFET lifecycle fixtures without failing the suite config", () => {
  const report = verifyH04FfetLifecycleConfig(loadConfig());
  const results = new Map(report.ffet_results.map((result) => [result.ffetId, result]));

  assert.equal(results.get("H04-F02-valid")?.status, "passed");
  assert.equal(results.get("H04-F02-stale-base-sha")?.status, "failed");
  assert.equal(results.get("H04-F02-broad-owned-files")?.status, "failed");
  assert.equal(results.get("H04-F02-forbidden-file-overlap")?.status, "failed");
  assert.equal(results.get("H04-F02-missing-question-default-link")?.status, "failed");
  assert.equal(results.get("H04-F02-merged-without-closeout-learning")?.status, "failed");
  assert.equal(results.get("H04-F02-proof-overclaim")?.status, "failed");

  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "stale_ffet_blocks_execution"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "owned_file_broad_or_glob"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "question_default_link_missing"
    )
  );
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

  const report = verifyH04FfetLifecycleConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const config = {
    ...loadConfig(),
    ffets: [
      {
        ffetId: "H04-F02-valid",
        ref: "fixture://ffets/valid-ffet.json",
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["stale_ffet_blocks_execution"]
      }
    ]
  };

  const report = verifyH04FfetLifecycleConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "ffet_status_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "expected_finding_missing"));
});
