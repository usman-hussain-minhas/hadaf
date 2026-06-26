import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH04TruthLedgerConfig,
  type H04TruthLedgerConfig
} from "./truth-ledger.js";

const configPath = "fixtures/h04-truth-ledger/valid-config.json";

function loadConfig(): H04TruthLedgerConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H04TruthLedgerConfig;
}

test("verifies a schema-backed H04 Truth Ledger fixture pack", () => {
  const report = verifyH04TruthLedgerConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.ledger_results.length, 8);
  assert.equal(report.final_posture_recommendation, "H04_F00_TRUTH_LEDGER_CORE_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "ledger"));
  assert(report.verified_refs.some((ref) => ref.source === "event_source"));
  assert(report.cannot_claim.includes("truth_ledger_authoritative_over_git_or_github"));
});

test("calibrates negative ledger fixtures without failing the suite config", () => {
  const report = verifyH04TruthLedgerConfig(loadConfig());
  const results = new Map(report.ledger_results.map((result) => [result.ledgerId, result]));

  assert.equal(results.get("valid-ledger")?.status, "passed");
  assert.equal(results.get("fixture-authority-overclaim")?.status, "failed");
  assert.equal(results.get("git-sha-length-invalid")?.status, "failed");
  assert.equal(results.get("placeholder-hash")?.status, "failed");
  assert.equal(results.get("duplicate-event-conflict")?.status, "failed");
  assert.equal(results.get("stale-event-order")?.status, "failed");
  assert.equal(results.get("closeout-without-learning")?.status, "failed");
  assert.equal(results.get("supersession-conflict")?.status, "failed");

  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "truth_source_authority_overclaim"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) => finding.kind === "terminal_closeout_missing_learning"
    )
  );
});

test("classifies stale non-fresh product and tree hashes without failing valid ledgers", () => {
  const report = verifyH04TruthLedgerConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert(
    report.classified_mismatches.some(
      (finding) =>
        finding.kind === "product_sha_stale" &&
        finding.eventId === "evt-H04-stale-current-state-classified"
    )
  );
  assert(
    report.classified_mismatches.some(
      (finding) =>
        finding.kind === "tree_hash_stale" &&
        finding.eventId === "evt-H04-stale-current-state-classified"
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

  const report = verifyH04TruthLedgerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_mismatch"));
});

test("fails when an expected negative finding is not observed", () => {
  const config = {
    ...loadConfig(),
    ledgers: [
      {
        ledgerId: "valid-ledger",
        ref: "fixture://ledger/valid-ledger.json",
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["truth_source_authority_overclaim"]
      }
    ]
  };

  const report = verifyH04TruthLedgerConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "ledger_status_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "expected_finding_missing"));
});
