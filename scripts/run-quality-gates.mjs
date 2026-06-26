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
  dimensions.push(commandDimension("lint_static_syntax", "ci_enforced", "node --check scripts/lib/cli-args.mjs && node --check scripts/check-cli-arg-normalization.mjs && node --check scripts/check-ci-workflow.mjs && node --check scripts/check-coverage.mjs && node --check scripts/check-dependency-licenses.mjs && node --check scripts/check-diff-hygiene.mjs && node --check scripts/check-format.mjs && node --check scripts/check-no-license-file.mjs && node --check scripts/check-package-metadata.mjs && node --check scripts/check-pr-metadata-public-safety.mjs && node --check scripts/check-public-safety.mjs && node --check scripts/check-target-guard.mjs && node --check scripts/serve-hmc.mjs && node --check scripts/serve-product-preview.mjs && node --check scripts/verify-hmc-state.mjs && node --check scripts/verify-product-preview.mjs && node --check scripts/verify-static-ui.mjs && node --check scripts/generate-supply-chain-artifacts.mjs && node --check scripts/reconcile-status.mjs && node --check scripts/run-quality-gates.mjs && node --check scripts/verify-evidence-manifest.mjs && node --check scripts/verify-quality-classification.mjs && node --check scripts/verify-source-manifest.mjs && node --check scripts/classify-source-authority.mjs && node --check scripts/verify-h03-schema-registry.mjs && node --check scripts/verify-h03-input-authority.mjs && node --check scripts/verify-h03-plan-normalization.mjs && node --check scripts/verify-h03-question-register.mjs && node --check scripts/verify-h03-delivery-constitution.mjs && node --check scripts/verify-h03-constitution-readiness.mjs && node --check scripts/verify-h03-ratification-readiness.mjs && node --check scripts/verify-h05-agent-registry.mjs && node --check scripts/verify-h05-capability-contracts.mjs"));
  dimensions.push(commandDimension("secret_and_residue_scan", "ci_enforced", "node scripts/check-public-safety.mjs && node scripts/check-public-safety.mjs --self-test"));
  dimensions.push(commandDimension("target_guard", "ci_enforced", "pnpm build && node scripts/check-target-guard.mjs && node scripts/check-target-guard.mjs --self-test && node scripts/check-target-guard.mjs fixtures/target-guard/valid-config.json"));
  dimensions.push(commandDimension("cli_argument_normalization", "ci_enforced", "pnpm check:cli-args"));
  dimensions.push(commandDimension("h03_schema_registry_boundary", "ci_enforced", "pnpm build && node scripts/verify-h03-schema-registry.mjs fixtures/h03-schema-registry/valid-config.json", {
    cannotClaim: [
      "constitution_approval_record_workflow_implemented",
      "execution_authorization_boundary_implemented",
      "h03_delivery_constitution_ready_for_human_ratification",
      "h03_implemented"
    ]
  }));
  dimensions.push(commandDimension("h03_input_authority_boundary", "ci_enforced", "pnpm build && node scripts/verify-h03-input-authority.mjs fixtures/h03-input-authority/valid-config.json", {
    cannotClaim: [
      "constitution_approval_record_workflow_implemented",
      "execution_authorization_boundary_implemented",
      "h03_delivery_constitution_ready_for_human_ratification",
      "h03_implemented"
    ]
  }));
  dimensions.push(commandDimension("h03_plan_normalization_boundary", "ci_enforced", "pnpm build && node scripts/verify-h03-plan-normalization.mjs fixtures/h03-plan-normalization/valid-config.json", {
    cannotClaim: [
      "constitution_approval_record_workflow_implemented",
      "execution_authorization_boundary_implemented",
      "h03_delivery_constitution_ready_for_human_ratification",
      "h03_implemented"
    ]
  }));
  dimensions.push(commandDimension("h03_question_register_boundary", "ci_enforced", "pnpm build && node scripts/verify-h03-question-register.mjs fixtures/h03-question-register/valid-config.json", {
    cannotClaim: [
      "constitution_approval_record_workflow_implemented",
      "execution_authorization_boundary_implemented",
      "h03_delivery_constitution_ready_for_human_ratification",
      "h03_implemented"
    ]
  }));
  dimensions.push(commandDimension("h03_delivery_constitution_boundary", "ci_enforced", "pnpm build && node scripts/verify-h03-delivery-constitution.mjs fixtures/h03-delivery-constitution/valid-config.json", {
    cannotClaim: [
      "constitution_approval_record_workflow_implemented",
      "execution_authorization_boundary_implemented",
      "h03_delivery_constitution_ready_for_human_ratification",
      "h03_implemented"
    ]
  }));
  dimensions.push(commandDimension("h03_constitution_readiness_boundary", "ci_enforced", "pnpm build && node scripts/verify-h03-constitution-readiness.mjs fixtures/h03-constitution-readiness/valid-config.json", {
    cannotClaim: [
      "constitution_approved_by_human",
      "execution_authorization_granted",
      "h03_delivery_constitution_ready_for_human_ratification",
      "h03_implemented"
    ]
  }));
  dimensions.push(commandDimension("h03_ratification_guard_calibration", "ci_enforced", "pnpm build && node scripts/verify-h03-constitution-readiness.mjs fixtures/h03-constitution-readiness/ratification-guard-calibration-config.json", {
    cannotClaim: [
      "real_h03_delivery_constitution_ratifiable",
      "h03_ratification_ready",
      "constitution_approved_by_human",
      "execution_authorization_granted"
    ]
  }));
  dimensions.push(commandDimension("h05_agent_registry_state", "ci_enforced", "pnpm build && node scripts/verify-h05-agent-registry.mjs fixtures/h05-agent-registry/valid-config.json", {
    cannotClaim: [
      "stable_agents",
      "mechanically_independent_agents",
      "independent_quality_auditor_qualified",
      "h05_agent_cards_implemented",
      "h05_circuit_breakers_implemented",
      "h05_upskill_records_implemented"
    ]
  }));
  dimensions.push(commandDimension("h05_agent_capability_contracts", "ci_enforced", "pnpm build && node scripts/verify-h05-capability-contracts.mjs fixtures/h05-capability-contracts/valid-config.json", {
    cannotClaim: [
      "stable_agents",
      "mechanically_independent_agents",
      "independent_quality_auditor_qualified",
      "h05_circuit_breakers_implemented",
      "h05_upskill_records_implemented",
      "h05_hmc_agent_projection_implemented"
    ]
  }));
  dimensions.push(commandDimension("hmc_static_smoke", "ci_enforced", "node scripts/serve-hmc.mjs --smoke", {
    cannotClaim: [
      "live_github_adapter_implemented",
      "live_h03_control_adapter_implemented",
      "persistent_state_store_implemented",
      "HMC_authoritative_state",
      "constitution_approved_by_human",
      "execution_authorization_granted",
      "browser_accessibility_complete",
      "browser_performance_complete"
    ]
  }));
  dimensions.push(commandDimension("hmc_state_adapter", "ci_enforced", "pnpm build && node scripts/verify-hmc-state.mjs fixtures/hmc-state/valid-config.json", {
    cannotClaim: [
      "live_github_adapter_implemented",
      "live_h03_control_adapter_implemented",
      "persistent_state_store_implemented",
      "HMC_authoritative_state",
      "constitution_approved_by_human",
      "execution_authorization_granted"
    ]
  }));
  dimensions.push(commandDimension("product_preview_static_smoke", "ci_enforced", "node scripts/serve-product-preview.mjs --smoke", {
    cannotClaim: [
      "production_connected_preview",
      "public_preview_deployed",
      "persistent_preview_state",
      "browser_accessibility_complete",
      "browser_performance_complete"
    ]
  }));
  dimensions.push(commandDimension("product_preview_maturity", "ci_enforced", "pnpm build && node scripts/verify-product-preview.mjs fixtures/product-preview/valid-config.json", {
    cannotClaim: [
      "production_connected_preview",
      "public_preview_deployed",
      "persistent_preview_state"
    ]
  }));
  dimensions.push(commandDimension("local_static_accessibility_smoke", "ci_enforced", "node scripts/verify-static-ui.mjs && node scripts/verify-static-ui.mjs --self-test", {
    cannotClaim: [
      "browser_accessibility_complete",
      "browser_performance_complete",
      "screen_reader_complete",
      "keyboard_traversal_complete"
    ]
  }));
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
      debt: {
        owner: "quality.compiler@0.1",
        reason: "The local quality runner does not yet ingest GitHub CodeQL status as a first-class SAST gate.",
        remediationFfet: "future_quality_gate_engine_github_status_ingestion",
        cannotClaim: ["sast_ci_enforced"]
      },
      cannotClaim: ["sast_ci_enforced"]
    },
    {
      dimensionId: "accessibility",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "Local static accessibility smoke is enforced, but no browser, keyboard traversal, or assistive-technology automation is available in H02.",
      debt: {
        owner: "hmc.frontend",
        reason: "Static HTML structure, landmarks, labels, cannot_claim visibility, and asset budget are checked; browser-complete accessibility requires later tooling.",
        remediationFfet: "future_browser_accessibility_gate",
        cannotClaim: ["browser_accessibility_complete"]
      },
      cannotClaim: ["browser_accessibility_complete"]
    },
    {
      dimensionId: "browser_performance",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "Static asset budget is enforced, but no browser runtime performance tooling is available in H02.",
      debt: {
        owner: "hmc.frontend",
        reason: "Static byte budget is checked; browser Core Web Vitals or equivalent runtime performance proof requires later tooling.",
        remediationFfet: "future_browser_performance_gate",
        cannotClaim: ["browser_performance_complete"]
      },
      cannotClaim: ["browser_performance_complete"]
    },
    {
      dimensionId: "complexity",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "No complexity tool is available without adding dependencies; enforce in a later maintainability gate.",
      debt: {
        owner: "quality.compiler@0.1",
        reason: "No complexity analyzer is installed in H00.",
        remediationFfet: "future_maintainability_gate_engine_expansion",
        cannotClaim: ["complexity_gate_enforced"]
      },
      cannotClaim: ["complexity_gate_enforced"]
    },
    {
      dimensionId: "duplication",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "No duplication analyzer is available without adding dependencies; enforce in a later maintainability gate.",
      debt: {
        owner: "quality.compiler@0.1",
        reason: "No duplication analyzer is installed in H00.",
        remediationFfet: "future_maintainability_gate_engine_expansion",
        cannotClaim: ["duplication_gate_enforced"]
      },
      cannotClaim: ["duplication_gate_enforced"]
    },
    {
      dimensionId: "mutation_fault_sampling",
      maturity: "declared_debt",
      status: "debt_approved",
      executable: false,
      reason: "Mutation/fault sampling tooling is not installed in H00.",
      debt: {
        owner: "quality.compiler@0.1",
        reason: "Mutation/fault sampling tooling is not installed in H00.",
        remediationFfet: "future_test_effectiveness_gate_engine_expansion",
        cannotClaim: ["mutation_testing_complete"]
      },
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
    if (dimension.status === "debt_approved" && !hasDebtMetadata(dimension)) {
      findings.push({ dimensionId: dimension.dimensionId, kind: "debt_missing_required_metadata" });
    }
  }

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings
  };
}

function hasDebtMetadata(dimension) {
  return Boolean(
    dimension.reason &&
    dimension.debt &&
    typeof dimension.debt.owner === "string" &&
    dimension.debt.owner.length > 0 &&
    typeof dimension.debt.reason === "string" &&
    dimension.debt.reason.length > 0 &&
    typeof dimension.debt.remediationFfet === "string" &&
    dimension.debt.remediationFfet.length > 0 &&
    Array.isArray(dimension.debt.cannotClaim) &&
    dimension.debt.cannotClaim.length > 0 &&
    Array.isArray(dimension.cannotClaim) &&
    dimension.cannotClaim.length > 0
  );
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
      debt: {
        owner: "quality.compiler@0.1",
        reason: "fixture",
        remediationFfet: "fixture_ffet",
        cannotClaim: ["fixture_claim"]
      },
      cannotClaim: ["fixture_claim"]
    },
    {
      dimensionId: "invalid_debt",
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
  if (!kinds.has("debt_missing_required_metadata")) failures.push("debt_without_required_metadata_not_rejected");

  if (failures.length > 0) {
    console.error(JSON.stringify({ status: "failed", check: "quality_runner_self_test", failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "passed", check: "quality_runner_self_test", negativeFixtures: 3 }));
}
