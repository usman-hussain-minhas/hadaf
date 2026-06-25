import type { CompiledQualityProfile } from "./profile.js";

export type QualitySchemaKind =
  | "quality_profile"
  | "box_quality_contract"
  | "quality_gate_result"
  | "quality_debt"
  | "quality_review_attestation"
  | "performance_budget";

export type ValidationIssueCode =
  | "additional_property"
  | "const"
  | "enum"
  | "format"
  | "minimum"
  | "missing_required"
  | "type"
  | "unique_items";

export interface ValidationIssue {
  readonly path: string;
  readonly code: ValidationIssueCode;
  readonly message: string;
}

export interface ValidationResult {
  readonly schema: QualitySchemaKind;
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

export type CanonicalQualityProfileRecord = ReturnType<
  typeof toCanonicalQualityProfileRecord
>;

type PlainRecord = Record<string, unknown>;
type IssueCollector = ValidationIssue[];

const QUALITY_PROFILE_REQUIRED = [
  "quality_profile_id",
  "version",
  "profile_hash",
  "scope",
  "inherited_from",
  "coding",
  "testing",
  "documentation",
  "security",
  "accessibility",
  "performance",
  "maintainability",
  "reliability_observability",
  "data_compatibility_rollback",
  "supply_chain",
  "review",
  "debt_policy"
] as const;

const QUALITY_PROFILE_OPTIONAL = [
  "overrides",
  "waiver_refs",
  "cannot_claim"
] as const;

const BOX_QUALITY_CONTRACT_REQUIRED = [
  "box_quality_contract_id",
  "box_id",
  "quality_profile_ref",
  "quality_profile_hash",
  "audit_level",
  "required_dimensions",
  "quality_debt_refs",
  "release_quality_conditions"
] as const;

const BOX_QUALITY_CONTRACT_OPTIONAL = ["cannot_claim"] as const;

const QUALITY_GATE_RESULT_REQUIRED = [
  "quality_gate_result_id",
  "scope_type",
  "scope_id",
  "source_sha",
  "quality_profile_hash",
  "tool_versions",
  "checks",
  "result",
  "independent_attestation_ref",
  "evidence_hashes",
  "created_at"
] as const;

const QUALITY_GATE_RESULT_OPTIONAL = [
  "quality_debt_refs",
  "cannot_claim"
] as const;

const QUALITY_REVIEW_ATTESTATION_REQUIRED = [
  "attestation_id",
  "reviewer_agent_id",
  "reviewer_agent_version",
  "independent_from_implementer",
  "scope_type",
  "scope_id",
  "source_sha",
  "quality_profile_hash",
  "result",
  "evidence_refs",
  "created_at"
] as const;

const QUALITY_REVIEW_ATTESTATION_OPTIONAL = [
  "findings",
  "cannot_claim"
] as const;

const QUALITY_DEBT_REQUIRED = [
  "quality_debt_id",
  "project_id",
  "box_id",
  "quality_profile_hash",
  "standard",
  "severity",
  "reason",
  "owner",
  "approved_by",
  "approved_at",
  "expires_at",
  "remediation_ffet",
  "cannot_claim",
  "status"
] as const;

const QUALITY_DEBT_OPTIONAL = ["ffet_id", "actual", "required"] as const;

const PERFORMANCE_BUDGET_REQUIRED = [
  "performance_budget_id",
  "scope",
  "environment",
  "dataset",
  "concurrency",
  "state",
  "sample_count",
  "measurement_tool",
  "metrics",
  "acceptable_variance"
] as const;

const PERFORMANCE_BUDGET_OPTIONAL = ["cannot_claim"] as const;

const SCOPE_TYPES = ["ffet", "box", "release"] as const;
const AUDIT_LEVELS = ["self", "independent", "deep_security"] as const;
const GATE_CHECK_RESULTS = [
  "passed",
  "failed",
  "blocked",
  "inconclusive",
  "waived"
] as const;
const GATE_RESULTS = [
  "passed",
  "failed",
  "blocked",
  "inconclusive",
  "passed_with_approved_debt"
] as const;
const ATTESTATION_RESULTS = [
  "passed",
  "failed",
  "blocked",
  "inconclusive",
  "passed_with_debt"
] as const;
const QUALITY_DEBT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const QUALITY_DEBT_STATUSES = [
  "proposed",
  "approved",
  "expired",
  "remediated",
  "rejected"
] as const;
const PERFORMANCE_STATES = ["cold", "warm", "mixed"] as const;
const RFC3339_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function validateQualityRecord(
  schema: QualitySchemaKind,
  value: unknown
): ValidationResult {
  switch (schema) {
    case "quality_profile":
      return validateQualityProfileRecord(value);
    case "box_quality_contract":
      return validateBoxQualityContractRecord(value);
    case "quality_gate_result":
      return validateQualityGateResultRecord(value);
    case "quality_debt":
      return validateQualityDebtRecord(value);
    case "quality_review_attestation":
      return validateQualityReviewAttestationRecord(value);
    case "performance_budget":
      return validatePerformanceBudgetRecord(value);
  }
}

export function assertValidQualityRecord(
  schema: QualitySchemaKind,
  value: unknown
): asserts value is PlainRecord {
  const result = validateQualityRecord(schema, value);
  if (!result.ok) {
    const details = result.issues
      .map((issue) => `${issue.path} ${issue.code}: ${issue.message}`)
      .join("; ");
    throw new Error(`${schema} validation failed: ${details}`);
  }
}

export function validateQualityProfileRecord(value: unknown): ValidationResult {
  const issues: IssueCollector = [];
  const record = expectRootRecord(value, issues);
  if (record) {
    validateRequired(record, QUALITY_PROFILE_REQUIRED, issues);
    rejectAdditional(
      record,
      [...QUALITY_PROFILE_REQUIRED, ...QUALITY_PROFILE_OPTIONAL],
      issues
    );
    expectNonEmptyString(record, "quality_profile_id", issues);
    expectNonEmptyString(record, "version", issues);
    expectNonEmptyString(record, "profile_hash", issues);
    expectNonEmptyString(record, "scope", issues);
    expectUniqueStringArray(record, "inherited_from", issues);
    for (const key of [
      "coding",
      "testing",
      "documentation",
      "security",
      "accessibility",
      "performance",
      "maintainability",
      "reliability_observability",
      "data_compatibility_rollback",
      "supply_chain",
      "review",
      "debt_policy"
    ]) {
      expectRecord(record, key, issues);
    }
    expectArrayOfRecords(record, "overrides", issues, false);
    expectStringArray(record, "waiver_refs", issues, false);
    expectStringArray(record, "cannot_claim", issues, false);
  }
  return result("quality_profile", issues);
}

export function validateBoxQualityContractRecord(value: unknown): ValidationResult {
  const issues: IssueCollector = [];
  const record = expectRootRecord(value, issues);
  if (record) {
    validateRequired(record, BOX_QUALITY_CONTRACT_REQUIRED, issues);
    rejectAdditional(
      record,
      [...BOX_QUALITY_CONTRACT_REQUIRED, ...BOX_QUALITY_CONTRACT_OPTIONAL],
      issues
    );
    expectStringFields(record, [
      "box_quality_contract_id",
      "box_id",
      "quality_profile_ref",
      "quality_profile_hash"
    ], issues);
    expectEnum(record, "audit_level", AUDIT_LEVELS, issues);
    expectRecord(record, "required_dimensions", issues);
    expectStringArray(record, "quality_debt_refs", issues, true);
    expectStringArray(record, "release_quality_conditions", issues, true);
    expectStringArray(record, "cannot_claim", issues, false);
  }
  return result("box_quality_contract", issues);
}

export function validateQualityGateResultRecord(value: unknown): ValidationResult {
  const issues: IssueCollector = [];
  const record = expectRootRecord(value, issues);
  if (record) {
    validateRequired(record, QUALITY_GATE_RESULT_REQUIRED, issues);
    rejectAdditional(
      record,
      [...QUALITY_GATE_RESULT_REQUIRED, ...QUALITY_GATE_RESULT_OPTIONAL],
      issues
    );
    expectStringFields(record, [
      "quality_gate_result_id",
      "scope_id",
      "source_sha",
      "quality_profile_hash",
      "independent_attestation_ref"
    ], issues);
    expectEnum(record, "scope_type", SCOPE_TYPES, issues);
    expectRecord(record, "tool_versions", issues);
    expectGateChecks(record, issues);
    expectEnum(record, "result", GATE_RESULTS, issues);
    expectStringArray(record, "quality_debt_refs", issues, false);
    expectStringArray(record, "evidence_hashes", issues, true);
    expectStringArray(record, "cannot_claim", issues, false);
    expectDateTime(record, "created_at", issues);
  }
  return result("quality_gate_result", issues);
}

export function validateQualityDebtRecord(value: unknown): ValidationResult {
  const issues: IssueCollector = [];
  const record = expectRootRecord(value, issues);
  if (record) {
    validateRequired(record, QUALITY_DEBT_REQUIRED, issues);
    rejectAdditional(
      record,
      [...QUALITY_DEBT_REQUIRED, ...QUALITY_DEBT_OPTIONAL],
      issues
    );
    expectStringFields(record, [
      "quality_debt_id",
      "project_id",
      "box_id",
      "quality_profile_hash",
      "standard",
      "reason",
      "owner",
      "approved_by",
      "remediation_ffet"
    ], issues);
    expectOptionalStringOrNull(record, "ffet_id", issues);
    expectEnum(record, "severity", QUALITY_DEBT_SEVERITIES, issues);
    expectDateTime(record, "approved_at", issues);
    expectDateTime(record, "expires_at", issues);
    expectStringArray(record, "cannot_claim", issues, true);
    expectEnum(record, "status", QUALITY_DEBT_STATUSES, issues);
  }
  return result("quality_debt", issues);
}

export function validateQualityReviewAttestationRecord(
  value: unknown
): ValidationResult {
  const issues: IssueCollector = [];
  const record = expectRootRecord(value, issues);
  if (record) {
    validateRequired(record, QUALITY_REVIEW_ATTESTATION_REQUIRED, issues);
    rejectAdditional(
      record,
      [
        ...QUALITY_REVIEW_ATTESTATION_REQUIRED,
        ...QUALITY_REVIEW_ATTESTATION_OPTIONAL
      ],
      issues
    );
    expectStringFields(record, [
      "attestation_id",
      "reviewer_agent_id",
      "reviewer_agent_version",
      "scope_id",
      "source_sha",
      "quality_profile_hash"
    ], issues);
    expectConstTrue(record, "independent_from_implementer", issues);
    expectEnum(record, "scope_type", SCOPE_TYPES, issues);
    expectEnum(record, "result", ATTESTATION_RESULTS, issues);
    expectStringArray(record, "findings", issues, false);
    expectStringArray(record, "evidence_refs", issues, true);
    expectStringArray(record, "cannot_claim", issues, false);
    expectDateTime(record, "created_at", issues);
  }
  return result("quality_review_attestation", issues);
}

export function validatePerformanceBudgetRecord(value: unknown): ValidationResult {
  const issues: IssueCollector = [];
  const record = expectRootRecord(value, issues);
  if (record) {
    validateRequired(record, PERFORMANCE_BUDGET_REQUIRED, issues);
    rejectAdditional(
      record,
      [...PERFORMANCE_BUDGET_REQUIRED, ...PERFORMANCE_BUDGET_OPTIONAL],
      issues
    );
    expectStringFields(record, [
      "performance_budget_id",
      "scope",
      "dataset",
      "measurement_tool"
    ], issues);
    expectRecord(record, "environment", issues);
    expectIntegerAtLeast(record, "concurrency", 1, issues);
    expectEnum(record, "state", PERFORMANCE_STATES, issues);
    expectIntegerAtLeast(record, "sample_count", 1, issues);
    expectRecord(record, "metrics", issues);
    expectNumberAtLeast(record, "acceptable_variance", 0, issues);
    expectStringArray(record, "cannot_claim", issues, false);
  }
  return result("performance_budget", issues);
}

export function toCanonicalQualityProfileRecord(profile: CompiledQualityProfile) {
  return {
    quality_profile_id: profile.qualityProfileId,
    version: profile.version,
    profile_hash: profile.profileHash,
    scope: profile.scope,
    inherited_from: [...profile.inheritedFrom],
    coding: {
      formatter_required: profile.coding.formatterRequired,
      lint_errors_max: profile.coding.lintErrorsMax,
      new_warnings_max: profile.coding.newWarningsMax,
      strict_types: profile.coding.strictTypes,
      no_implicit_any: profile.coding.noImplicitAny,
      no_unused: profile.coding.noUnused,
      unjustified_any_forbidden: profile.coding.unjustifiedAnyForbidden,
      unchecked_suppressions_forbidden: profile.coding.uncheckedSuppressionsForbidden,
      placeholder_release_code_forbidden: profile.coding.placeholderReleaseCodeForbidden
    },
    testing: {
      project_line_coverage_min: profile.testing.projectLineCoverageMin,
      project_branch_coverage_min: profile.testing.projectBranchCoverageMin,
      changed_line_coverage_min: profile.testing.changedLineCoverageMin,
      changed_branch_coverage_min: profile.testing.changedBranchCoverageMin,
      critical_box_line_coverage_min: profile.testing.criticalBoxLineCoverageMin,
      critical_box_branch_coverage_min: profile.testing.criticalBoxBranchCoverageMin,
      flaky_tests_forbidden: profile.testing.flakyTestsForbidden,
      test_order_dependency_forbidden: profile.testing.testOrderDependencyForbidden,
      critical_mutation_or_fault_sampling_required:
        profile.testing.criticalMutationOrFaultSamplingRequired
    },
    documentation: {
      root_readme_required: profile.documentation.rootReadmeRequired,
      developer_setup_required: profile.documentation.developerSetupRequired,
      api_docs_when_public_api: profile.documentation.apiDocsWhenPublicApi,
      adr_for_architecture_decision:
        profile.documentation.adrForArchitectureDecision,
      comments_for_non_obvious_invariants:
        profile.documentation.commentsForNonObviousInvariants,
      ffet_changelog_in_product_repo: profile.documentation.ffetChangelogInProductRepo,
      box_docs_in_control_plane: profile.documentation.boxDocsInControlPlane
    },
    security: {
      secret_scan_required: profile.security.secretScanRequired,
      dependency_scan_required: profile.security.dependencyScanRequired,
      sast_required: profile.security.sastRequired,
      high_critical_findings_block: profile.security.highCriticalFindingsBlock,
      log_redaction_required: profile.security.logRedactionRequired
    },
    accessibility: {
      automated_checks_required: profile.accessibility.automatedChecksRequired,
      keyboard_proof_for_critical_flows:
        profile.accessibility.keyboardProofForCriticalFlows,
      responsive_state_proof_required:
        profile.accessibility.responsiveStateProofRequired
    },
    performance: {
      environment_contract_required:
        profile.performance.environmentContractRequired,
      local_api_read_p95_ms: profile.performance.localApiReadP95Ms,
      local_api_write_p95_ms: profile.performance.localApiWriteP95Ms,
      hmc_lcp_ms: profile.performance.hmcLcpMs,
      hmc_cls_max: profile.performance.hmcClsMax,
      per_route_bundle_budget_required:
        profile.performance.perRouteBundleBudgetRequired
    },
    maintainability: {
      complexity_warning: profile.maintainability.complexityWarning,
      complexity_hard_review: profile.maintainability.complexityHardReview,
      function_size_warning_lines:
        profile.maintainability.functionSizeWarningLines,
      duplication_warning_percent: profile.maintainability.duplicationWarningPercent,
      no_new_duplicate_block_over_lines:
        profile.maintainability.noNewDuplicateBlockOverLines,
      impact_graph_review_required:
        profile.maintainability.impactGraphReviewRequired
    },
    reliability_observability: {
      bounded_timeouts_retries_required:
        profile.reliabilityObservability.boundedTimeoutsRetriesRequired,
      idempotency_where_relevant:
        profile.reliabilityObservability.idempotencyWhereRelevant,
      structured_logs_required:
        profile.reliabilityObservability.structuredLogsRequired,
      health_readiness_required_for_services:
        profile.reliabilityObservability.healthReadinessRequiredForServices,
      resource_cleanup_required:
        profile.reliabilityObservability.resourceCleanupRequired
    },
    data_compatibility_rollback: {
      semantic_rollback_required_when_stateful:
        profile.dataCompatibilityRollback.semanticRollbackRequiredWhenStateful,
      migration_compensation_required:
        profile.dataCompatibilityRollback.migrationCompensationRequired,
      api_schema_compatibility_required:
        profile.dataCompatibilityRollback.apiSchemaCompatibilityRequired
    },
    supply_chain: {
      sbom_required: profile.supplyChain.sbomRequired,
      provenance_required: profile.supplyChain.provenanceRequired,
      lockfile_integrity_required: profile.supplyChain.lockfileIntegrityRequired
    },
    review: {
      independent_agent_review_required:
        profile.review.independentAgentReviewRequired,
      implementing_agent_self_attestation_forbidden:
        profile.review.implementingAgentSelfAttestationForbidden,
      human_review_risk_levels: [...profile.review.humanReviewRiskLevels]
    },
    debt_policy: {
      owner_required: profile.debt.ownerRequired,
      expiry_required: profile.debt.expiryRequired,
      remediation_ffet_required: profile.debt.remediationFfetRequired,
      cannot_claim_required: profile.debt.cannotClaimRequired,
      prohibited_waiver_classes: [...profile.debt.prohibitedWaiverClasses]
    }
  };
}

function result(schema: QualitySchemaKind, issues: IssueCollector): ValidationResult {
  return { schema, ok: issues.length === 0, issues };
}

function expectRootRecord(
  value: unknown,
  issues: IssueCollector
): PlainRecord | null {
  if (!isPlainRecord(value)) {
    issues.push({
      path: "$",
      code: "type",
      message: "Expected an object record."
    });
    return null;
  }
  return value;
}

function validateRequired(
  record: PlainRecord,
  required: readonly string[],
  issues: IssueCollector
): void {
  for (const key of required) {
    if (!hasOwn(record, key)) {
      issues.push({
        path: fieldPath(key),
        code: "missing_required",
        message: "Required field is missing."
      });
    }
  }
}

function rejectAdditional(
  record: PlainRecord,
  allowed: readonly string[],
  issues: IssueCollector
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      issues.push({
        path: fieldPath(key),
        code: "additional_property",
        message: "Field is not allowed by the canonical schema."
      });
    }
  }
}

function expectStringFields(
  record: PlainRecord,
  keys: readonly string[],
  issues: IssueCollector
): void {
  for (const key of keys) {
    expectNonEmptyString(record, key, issues);
  }
}

function expectNonEmptyString(
  record: PlainRecord,
  key: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    issues.push({
      path: fieldPath(key),
      code: "type",
      message: "Expected a non-empty string."
    });
  }
}

function expectOptionalStringOrNull(
  record: PlainRecord,
  key: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "string" && value !== null) {
    issues.push({
      path: fieldPath(key),
      code: "type",
      message: "Expected a string or null."
    });
  }
}

function expectRecord(
  record: PlainRecord,
  key: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  if (!isPlainRecord(record[key])) {
    issues.push({
      path: fieldPath(key),
      code: "type",
      message: "Expected an object record."
    });
  }
}

function expectConstTrue(
  record: PlainRecord,
  key: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  if (record[key] !== true) {
    issues.push({
      path: fieldPath(key),
      code: "const",
      message: "Expected true."
    });
  }
}

function expectEnum(
  record: PlainRecord,
  key: string,
  allowed: readonly string[],
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      path: fieldPath(key),
      code: "enum",
      message: `Expected one of: ${allowed.join(", ")}.`
    });
  }
}

function expectIntegerAtLeast(
  record: PlainRecord,
  key: string,
  minimum: number,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    issues.push({
      path: fieldPath(key),
      code: "type",
      message: "Expected an integer."
    });
    return;
  }
  if (value < minimum) {
    issues.push({
      path: fieldPath(key),
      code: "minimum",
      message: `Expected a value greater than or equal to ${minimum}.`
    });
  }
}

function expectNumberAtLeast(
  record: PlainRecord,
  key: string,
  minimum: number,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.push({
      path: fieldPath(key),
      code: "type",
      message: "Expected a number."
    });
    return;
  }
  if (value < minimum) {
    issues.push({
      path: fieldPath(key),
      code: "minimum",
      message: `Expected a value greater than or equal to ${minimum}.`
    });
  }
}

function expectDateTime(
  record: PlainRecord,
  key: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "string" || !isRfc3339DateTime(value)) {
    issues.push({
      path: fieldPath(key),
      code: "format",
      message: "Expected an RFC3339 date-time string."
    });
  }
}

function isRfc3339DateTime(value: string): boolean {
  const match = RFC3339_DATE_TIME_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    Number.isNaN(Date.parse(value))
  ) {
    return false;
  }
  const canonicalDate = new Date(Date.UTC(year, month - 1, day));
  return (
    canonicalDate.getUTCFullYear() === year &&
    canonicalDate.getUTCMonth() === month - 1 &&
    canonicalDate.getUTCDate() === day
  );
}

function expectStringArray(
  record: PlainRecord,
  key: string,
  issues: IssueCollector,
  _required: boolean
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({
      path: fieldPath(key),
      code: "type",
      message: "Expected an array."
    });
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      issues.push({
        path: `${fieldPath(key)}[${index}]`,
        code: "type",
        message: "Expected a string."
      });
    }
  }
}

function expectUniqueStringArray(
  record: PlainRecord,
  key: string,
  issues: IssueCollector
): void {
  expectStringArray(record, key, issues, true);
  const value = record[key];
  if (!Array.isArray(value)) {
    return;
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    if (seen.has(item)) {
      issues.push({
        path: fieldPath(key),
        code: "unique_items",
        message: "Expected unique string values."
      });
      return;
    }
    seen.add(item);
  }
}

function expectArrayOfRecords(
  record: PlainRecord,
  key: string,
  issues: IssueCollector,
  _required: boolean
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({
      path: fieldPath(key),
      code: "type",
      message: "Expected an array."
    });
    return;
  }
  for (const [index, item] of value.entries()) {
    if (!isPlainRecord(item)) {
      issues.push({
        path: `${fieldPath(key)}[${index}]`,
        code: "type",
        message: "Expected an object record."
      });
    }
  }
}

function expectGateChecks(record: PlainRecord, issues: IssueCollector): void {
  if (!hasOwn(record, "checks")) {
    return;
  }
  const checks = record.checks;
  if (!Array.isArray(checks)) {
    issues.push({
      path: "$.checks",
      code: "type",
      message: "Expected an array."
    });
    return;
  }
  for (const [index, item] of checks.entries()) {
    const path = `$.checks[${index}]`;
    if (!isPlainRecord(item)) {
      issues.push({
        path,
        code: "type",
        message: "Expected an object record."
      });
      continue;
    }
    validateRequiredAtPath(item, ["check_id", "result"], path, issues);
    rejectAdditionalAtPath(
      item,
      ["check_id", "result", "command", "evidence_refs", "detail"],
      path,
      issues
    );
    expectNonEmptyStringAtPath(item, "check_id", path, issues);
    expectEnumAtPath(item, "result", GATE_CHECK_RESULTS, path, issues);
    expectStringOrNullAtPath(item, "command", path, issues);
    expectStringArrayAtPath(item, "evidence_refs", path, issues);
    expectStringOrNullAtPath(item, "detail", path, issues);
  }
}

function validateRequiredAtPath(
  record: PlainRecord,
  required: readonly string[],
  path: string,
  issues: IssueCollector
): void {
  for (const key of required) {
    if (!hasOwn(record, key)) {
      issues.push({
        path: `${path}.${key}`,
        code: "missing_required",
        message: "Required field is missing."
      });
    }
  }
}

function rejectAdditionalAtPath(
  record: PlainRecord,
  allowed: readonly string[],
  path: string,
  issues: IssueCollector
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      issues.push({
        path: `${path}.${key}`,
        code: "additional_property",
        message: "Field is not allowed by the canonical schema."
      });
    }
  }
}

function expectNonEmptyStringAtPath(
  record: PlainRecord,
  key: string,
  path: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    issues.push({
      path: `${path}.${key}`,
      code: "type",
      message: "Expected a non-empty string."
    });
  }
}

function expectStringOrNullAtPath(
  record: PlainRecord,
  key: string,
  path: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "string" && value !== null) {
    issues.push({
      path: `${path}.${key}`,
      code: "type",
      message: "Expected a string or null."
    });
  }
}

function expectEnumAtPath(
  record: PlainRecord,
  key: string,
  allowed: readonly string[],
  path: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      path: `${path}.${key}`,
      code: "enum",
      message: `Expected one of: ${allowed.join(", ")}.`
    });
  }
}

function expectStringArrayAtPath(
  record: PlainRecord,
  key: string,
  path: string,
  issues: IssueCollector
): void {
  if (!hasOwn(record, key)) {
    return;
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({
      path: `${path}.${key}`,
      code: "type",
      message: "Expected an array."
    });
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      issues.push({
        path: `${path}.${key}[${index}]`,
        code: "type",
        message: "Expected a string."
      });
    }
  }
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: PlainRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function fieldPath(key: string): string {
  return `$.${key}`;
}
