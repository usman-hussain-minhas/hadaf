import assert from "node:assert/strict";
import test from "node:test";

import { verifyQualityClassificationConfig } from "./quality-classification.js";

test("classifies enforced, locally executed, debt, and not-applicable dimensions", () => {
  const report = verifyQualityClassificationConfig({
    report: buildReport([
      enforcedDimension("formatting", "ci_enforced"),
      enforcedDimension("bundle_verification", "locally_executed"),
      debtDimension("complexity"),
      notApplicableDimension("accessibility")
    ]),
    finalPostureRecommendation: "fixture_posture"
  });

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(classificationFor(report, "formatting"), "ci_enforced");
  assert.equal(classificationFor(report, "bundle_verification"), "executed_locally");
  assert.equal(classificationFor(report, "complexity"), "debt_approved");
  assert.equal(classificationFor(report, "accessibility"), "not_applicable_with_reason");
  assert.equal(report.final_posture_recommendation, "fixture_posture");
});

test("rejects debt without owner, remediation FFET, and cannot_claim", () => {
  const report = verifyQualityClassificationConfig({
    report: buildReport([
      {
        dimensionId: "complexity",
        maturity: "declared_debt",
        status: "debt_approved",
        executable: false,
        reason: "fixture",
        debt: {
          reason: "fixture"
        }
      }
    ])
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "debt_missing_cannot_claim");
  assertFinding(report, "debt_missing_owner");
  assertFinding(report, "debt_missing_remediation_ffet");
  assertFinding(report, "debt_metadata_missing_cannot_claim");
});

test("rejects a non-executable dimension marked passed", () => {
  const report = verifyQualityClassificationConfig({
    report: buildReport([
      {
        dimensionId: "fake_pass",
        maturity: "ci_enforced",
        status: "passed",
        executable: false,
        command: "node fixture"
      }
    ])
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "non_executable_dimension_marked_passed");
});

test("rejects not-applicable dimensions without reason and cannot_claim", () => {
  const report = verifyQualityClassificationConfig({
    report: buildReport([
      {
        dimensionId: "browser_performance",
        maturity: "not_yet_applicable",
        status: "not_applicable_with_reason",
        executable: false
      }
    ])
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "not_applicable_missing_reason");
  assertFinding(report, "not_applicable_missing_cannot_claim");
});

test("rejects dimensions whose status cannot be mechanically classified", () => {
  const report = verifyQualityClassificationConfig({
    report: buildReport([
      {
        dimensionId: "unknown",
        maturity: "declared",
        status: "claimed",
        executable: false
      }
    ])
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "quality_dimension_status_unclassified");
});

function buildReport(dimensions: readonly unknown[]): unknown {
  return {
    schemaVersion: "fixture",
    status: "passed",
    dimensions,
    cannotClaim: ["fixture_claim"]
  };
}

function enforcedDimension(
  dimensionId: string,
  maturity: "ci_enforced" | "locally_executed"
): unknown {
  return {
    dimensionId,
    maturity,
    status: "passed",
    executable: true,
    command: "node fixture"
  };
}

function debtDimension(dimensionId: string): unknown {
  return {
    dimensionId,
    maturity: "declared_debt",
    status: "debt_approved",
    executable: false,
    reason: "fixture",
    debt: {
      owner: "quality.compiler@0.1",
      reason: "fixture",
      remediationFfet: "fixture_ffet",
      cannotClaim: [`${dimensionId}_claim`]
    },
    cannotClaim: [`${dimensionId}_claim`]
  };
}

function notApplicableDimension(dimensionId: string): unknown {
  return {
    dimensionId,
    maturity: "not_yet_applicable",
    status: "not_applicable_with_reason",
    executable: false,
    reason: "fixture",
    cannotClaim: [`${dimensionId}_claim`]
  };
}

function classificationFor(
  report: ReturnType<typeof verifyQualityClassificationConfig>,
  dimensionId: string
): string | undefined {
  return report.classified_dimensions.find((dimension) => dimension.dimensionId === dimensionId)
    ?.classification;
}

function assertFinding(
  report: ReturnType<typeof verifyQualityClassificationConfig>,
  kind: string
): void {
  assert.equal(
    report.findings.some((finding) => finding.kind === kind),
    true
  );
}
