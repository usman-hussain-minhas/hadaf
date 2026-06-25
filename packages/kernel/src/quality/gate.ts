import { assertValidQualityRecord } from "./schemas.js";

export type QualityGateScopeType = "ffet" | "box" | "release";
export type QualityGateCheckResult =
  | "passed"
  | "failed"
  | "blocked"
  | "inconclusive"
  | "waived";
export type QualityGateResult =
  | "passed"
  | "failed"
  | "blocked"
  | "inconclusive"
  | "passed_with_approved_debt";
export type QualityDebtStatus =
  | "proposed"
  | "approved"
  | "expired"
  | "remediated"
  | "rejected";

export interface QualityGateCheckInput {
  readonly checkId: string;
  readonly result: QualityGateCheckResult;
  readonly required?: boolean;
  readonly command?: string | null;
  readonly evidenceRefs?: readonly string[];
  readonly detail?: string | null;
}

export interface QualityGateDebtInput {
  readonly ref: string;
  readonly status: QualityDebtStatus;
  readonly expiresAt: string;
}

export interface CompileQualityGateInput {
  readonly qualityGateResultId: string;
  readonly scopeType: QualityGateScopeType;
  readonly scopeId: string;
  readonly sourceSha: string;
  readonly qualityProfileHash: string;
  readonly toolVersions: Readonly<Record<string, string>>;
  readonly checks: readonly QualityGateCheckInput[];
  readonly requiredCheckIds?: readonly string[];
  readonly independentAttestationRef?: string | null;
  readonly evidenceHashes?: readonly string[];
  readonly qualityDebt?: readonly QualityGateDebtInput[];
  readonly createdAt: string;
  readonly cannotClaim?: readonly string[];
}

export interface QualityGateResultCheckRecord {
  readonly check_id: string;
  readonly result: QualityGateCheckResult;
  readonly command: string | null;
  readonly evidence_refs: readonly string[];
  readonly detail: string | null;
}

export interface QualityGateResultRecord {
  readonly quality_gate_result_id: string;
  readonly scope_type: QualityGateScopeType;
  readonly scope_id: string;
  readonly source_sha: string;
  readonly quality_profile_hash: string;
  readonly tool_versions: Readonly<Record<string, string>>;
  readonly checks: readonly QualityGateResultCheckRecord[];
  readonly result: QualityGateResult;
  readonly quality_debt_refs: readonly string[];
  readonly independent_attestation_ref: string;
  readonly evidence_hashes: readonly string[];
  readonly cannot_claim: readonly string[];
  readonly created_at: string;
}

const MISSING_ATTESTATION_REF = "missing-independent-attestation";

export function compileQualityGateResult(
  input: CompileQualityGateInput
): QualityGateResultRecord {
  const originalChecks = input.checks.map(toCheckRecord);
  const requiredCheckIds = getRequiredCheckIds(input);
  const syntheticChecks: QualityGateResultCheckRecord[] = [];

  for (const missingCheckId of missingRequiredCheckIds(requiredCheckIds, input.checks)) {
    syntheticChecks.push({
      check_id: `required_check_missing:${missingCheckId}`,
      result: "blocked",
      command: null,
      evidence_refs: [],
      detail: `Required check ${missingCheckId} was not provided.`
    });
  }

  const independentAttestationRef = normalizeAttestationRef(
    input.independentAttestationRef
  );
  if (independentAttestationRef === MISSING_ATTESTATION_REF) {
    syntheticChecks.push({
      check_id: "independent_attestation_required",
      result: "blocked",
      command: null,
      evidence_refs: [],
      detail: "Independent quality attestation is required before the gate can pass."
    });
  }

  const debtStatus = evaluateDebt(input.qualityDebt ?? [], input.createdAt);
  for (const debt of debtStatus.blockingDebt) {
    syntheticChecks.push({
      check_id: `quality_debt_blocking:${debt.ref}`,
      result: "blocked",
      command: null,
      evidence_refs: [],
      detail: `Quality debt ${debt.ref} is ${debt.reason}.`
    });
  }

  const checks = [...originalChecks, ...syntheticChecks];
  const result = determineGateResult({
    checks,
    requiredCheckIds,
    approvedDebtCount: debtStatus.approvedDebtRefs.length,
    blockingDebtCount: debtStatus.blockingDebt.length,
    missingAttestation: independentAttestationRef === MISSING_ATTESTATION_REF
  });

  const record: QualityGateResultRecord = {
    quality_gate_result_id: input.qualityGateResultId,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    source_sha: input.sourceSha,
    quality_profile_hash: input.qualityProfileHash,
    tool_versions: sortRecord(input.toolVersions),
    checks,
    result,
    quality_debt_refs: debtStatus.qualityDebtRefs,
    independent_attestation_ref: independentAttestationRef,
    evidence_hashes: [...(input.evidenceHashes ?? [])],
    cannot_claim: [...(input.cannotClaim ?? [])],
    created_at: input.createdAt
  };

  assertValidQualityRecord("quality_gate_result", record);
  return record;
}

function toCheckRecord(
  check: QualityGateCheckInput
): QualityGateResultCheckRecord {
  return {
    check_id: check.checkId,
    result: check.result,
    command: check.command ?? null,
    evidence_refs: [...(check.evidenceRefs ?? [])],
    detail: check.detail ?? null
  };
}

function getRequiredCheckIds(input: CompileQualityGateInput): readonly string[] {
  if (input.requiredCheckIds) {
    return [...input.requiredCheckIds].sort();
  }
  return input.checks
    .filter((check) => check.required !== false)
    .map((check) => check.checkId)
    .sort();
}

function missingRequiredCheckIds(
  requiredCheckIds: readonly string[],
  checks: readonly QualityGateCheckInput[]
): readonly string[] {
  const actualIds = new Set(checks.map((check) => check.checkId));
  return requiredCheckIds.filter((checkId) => !actualIds.has(checkId));
}

function normalizeAttestationRef(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return MISSING_ATTESTATION_REF;
  }
  return value;
}

function evaluateDebt(
  debts: readonly QualityGateDebtInput[],
  createdAt: string
): {
  readonly qualityDebtRefs: readonly string[];
  readonly approvedDebtRefs: readonly string[];
  readonly blockingDebt: readonly { readonly ref: string; readonly reason: string }[];
} {
  const createdAtMs = Date.parse(createdAt);
  const approvedDebtRefs: string[] = [];
  const blockingDebt: { ref: string; reason: string }[] = [];

  for (const debt of debts) {
    const expiresAtMs = Date.parse(debt.expiresAt);
    if (debt.status === "remediated") {
      continue;
    }
    if (debt.status !== "approved") {
      blockingDebt.push({ ref: debt.ref, reason: debt.status });
      continue;
    }
    if (Number.isNaN(expiresAtMs) || expiresAtMs < createdAtMs) {
      blockingDebt.push({ ref: debt.ref, reason: "expired" });
      continue;
    }
    approvedDebtRefs.push(debt.ref);
  }

  return {
    qualityDebtRefs: debts.map((debt) => debt.ref),
    approvedDebtRefs,
    blockingDebt
  };
}

function determineGateResult(input: {
  readonly checks: readonly QualityGateResultCheckRecord[];
  readonly requiredCheckIds: readonly string[];
  readonly approvedDebtCount: number;
  readonly blockingDebtCount: number;
  readonly missingAttestation: boolean;
}): QualityGateResult {
  const requiredChecks = input.checks.filter((check) =>
    input.requiredCheckIds.includes(check.check_id)
  );
  const blockingSyntheticCheck = input.checks.some(
    (check) => check.result === "blocked" && !input.requiredCheckIds.includes(check.check_id)
  );
  if (
    input.missingAttestation ||
    input.blockingDebtCount > 0 ||
    blockingSyntheticCheck ||
    requiredChecks.some((check) => check.result === "blocked")
  ) {
    return "blocked";
  }
  if (requiredChecks.some((check) => check.result === "failed")) {
    return "failed";
  }
  if (requiredChecks.some((check) => check.result === "inconclusive")) {
    return "inconclusive";
  }
  if (
    requiredChecks.some((check) => check.result === "waived") ||
    input.approvedDebtCount > 0
  ) {
    return "passed_with_approved_debt";
  }
  return "passed";
}

function sortRecord(
  record: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}
