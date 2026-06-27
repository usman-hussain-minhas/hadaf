import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H07ProofPackageStatus = "passed" | "failed";
export type H07ExpectedProofPackageStatus = "passed" | "failed";

export interface H07ProofPackageConfig {
  readonly logicalRoots: Record<string, string>;
  readonly expectedProductSha: string;
  readonly expectedTreeHash: string;
  readonly unsupportedClaimClasses?: readonly string[];
  readonly requiredCannotClaim?: readonly string[];
  readonly packages: readonly H07ProofPackageExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H07ProofPackageExpectation {
  readonly packageId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H07ExpectedProofPackageStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H07ProofPackageReport {
  readonly status: H07ProofPackageStatus;
  readonly findings: readonly H07ProofPackageFinding[];
  readonly verified_refs: readonly H07VerifiedProofRef[];
  readonly hash_failures: readonly H07ProofPackageFinding[];
  readonly package_results: readonly H07ProofPackageResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H07ProofPackageResult {
  readonly packageId: string;
  readonly ref: string;
  readonly status: H07ProofPackageStatus;
  readonly expectedStatus: H07ExpectedProofPackageStatus;
  readonly findingKinds: readonly string[];
}

export interface H07VerifiedProofRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "proof_package" | "evidence";
}

export interface H07ProofPackageFinding {
  readonly kind: string;
  readonly packageId?: string;
  readonly claimId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H07ProofPackage {
  readonly schema_version: string;
  readonly package_id: string;
  readonly product_sha: string;
  readonly tree_hash: string;
  readonly proof_level: string;
  readonly exact_product_binding_required: boolean;
  readonly stale_invalidation: {
    readonly invalidate_on_product_sha_change: boolean;
    readonly invalidate_on_tree_hash_change: boolean;
    readonly invalidate_on_evidence_hash_change: boolean;
  };
  readonly claims: readonly H07ProofClaim[];
  readonly evidence: readonly H07ProofEvidence[];
  readonly redaction: {
    readonly public_safe: boolean;
    readonly redacted_refs: readonly string[];
  };
  readonly cannot_claim: readonly string[];
}

interface H07ProofClaim {
  readonly claim_id: string;
  readonly claim_class: string;
  readonly status: "supported" | "unsupported" | "blocked" | "not_claimed";
  readonly evidence_refs: readonly string[];
  readonly minimum_evidence_classes?: readonly string[];
}

interface H07ProofEvidence {
  readonly ref: string;
  readonly sha256: string;
  readonly evidence_class: string;
  readonly public_safe: boolean;
  readonly redaction_status: "public_safe" | "redacted" | "private";
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
const FUTURE_OPERATIONAL_CLAIM_PATTERN =
  /(?:^|[_-])(?:P8|P9|release|production|self[_-]?hosting|stable[_-]?agents)(?:$|[_-])/iu;

export function verifyH07ProofPackageConfig(config: H07ProofPackageConfig): H07ProofPackageReport {
  const findings: H07ProofPackageFinding[] = [];
  const verifiedRefs: H07VerifiedProofRef[] = [];
  const packageResults = config.packages.map((expectation) =>
    verifyProofPackageExpectation(config, expectation, findings, verifiedRefs)
  );
  const hasUnexpectedFindings =
    packageResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "package_status_unexpected" ||
        finding.kind === "expected_package_finding_missing"
    );
  const hashFailures = findings.filter(
    (finding) =>
      finding.kind.includes("hash") ||
      finding.kind.includes("sha") ||
      finding.kind.includes("placeholder")
  );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    verified_refs: verifiedRefs,
    hash_failures: hashFailures,
    package_results: packageResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyProofPackageExpectation(
  config: H07ProofPackageConfig,
  expectation: H07ProofPackageExpectation,
  findings: H07ProofPackageFinding[],
  verifiedRefs: H07VerifiedProofRef[]
): H07ProofPackageResult {
  const localFindings: H07ProofPackageFinding[] = [];
  const packageHashFinding = validateSha256(expectation.sha256, "package_hash_invalid");
  if (packageHashFinding) {
    localFindings.push({ ...packageHashFinding, packageId: expectation.packageId, ref: expectation.ref });
  }

  const packagePath = resolveLogicalRef(expectation.ref, config.logicalRoots, localFindings);
  let proofPackage: H07ProofPackage | null = null;

  if (packagePath && existsSync(packagePath) && localFindings.length === 0) {
    const text = readFileSync(packagePath, "utf8");
    if (containsPrivatePathSignal(text)) {
      localFindings.push({
        kind: "private_path_in_package",
        packageId: expectation.packageId,
        ref: expectation.ref,
        path: packagePath
      });
    }

    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.sha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "package_hash_mismatch",
        packageId: expectation.packageId,
        ref: expectation.ref,
        path: packagePath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.ref, path: packagePath, sha256: actualHash, source: "proof_package" });
    }

    try {
      proofPackage = JSON.parse(text) as H07ProofPackage;
    } catch (error) {
      localFindings.push({
        kind: "package_json_invalid",
        packageId: expectation.packageId,
        ref: expectation.ref,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  } else if (packagePath && !existsSync(packagePath)) {
    localFindings.push({
      kind: "package_missing",
      packageId: expectation.packageId,
      ref: expectation.ref,
      path: packagePath
    });
  }

  if (proofPackage) {
    localFindings.push(...semanticFindings(config, expectation, proofPackage, verifiedRefs));
  }

  const actualStatus: H07ProofPackageStatus = localFindings.length === 0 ? "passed" : "failed";
  const findingKinds = localFindings.map((finding) => finding.kind);
  if (actualStatus !== expectation.expectedStatus) {
    localFindings.push({
      kind: "package_status_unexpected",
      packageId: expectation.packageId,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedKind of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedKind)) {
      localFindings.push({
        kind: "expected_package_finding_missing",
        packageId: expectation.packageId,
        expected: expectedKind
      });
    }
  }

  findings.push(...localFindings);
  return {
    packageId: expectation.packageId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind)
  };
}

function semanticFindings(
  config: H07ProofPackageConfig,
  expectation: H07ProofPackageExpectation,
  proofPackage: H07ProofPackage,
  verifiedRefs: H07VerifiedProofRef[]
): H07ProofPackageFinding[] {
  const findings: H07ProofPackageFinding[] = [];

  if (proofPackage.schema_version !== "1.0.0") {
    findings.push({ kind: "schema_version_invalid", packageId: expectation.packageId });
  }
  if (proofPackage.package_id !== expectation.packageId) {
    findings.push({
      kind: "package_id_mismatch",
      packageId: expectation.packageId,
      expected: expectation.packageId,
      actual: String(proofPackage.package_id)
    });
  }
  if (proofPackage.product_sha !== config.expectedProductSha) {
    findings.push({
      kind: "stale_product_sha",
      packageId: expectation.packageId,
      expected: config.expectedProductSha,
      actual: String(proofPackage.product_sha)
    });
  }
  if (proofPackage.tree_hash !== config.expectedTreeHash) {
    findings.push({
      kind: "tree_hash_mismatch",
      packageId: expectation.packageId,
      expected: config.expectedTreeHash,
      actual: String(proofPackage.tree_hash)
    });
  }
  if (!proofPackage.exact_product_binding_required) {
    findings.push({ kind: "exact_product_binding_missing", packageId: expectation.packageId });
  }

  if (
    !proofPackage.stale_invalidation?.invalidate_on_product_sha_change ||
    !proofPackage.stale_invalidation?.invalidate_on_tree_hash_change ||
    !proofPackage.stale_invalidation?.invalidate_on_evidence_hash_change
  ) {
    findings.push({ kind: "stale_invalidation_missing", packageId: expectation.packageId });
  }

  if (!proofPackage.redaction?.public_safe) {
    findings.push({ kind: "redaction_not_public_safe", packageId: expectation.packageId });
  }

  for (const cannotClaim of config.requiredCannotClaim ?? []) {
    if (!proofPackage.cannot_claim.includes(cannotClaim)) {
      findings.push({
        kind: "required_cannot_claim_missing",
        packageId: expectation.packageId,
        expected: cannotClaim
      });
    }
  }

  const evidenceByRef = new Map<string, H07ProofEvidence>();
  const evidenceClassesByRef = new Map<string, string>();
  for (const evidence of proofPackage.evidence) {
    const existing = evidenceByRef.get(evidence.ref);
    if (existing && normalizeSha256(existing.sha256) !== normalizeSha256(evidence.sha256)) {
      findings.push({
        kind: "duplicate_evidence_ref_conflicting_hash",
        packageId: expectation.packageId,
        ref: evidence.ref
      });
    }
    evidenceByRef.set(evidence.ref, evidence);
    evidenceClassesByRef.set(evidence.ref, evidence.evidence_class);
    findings.push(...verifyEvidenceEntry(config, expectation, evidence, verifiedRefs));
  }

  const unsupportedClaimClasses = new Set(config.unsupportedClaimClasses ?? []);
  for (const claim of proofPackage.claims) {
    if (claim.status !== "supported") continue;

    if (unsupportedClaimClasses.has(claim.claim_class) || FUTURE_OPERATIONAL_CLAIM_PATTERN.test(claim.claim_class)) {
      findings.push({
        kind: "unsupported_claim_supported",
        packageId: expectation.packageId,
        claimId: claim.claim_id,
        detail: claim.claim_class
      });
    }

    if (claim.evidence_refs.length === 0) {
      findings.push({
        kind: "claim_evidence_missing",
        packageId: expectation.packageId,
        claimId: claim.claim_id
      });
    }

    for (const ref of claim.evidence_refs) {
      if (!evidenceByRef.has(ref)) {
        findings.push({
          kind: "claim_evidence_ref_missing",
          packageId: expectation.packageId,
          claimId: claim.claim_id,
          ref
        });
      }
    }

    for (const evidenceClass of claim.minimum_evidence_classes ?? []) {
      const hasClass = claim.evidence_refs.some((ref) => evidenceClassesByRef.get(ref) === evidenceClass);
      if (!hasClass) {
        findings.push({
          kind: "claim_evidence_class_missing",
          packageId: expectation.packageId,
          claimId: claim.claim_id,
          expected: evidenceClass
        });
      }
    }
  }

  return findings;
}

function verifyEvidenceEntry(
  config: H07ProofPackageConfig,
  expectation: H07ProofPackageExpectation,
  evidence: H07ProofEvidence,
  verifiedRefs: H07VerifiedProofRef[]
): H07ProofPackageFinding[] {
  const findings: H07ProofPackageFinding[] = [];
  const hashFinding = validateSha256(evidence.sha256, "evidence_hash_invalid");
  if (hashFinding) {
    findings.push({ ...hashFinding, packageId: expectation.packageId, ref: evidence.ref });
  }

  if (!evidence.public_safe || evidence.redaction_status !== "public_safe") {
    findings.push({
      kind: "evidence_not_public_safe",
      packageId: expectation.packageId,
      ref: evidence.ref
    });
  }

  const evidencePath = resolveLogicalRef(evidence.ref, config.logicalRoots, findings);
  if (!evidencePath) return findings;
  if (!existsSync(evidencePath)) {
    findings.push({
      kind: "evidence_missing",
      packageId: expectation.packageId,
      ref: evidence.ref,
      path: evidencePath
    });
    return findings;
  }

  const text = readFileSync(evidencePath, "utf8");
  if (containsPrivatePathSignal(text)) {
    findings.push({
      kind: "private_path_in_evidence",
      packageId: expectation.packageId,
      ref: evidence.ref,
      path: evidencePath
    });
  }

  const expectedHash = normalizeSha256(evidence.sha256);
  if (SHA256_PATTERN.test(evidence.sha256) && !PLACEHOLDER_PATTERN.test(evidence.sha256)) {
    const actualHash = sha256Text(text);
    if (actualHash !== expectedHash) {
      findings.push({
        kind: "evidence_hash_mismatch",
        packageId: expectation.packageId,
        ref: evidence.ref,
        path: evidencePath,
        expected: expectedHash,
        actual: actualHash
      });
    } else if (!findings.some((finding) => finding.ref === evidence.ref)) {
      verifiedRefs.push({ ref: evidence.ref, path: evidencePath, sha256: actualHash, source: "evidence" });
    }
  }

  return findings;
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H07ProofPackageFinding[]
): string | null {
  const [scheme, rest] = ref.split("://");
  if (!scheme || rest === undefined) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const root = logicalRoots[scheme];
  if (!root) {
    findings.push({ kind: "logical_root_unknown", ref });
    return null;
  }
  if (rest.includes("\0")) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  if (isAbsolute(rest)) {
    findings.push({ kind: "logical_path_escape", ref });
    return null;
  }
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, normalize(rest));
  const relativePath = relative(resolvedRoot, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    findings.push({ kind: "logical_path_escape", ref, path: resolvedPath });
    return null;
  }
  return resolvedPath;
}

function validateSha256(value: string, invalidKind: string): H07ProofPackageFinding | null {
  if (PLACEHOLDER_PATTERN.test(value) || !SHA256_PATTERN.test(value)) {
    return { kind: invalidKind, actual: value };
  }
  return null;
}

function containsPrivatePathSignal(text: string): boolean {
  if (PRIVATE_PATH_PATTERN.test(text)) return true;
  try {
    return containsSegmentedPrivatePath(JSON.parse(text));
  } catch {
    return false;
  }
}

function containsSegmentedPrivatePath(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      const joined = `/${value.filter((item) => item.length > 0).join("/")}`;
      if (/\/(?:Users|Volumes)\//u.test(joined)) return true;
    }
    return value.some((item) => containsSegmentedPrivatePath(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsSegmentedPrivatePath(item));
  }
  return false;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
