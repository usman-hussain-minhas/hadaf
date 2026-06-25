import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const report = runQualityGates();
console.log(JSON.stringify(report, null, process.argv.includes("--json") ? 2 : 0));

if (report.status !== "passed") {
  process.exit(1);
}

function runQualityGates() {
  const dimensions = [];

  dimensions.push(commandDimension("package_metadata", "ci_enforced", "node scripts/check-package-metadata.mjs"));
  dimensions.push(commandDimension("license_file_absence", "ci_enforced", "node scripts/check-no-license-file.mjs"));
  dimensions.push(commandDimension("formatting", "ci_enforced", "node scripts/check-format.mjs"));
  dimensions.push(commandDimension("diff_hygiene", "ci_enforced", "node scripts/check-diff-hygiene.mjs"));
  dimensions.push(commandDimension("lint_static_syntax", "ci_enforced", "node --check scripts/check-ci-workflow.mjs && node --check scripts/check-coverage.mjs && node --check scripts/check-dependency-licenses.mjs && node --check scripts/check-diff-hygiene.mjs && node --check scripts/check-format.mjs && node --check scripts/check-no-license-file.mjs && node --check scripts/check-package-metadata.mjs && node --check scripts/check-pr-metadata-public-safety.mjs && node --check scripts/check-public-safety.mjs && node --check scripts/generate-supply-chain-artifacts.mjs && node --check scripts/reconcile-status.mjs && node --check scripts/run-quality-gates.mjs && node --check scripts/verify-evidence-manifest.mjs"));
  dimensions.push(commandDimension("secret_and_residue_scan", "ci_enforced", "node scripts/check-public-safety.mjs && node scripts/check-public-safety.mjs --self-test"));
  dimensions.push(commandDimension("pr_metadata_public_safety", "ci_enforced", "node scripts/check-pr-metadata-public-safety.mjs --self-test"));
  dimensions.push(commandDimension("ci_workflow_safety", "ci_enforced", "node scripts/check-ci-workflow.mjs"));
  dimensions.push(commandDimension("dependency_license_scan", "ci_enforced", "node scripts/check-dependency-licenses.mjs && node scripts/check-dependency-licenses.mjs --self-test"));
  dimensions.push(commandDimension("supply_chain_artifact_drift", "ci_enforced", "node scripts/generate-supply-chain-artifacts.mjs --check"));
  dimensions.push(commandDimension("coverage_typecheck_unit_tests", "ci_enforced", "node scripts/check-coverage.mjs && node scripts/check-coverage.mjs --self-test", {
    cannotClaim: ["branch_coverage_enforced"]
  }));
  dimensions.push(commandDimension("quality_report_integrity", "ci_enforced", "node scripts/run-quality-gates.mjs --self-test"));
  dimensions.push(bundleDimension());
  dimensions.push(...classifiedDebtDimensions());

  const validation = validateQualityReport(dimensions);
  return {
    schemaVersion: "hadaf_bootstrap_quality_gate_report_v1",
    createdAt: new Date().toISOString(),
    status: validation.findings.length === 0 && dimensions.every((dimension) => dimension.status !== "failed") ? "passed" : "failed",
    dimensions,
    cannotClaim: Array.from(new Set(dimensions.flatMap((dimension) => dimension.cannotClaim ?? []))).sort(),
    validation
  };
}

function commandDimension(dimensionId, maturity, command, extra = {}) {
  const result = spawnSync(command, [], {
    cwd: rootDir,
    encoding: "utf8",
    shell: true
  });
  const passed = result.status === 0;
  return {
    dimensionId,
    maturity,
    status: passed ? "passed" : "failed",
    executable: true,
    command,
    stdout: compact(result.stdout),
    stderr: compact(result.stderr),
    ...extra
  };
}

function bundleDimension() {
  const bundleVerifier = findBundleVerifier();
  if (!bundleVerifier) {
    return {
      dimensionId: "bundle_verification",
      maturity: "locally_executed_when_bundle_available",
      status: "not_applicable_with_reason",
      executable: false,
      reason: "Canonical planning bundle is intentionally outside Product Git and is not present in this checkout.",
      cannotClaim: ["bundle_verification_ci_enforced_in_public_product_repo"]
    };
  }

  const result = spawnSync("node", [bundleVerifier], {
    cwd: dirname(dirname(bundleVerifier)),
    encoding: "utf8"
  });
  return {
    dimensionId: "bundle_verification",
    maturity: "locally_executed",
    status: result.status === 0 ? "passed" : "failed",
    executable: true,
    command: "node input/planning_bundle/tools/verify_bundle.mjs",
    stdout: compact(result.stdout),
    stderr: compact(result.stderr)
  };
}

function classifiedDebtDimensions() {
  return [
    {
      dimensionId: "sast",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "CodeQL or equivalent SAST workflow belongs to H00-SEC-001 shared-integration scope.",
      cannotClaim: ["sast_ci_enforced"]
    },
    {
      dimensionId: "accessibility",
      maturity: "not_yet_applicable",
      status: "not_applicable_with_reason",
      executable: false,
      reason: "No HMC/Product Preview frontend exists in H00.",
      cannotClaim: ["browser_accessibility_complete"]
    },
    {
      dimensionId: "browser_performance",
      maturity: "not_yet_applicable",
      status: "not_applicable_with_reason",
      executable: false,
      reason: "No browser frontend route exists in H00.",
      cannotClaim: ["browser_performance_complete"]
    },
    {
      dimensionId: "complexity",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "No complexity tool is available without adding dependencies; enforce in a later maintainability gate.",
      cannotClaim: ["complexity_gate_enforced"]
    },
    {
      dimensionId: "duplication",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "No duplication analyzer is available without adding dependencies; enforce in a later maintainability gate.",
      cannotClaim: ["duplication_gate_enforced"]
    },
    {
      dimensionId: "mutation_fault_sampling",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "Mutation/fault sampling tooling is not installed in H00.",
      cannotClaim: ["mutation_testing_complete"]
    },
    {
      dimensionId: "rollback",
      maturity: "not_yet_applicable",
      status: "not_applicable_with_reason",
      executable: false,
      reason: "No stateful runtime or deployment exists in H00.",
      cannotClaim: ["semantic_rollback_proven"]
    },
    {
      dimensionId: "observability",
      maturity: "not_yet_applicable",
      status: "not_applicable_with_reason",
      executable: false,
      reason: "No service runtime exists in H00.",
      cannotClaim: ["production_observability_complete"]
    }
  ];
}

function validateQualityReport(dimensions) {
  const findings = [];
  const allowedStatuses = new Set(["passed", "failed", "debt_approved", "not_applicable_with_reason"]);

  for (const dimension of dimensions) {
    if (!allowedStatuses.has(dimension.status)) {
      findings.push({ dimensionId: dimension.dimensionId, kind: "invalid_status", status: dimension.status });
    }
    if (dimension.status === "passed" && dimension.executable !== true) {
      findings.push({ dimensionId: dimension.dimensionId, kind: "non_executable_dimension_marked_passed" });
    }
    if (dimension.status === "not_applicable_with_reason" && !dimension.reason) {
      findings.push({ dimensionId: dimension.dimensionId, kind: "not_applicable_missing_reason" });
    }
    if (dimension.status === "debt_approved" && (!dimension.reason || !Array.isArray(dimension.cannotClaim) || dimension.cannotClaim.length === 0)) {
      findings.push({ dimensionId: dimension.dimensionId, kind: "debt_missing_reason_or_cannot_claim" });
    }
  }

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings
  };
}

function findBundleVerifier() {
  let cursor = rootDir;
  while (cursor !== dirname(cursor)) {
    const candidate = join(cursor, "input/planning_bundle/tools/verify_bundle.mjs");
    if (existsSync(join(cursor, "START_HERE.md")) && existsSync(candidate)) return candidate;
    cursor = dirname(cursor);
  }
  return null;
}

function compact(value) {
  const trimmed = value.trim();
  return trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}...<truncated>` : trimmed;
}

function runSelfTest() {
  const dimensions = [
    {
      dimensionId: "false_pass",
      status: "passed",
      executable: false
    },
    {
      dimensionId: "missing_reason",
      status: "not_applicable_with_reason",
      executable: false
    },
    {
      dimensionId: "valid_debt",
      status: "debt_approved",
      executable: false,
      reason: "fixture",
      cannotClaim: ["fixture_claim"]
    }
  ];
  const validation = validateQualityReport(dimensions);
  const kinds = new Set(validation.findings.map((finding) => finding.kind));
  const failures = [];
  if (!kinds.has("non_executable_dimension_marked_passed")) failures.push("passed_unimplemented_dimension_not_rejected");
  if (!kinds.has("not_applicable_missing_reason")) failures.push("not_applicable_without_reason_not_rejected");

  if (failures.length > 0) {
    console.error(JSON.stringify({ status: "failed", check: "quality_runner_self_test", failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "passed", check: "quality_runner_self_test", negativeFixtures: 2 }));
}
