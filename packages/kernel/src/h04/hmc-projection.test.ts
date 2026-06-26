import assert from "node:assert/strict";
import test from "node:test";

import { deriveH04HmcProjection, type H04HmcProjectionConfig } from "./hmc-projection.js";

test("derives a fixture-backed H04 HMC lifecycle projection", () => {
  const report = deriveH04HmcProjection(validConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.projection.authority, "derived_view_only");
  assert.equal(report.projection.maturity, "fixture_backed");
  assert.equal(report.projection.ffetSummary.total, 6);
  assert.equal(report.projection.ffetSummary.closeoutComplete, 5);
  assert.equal(report.projection.ffetSummary.activeOrPending, 1);
  assert.equal(report.projection.truthLedger.eventCount, 6);
  assert.match(report.projection.lifecycleHash, /^[a-f0-9]{64}$/u);
});

test("rejects authority, live adapter, and persistence overclaims", () => {
  const report = deriveH04HmcProjection({
    ...validConfig(),
    claimAuthority: true,
    claimLiveAdapter: true,
    claimPersistence: true,
    maturity: "persistent"
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h04_hmc_projection_claims_authority");
  assertFinding(report, "h04_hmc_projection_maturity_overclaim");
  assertFinding(report, "live_adapter_overclaim");
  assertFinding(report, "persistence_overclaim");
});

test("rejects closeout overclaims without evidence and learning", () => {
  const report = deriveH04HmcProjection({
    ...validConfig(),
    ffets: [
      {
        id: "H04-F06",
        status: "closeout_complete",
        closeoutComplete: true,
        evidenceManifestVerified: false,
        terminalLearningComplete: false
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "ffet_closeout_missing_evidence_or_learning");
});

test("rejects missing required cannot_claim and malformed hashes", () => {
  const report = deriveH04HmcProjection({
    ...validConfig(),
    productSha: "not-a-sha",
    ledgerEvents: [
      {
        eventId: "bad-event",
        eventType: "ffet_closed",
        ref: "product://fixtures/h04/H04-F00",
        sha256: "pending"
      }
    ],
    cannotClaim: []
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "invalid_product_sha");
  assertFinding(report, "invalid_ledger_event_hash");
  assertFinding(report, "missing_required_cannot_claim");
});

test("exports H04 HMC projection APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.deriveH04HmcProjection, "function");
});

function validConfig(): H04HmcProjectionConfig {
  return {
    projectionId: "H04",
    boxId: "H04",
    productSha: sha40(),
    treeHash: sha40("a"),
    authority: "derived_view_only",
    maturity: "fixture_backed",
    ffets: [
      closeout("H04-F00"),
      closeout("H04-F01"),
      closeout("H04-F02"),
      closeout("H04-F03"),
      closeout("H04-F05"),
      {
        id: "H04-F06",
        status: "active",
        closeoutComplete: false,
        evidenceManifestVerified: false,
        terminalLearningComplete: false
      }
    ],
    ledgerEvents: ["H04-F00", "H04-F01", "H04-F02", "H04-F03", "H04-F05", "H04-F06"].map((id) => ({
      eventId: `${id}-projection`,
      eventType: id === "H04-F06" ? "state_superseded" : "ffet_closed",
      ref: `product://fixtures/h04/${id}`,
      sha256: sha64(id.slice(-1))
    })),
    requiredCannotClaim: [
      "HMC_authoritative_state",
      "live_github_adapter_implemented",
      "persistent_state_store_implemented",
      "h04_assurance_complete",
      "h04_fully_implemented"
    ],
    cannotClaim: [
      "HMC_authoritative_state",
      "live_github_adapter_implemented",
      "persistent_state_store_implemented",
      "h04_assurance_complete",
      "h04_fully_implemented"
    ]
  };
}

function closeout(id: string): H04HmcProjectionConfig["ffets"][number] {
  return {
    id,
    status: "closeout_complete",
    closeoutComplete: true,
    evidenceManifestVerified: true,
    terminalLearningComplete: true
  };
}

function sha40(seed = "0"): string {
  return seed.repeat(40).slice(0, 40);
}

function sha64(seed = "0"): string {
  return seed.repeat(64).slice(0, 64);
}

function findings(report: ReturnType<typeof deriveH04HmcProjection>, kind: string): number {
  return report.findings.filter((finding) => finding.kind === kind).length;
}

function assertFinding(report: ReturnType<typeof deriveH04HmcProjection>, kind: string): void {
  assert.equal(findings(report, kind) > 0, true);
}
