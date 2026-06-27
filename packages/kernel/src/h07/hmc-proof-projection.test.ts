import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  deriveH07HmcProofProjection,
  type H07HmcProofProjectionConfig
} from "./hmc-proof-projection.js";

const configPath = "fixtures/h07-proof-projection/valid-config.json";

function loadConfig(): H07HmcProofProjectionConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H07HmcProofProjectionConfig;
}

test("derives a fixture-backed H07 proof projection", () => {
  const report = deriveH07HmcProofProjection(loadConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.projection.authority, "derived_view_only");
  assert.equal(report.projection.proofSummary.verified, 5);
  assert.equal(report.projection.proofSummary.nonOperational, 2);
  assert.equal(report.projection.prerequisiteSummary.closeoutComplete, 4);
  assert(report.cannot_claim.includes("HMC_authoritative_state"));
});

test("rejects H07 HMC authority and maturity overclaims", () => {
  const report = deriveH07HmcProofProjection({
    ...loadConfig(),
    claimAuthority: true,
    maturity: "persistent"
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h07_proof_projection_claims_authority");
  assertFinding(report, "h07_proof_projection_maturity_overclaim");
});

test("rejects P8 and P9 operational proof overclaims", () => {
  const config = loadConfig();
  const report = deriveH07HmcProofProjection({
    ...config,
    claimP8Operational: true,
    claimP9Operational: true,
    proofLevels: config.proofLevels.map((proof) =>
      proof.level === "P8" || proof.level === "P9" ? { ...proof, status: "operational" } : proof
    )
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h07_future_proof_level_operational_overclaim");
  assertFinding(report, "h07_p8_operational_overclaim");
  assertFinding(report, "h07_p9_operational_overclaim");
});

test("rejects missing cannot_claim boundaries", () => {
  const report = deriveH07HmcProofProjection({
    ...loadConfig(),
    cannotClaim: ["release_candidate"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "missing_required_cannot_claim");
  assertFinding(report, "blocked_claim_missing_cannot_claim");
});

test("rejects stale proof freshness and missing negative proof", () => {
  const config = loadConfig();
  const report = deriveH07HmcProofProjection({
    ...config,
    freshness: "stale",
    proofLevels: [
      {
        ...config.proofLevels[0]!,
        evidenceStatus: "stale",
        negativeProofStatus: "missing",
        freshness: "stale"
      },
      ...config.proofLevels.slice(1)
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h07_proof_projection_not_fresh");
  assertFinding(report, "h07_required_proof_evidence_not_verified");
  assertFinding(report, "h07_required_negative_proof_not_verified");
  assertFinding(report, "h07_proof_level_not_fresh");
});

test("rejects incomplete prerequisite closeouts", () => {
  const config = loadConfig();
  const report = deriveH07HmcProofProjection({
    ...config,
    prerequisiteCloseouts: [
      {
        ...config.prerequisiteCloseouts[0]!,
        evidenceStatus: "missing"
      },
      ...config.prerequisiteCloseouts.slice(1)
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h07_prerequisite_not_closeout_complete");
});

test("exports H07 proof projection APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.deriveH07HmcProofProjection, "function");
});

function findings(report: ReturnType<typeof deriveH07HmcProofProjection>, kind: string): number {
  return report.findings.filter((finding) => finding.kind === kind).length;
}

function assertFinding(report: ReturnType<typeof deriveH07HmcProofProjection>, kind: string): void {
  assert.equal(findings(report, kind) > 0, true);
}
