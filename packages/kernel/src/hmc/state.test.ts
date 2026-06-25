import assert from "node:assert/strict";
import test from "node:test";

import { deriveHmcStateConfig, type HmcStateConfig } from "./state.js";

test("derives a valid HMC fixture state with classified stale generated state", () => {
  const report = deriveHmcStateConfig(validConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.classified_mismatches.length, 1);
  assert.equal(report.view.project.name, "HADAF v1");
  assert.equal(report.view.maturitySummary.fixture_backed > 0, true);
  assert.equal(report.final_posture_recommendation, "H02_HMC_STATE_FIXTURE_BACKED");
});

test("fails unclassified Git and GitHub truth mismatches", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    git: {
      expectedMainSha: sha(),
      actualMainSha: sha("a"),
      originMainSha: sha("b")
    },
    github: {
      expectedHeadSha: sha(),
      currentHeadSha: sha("c")
    },
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assert.equal(findings(report, "unclassified_state_mismatch"), 4);
});

test("fails generated state authority overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    generatedState: [
      {
        id: "bad-summary",
        freshness: "fresh",
        claimsAuthority: true,
        maturity: "mocked"
      }
    ],
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "generated_state_claims_authority");
});

test("fails missing required evidence unless classified", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    evidence: [
      {
        id: "required-missing",
        status: "missing",
        maturity: "fixture_backed",
        required: true
      }
    ],
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "unclassified_state_mismatch");
});

test("fails production connected maturity without proof", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    project: {
      id: "hadaf",
      name: "HADAF v1",
      posture: "fixture",
      maturity: "production_connected"
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "production_connected_without_proof");
});

test("fails private paths in state config", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    project: {
      id: "hadaf",
      name: ["", "Users", "example", "private"].join("/"),
      posture: "fixture",
      maturity: "fixture_backed"
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "private_or_forbidden_path_in_state_config");
});

test("exports HMC state APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.deriveHmcStateConfig, "function");
});

function validConfig(): HmcStateConfig {
  return {
    project: {
      id: "hadaf",
      name: "HADAF v1",
      posture: "H02 active",
      maturity: "fixture_backed"
    },
    boxes: [
      {
        id: "H01",
        name: "Source Vault and Target Guard",
        status: "complete",
        maturity: "fixture_backed",
        debt: ["historical_manifest_nested_product_refs"]
      },
      {
        id: "H02",
        name: "Mission Control and Product Preview",
        status: "active",
        maturity: "fixture_backed"
      }
    ],
    ffets: [
      {
        id: "H02-F00",
        title: "Architecture contract",
        status: "merged",
        maturity: "fixture_backed"
      },
      {
        id: "H02-F02",
        title: "Read adapters",
        status: "active",
        maturity: "fixture_backed"
      }
    ],
    quality: [
      {
        id: "hmc_static_smoke",
        status: "passed",
        maturity: "fixture_backed",
        cannotClaim: ["browser_accessibility_complete"]
      }
    ],
    evidence: [
      {
        id: "H02-F01",
        status: "verified",
        maturity: "fixture_backed",
        required: true
      }
    ],
    decisions: [
      {
        id: "h02-next",
        status: "ready",
        maturity: "mocked"
      }
    ],
    git: {
      expectedMainSha: sha(),
      actualMainSha: sha(),
      originMainSha: sha()
    },
    github: {
      expectedHeadSha: sha("head"),
      currentHeadSha: sha("head"),
      openPullRequests: 0
    },
    generatedState: [
      {
        id: "runtime-checkpoint",
        freshness: "stale",
        maturity: "mocked"
      }
    ],
    classifiedMismatches: [
      {
        kind: "generated_state_not_fresh",
        ref: "generated:runtime-checkpoint",
        classification: "stale",
        detail: "Runtime checkpoint freshness remains debt."
      }
    ],
    cannotClaim: [
      "live_github_adapter_implemented",
      "persistent_state_store_implemented"
    ],
    finalPostureRecommendation: "H02_HMC_STATE_FIXTURE_BACKED"
  };
}

function sha(seed = "0"): string {
  return seed.repeat(64).slice(0, 64);
}

function findings(report: ReturnType<typeof deriveHmcStateConfig>, kind: string): number {
  return report.findings.filter((finding) => finding.kind === kind).length;
}

function assertFinding(report: ReturnType<typeof deriveHmcStateConfig>, kind: string): void {
  assert.equal(findings(report, kind) > 0, true);
}
