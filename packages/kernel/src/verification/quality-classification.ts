import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type QualityClassificationVerificationStatus = "passed" | "failed";
export type QualityDimensionClassification =
  | "ci_enforced"
  | "executed_locally"
  | "debt_approved"
  | "not_applicable_with_reason";

export interface QualityClassificationVerificationConfig {
  readonly reportPath?: string;
  readonly report?: unknown;
  readonly finalPostureRecommendation?: string;
  readonly cannotClaim?: readonly string[];
}

export interface QualityClassificationVerificationReport {
  readonly status: QualityClassificationVerificationStatus;
  readonly findings: readonly QualityClassificationFinding[];
  readonly classified_mismatches: readonly QualityClassificationFinding[];
  readonly verified_refs: readonly VerifiedQualityClassificationRef[];
  readonly hash_failures: readonly QualityClassificationFinding[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
  readonly classified_dimensions: readonly ClassifiedQualityDimension[];
}

export interface ClassifiedQualityDimension {
  readonly dimensionId: string;
  readonly classification: QualityDimensionClassification;
}

export interface VerifiedQualityClassificationRef {
  readonly ref: string;
  readonly sha256: string;
  readonly source: "quality_report";
}

export interface QualityClassificationFinding {
  readonly kind: string;
  readonly dimensionId?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export function verifyQualityClassificationConfig(
  config: QualityClassificationVerificationConfig
): QualityClassificationVerificationReport {
  const findings: QualityClassificationFinding[] = [];
  const verifiedRefs: VerifiedQualityClassificationRef[] = [];
  const report = loadReport(config, findings, verifiedRefs);
  const classifiedDimensions = isRecord(report)
    ? classifyDimensions(report, findings)
    : [];
  const inheritedCannotClaim = Array.isArray(isRecord(report) ? report.cannotClaim : undefined)
    ? (report as { cannotClaim: unknown[] }).cannotClaim.filter((item): item is string => typeof item === "string")
    : [];

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: [],
    verified_refs: verifiedRefs,
    hash_failures: findings.filter((finding) => finding.kind.includes("hash")),
    cannot_claim: Array.from(new Set([...(config.cannotClaim ?? []), ...inheritedCannotClaim])).sort(),
    final_posture_recommendation: config.finalPostureRecommendation ?? null,
    classified_dimensions: classifiedDimensions
  };
}

function loadReport(
  config: QualityClassificationVerificationConfig,
  findings: QualityClassificationFinding[],
  verifiedRefs: VerifiedQualityClassificationRef[]
): unknown {
  if (config.report !== undefined) return config.report;
  if (!config.reportPath) {
    findings.push({ kind: "missing_quality_report" });
    return null;
  }
  try {
    const text = readFileSync(config.reportPath, "utf8");
    verifiedRefs.push({
      ref: config.reportPath,
      sha256: createHash("sha256").update(text).digest("hex"),
      source: "quality_report"
    });
    return JSON.parse(text);
  } catch (error) {
    findings.push({
      kind: "quality_report_parse_failed",
      detail: error instanceof Error ? error.message : "unknown parse error"
    });
    return null;
  }
}

function classifyDimensions(
  report: Record<string, unknown>,
  findings: QualityClassificationFinding[]
): ClassifiedQualityDimension[] {
  const dimensions = report.dimensions;
  if (!Array.isArray(dimensions)) {
    findings.push({ kind: "quality_report_missing_dimensions" });
    return [];
  }

  return dimensions.flatMap((dimension): ClassifiedQualityDimension[] => {
    if (!isRecord(dimension)) {
      findings.push({ kind: "quality_dimension_malformed" });
      return [];
    }
    const dimensionId = stringValue(dimension.dimensionId) ?? "unknown_dimension";
    const status = stringValue(dimension.status);
    const maturity = stringValue(dimension.maturity);
    const executable = dimension.executable === true;

    if (status === "passed") {
      if (!executable) {
        findings.push({
          kind: "non_executable_dimension_marked_passed",
          dimensionId
        });
      }
      if (maturity === "ci_enforced") {
        requireCommand(dimension, dimensionId, findings);
        return [{ dimensionId, classification: "ci_enforced" }];
      }
      if (maturity === "locally_executed") {
        requireCommand(dimension, dimensionId, findings);
        return [{ dimensionId, classification: "executed_locally" }];
      }
      findings.push({
        kind: "passed_dimension_unclassified",
        dimensionId,
        actual: maturity ?? "missing"
      });
      return [];
    }

    if (status === "debt_approved") {
      verifyDebtMetadata(dimension, dimensionId, findings);
      return [{ dimensionId, classification: "debt_approved" }];
    }

    if (status === "not_applicable_with_reason") {
      verifyNotApplicableMetadata(dimension, dimensionId, findings);
      return [{ dimensionId, classification: "not_applicable_with_reason" }];
    }

    findings.push({
      kind: "quality_dimension_status_unclassified",
      dimensionId,
      actual: status ?? "missing"
    });
    return [];
  });
}

function requireCommand(
  dimension: Record<string, unknown>,
  dimensionId: string,
  findings: QualityClassificationFinding[]
): void {
  if (typeof dimension.command !== "string" || dimension.command.length === 0) {
    findings.push({
      kind: "executable_dimension_missing_command",
      dimensionId
    });
  }
}

function verifyDebtMetadata(
  dimension: Record<string, unknown>,
  dimensionId: string,
  findings: QualityClassificationFinding[]
): void {
  if (dimension.executable !== false) {
    findings.push({ kind: "debt_dimension_marked_executable", dimensionId });
  }
  if (!stringValue(dimension.reason)) {
    findings.push({ kind: "debt_missing_reason", dimensionId });
  }
  if (!stringArray(dimension.cannotClaim).length) {
    findings.push({ kind: "debt_missing_cannot_claim", dimensionId });
  }
  const debt = dimension.debt;
  if (!isRecord(debt)) {
    findings.push({ kind: "debt_missing_required_metadata", dimensionId });
    return;
  }
  if (!stringValue(debt.owner)) findings.push({ kind: "debt_missing_owner", dimensionId });
  if (!stringValue(debt.reason)) findings.push({ kind: "debt_missing_metadata_reason", dimensionId });
  if (!stringValue(debt.remediationFfet)) {
    findings.push({ kind: "debt_missing_remediation_ffet", dimensionId });
  }
  if (!stringArray(debt.cannotClaim).length) {
    findings.push({ kind: "debt_metadata_missing_cannot_claim", dimensionId });
  }
}

function verifyNotApplicableMetadata(
  dimension: Record<string, unknown>,
  dimensionId: string,
  findings: QualityClassificationFinding[]
): void {
  if (dimension.executable !== false) {
    findings.push({ kind: "not_applicable_dimension_marked_executable", dimensionId });
  }
  if (!stringValue(dimension.reason)) {
    findings.push({ kind: "not_applicable_missing_reason", dimensionId });
  }
  if (!stringArray(dimension.cannotClaim).length) {
    findings.push({ kind: "not_applicable_missing_cannot_claim", dimensionId });
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
