import assert from "node:assert/strict";
import test from "node:test";

import { verifyProductPreviewConfig, type ProductPreviewConfig } from "./maturity.js";

test("verifies a fixture-backed local Product Preview foundation", () => {
  const report = verifyProductPreviewConfig(validConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.view.preview.maturity, "fixture_backed");
  assert.equal(report.view.blockedClaims.includes("production_connected_preview"), true);
  assert.equal(report.final_posture_recommendation, "H02_PRODUCT_PREVIEW_FIXTURE_BACKED");
});

test("rejects production-connected preview without proof", () => {
  const report = verifyProductPreviewConfig({
    ...validConfig(),
    preview: {
      ...validConfig().preview,
      maturity: "production_connected"
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "production_connected_without_proof");
});

test("rejects public deployment without authorization", () => {
  const report = verifyProductPreviewConfig({
    ...validConfig(),
    preview: {
      ...validConfig().preview,
      publicationStatus: "public_deployed"
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "public_deployment_without_authorization");
});

test("rejects missing required cannot_claim entries", () => {
  const report = verifyProductPreviewConfig({
    ...validConfig(),
    cannotClaim: ["browser_accessibility_complete"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "missing_required_cannot_claim");
});

test("rejects forbidden preview posture claims", () => {
  const report = verifyProductPreviewConfig({
    ...validConfig(),
    claims: ["production_ready", "production_connected_preview", "public_preview_deployed"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "forbidden_preview_claim");
  assertFinding(report, "production_connected_claim_without_proof");
  assertFinding(report, "public_preview_claim_without_authorization");
});

test("rejects private paths in preview config", () => {
  const report = verifyProductPreviewConfig({
    ...validConfig(),
    preview: {
      ...validConfig().preview,
      name: ["", "Users", "example", "preview"].join("/")
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "private_or_forbidden_path_in_preview_config");
});

test("exports Product Preview maturity APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyProductPreviewConfig, "function");
});

function validConfig(): ProductPreviewConfig {
  return {
    preview: {
      id: "hadaf-product-preview",
      name: "HADAF Product Preview",
      route: "/preview",
      maturity: "fixture_backed",
      publicationStatus: "local_only",
      targetBox: "H02",
      targetFfet: "H02-F03"
    },
    stateSources: [
      {
        id: "preview-shell",
        label: "Static preview shell",
        status: "fixture",
        maturity: "fixture_backed"
      },
      {
        id: "product-runtime",
        label: "Product runtime adapter",
        status: "mocked",
        maturity: "mocked"
      }
    ],
    claims: [],
    cannotClaim: [
      "production_connected_preview",
      "public_preview_deployed",
      "persistent_preview_state",
      "browser_accessibility_complete",
      "browser_performance_complete"
    ],
    finalPostureRecommendation: "H02_PRODUCT_PREVIEW_FIXTURE_BACKED"
  };
}

function assertFinding(report: ReturnType<typeof verifyProductPreviewConfig>, kind: string): void {
  assert.equal(report.findings.some((finding) => finding.kind === kind), true);
}
